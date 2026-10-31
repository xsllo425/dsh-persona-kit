// Offline test: a fake host that mimics restrict() (agent-scoped, disposable, unknown names throw,
// synchronous tools/change) and agent-scoped prompt sections. Run: node tests/gate.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const home = mkdtempSync(join(tmpdir(), 'tool-gate-'))
// who has which role right now; the kit answers roleOf(sid) from this map
const roles = {}
const setPersona = (map) => { for (const k of Object.keys(roles)) delete roles[k]; for (const [k, v] of Object.entries(map)) roles[k] = v.role }

const listeners = new Map()
const on = (name, cb) => { (listeners.get(name) ?? listeners.set(name, []).get(name)).push(cb) }
const emit = (name, ...args) => { for (const cb of listeners.get(name) ?? []) cb(...args) }
const globalTools = new Set(['read', 'web_search', 'web_fetch', 'computer', 'computer_batch', 'ui_elements', 'visualize', 'image_generate', 'research', 'feed_run', 'feed_status', 'import_chat'])
let registered
const mkAgent = (sid, preset, depth = 0) => {
  const state = { deny: null, sections: new Map() }
  const agent = {
    depth, session: { id: sid, header: { agentPreset: preset } }, state,
    ctx: {
      get(key) {
        if (key === 'tools') return {
          restrict({ deny }) {
            const unknown = deny.filter((n) => !globalTools.has(n))
            if (unknown.length) throw new Error('unknown ' + unknown)
            state.deny = new Set(deny)
            emit('tools/change')
            return () => { state.deny = null; emit('tools/change') }
          },
        }
        if (key === 'systemPrompt') return { section(s) { state.sections.set(s.name, s.text); return () => state.sections.delete(s.name) } }
      },
    },
  }
  agent.visible = () => [...globalTools].filter((n) => !state.deny?.has(n))
  return agent
}
const ctx = {
  logger: { info() {}, warn(m) { console.log('WARN', m) } },
  on, inject(_k, cb) { cb({ agents: { list: () => [] } }) },
  effect(fn) { fn() },
  tools: { register(t) { registered = t; globalTools.add(t.name); return () => {} }, schemas: () => [...globalTools].map((name) => ({ name })) },
}
const { installToolGate } = await import('../lib/toolgate.js')
const fixture = fileURLToPath(new URL('./fixtures/groups.json', import.meta.url))
installToolGate(ctx, { kit: { roleOf: (sid) => roles[sid] || '' }, configFile: fixture, defaultsFile: fixture, storeFile: join(home, 'state.json'), legacyStoreFile: join(home, 'none.json') })
const userMsg = (text) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })

// 1. standard preset + standard persona: heavy groups hidden, web_search/read stay, sections swapped.
setPersona({ s1: { role: 'standard' } })
const a1 = mkAgent('s1', 'standard')
emit('agent/created', { agent: a1 })
assert.deepEqual(a1.visible().sort(), ['enable_tools', 'read', 'web_fetch', 'web_search'])
assert.ok(a1.state.sections.has('computer-use:guide') && a1.state.sections.has('free-search:engines'))

// 2. trigger phrase in the user's message unlocks only that group, before the step (inbox event).
emit('agent/inbox/inserted', { agent: a1, message: userMsg('帮我操控电脑打开记事本') })
assert.ok(a1.visible().includes('computer') && a1.visible().includes('ui_elements'))
assert.ok(!a1.visible().includes('visualize'))
assert.ok(!a1.state.sections.has('computer-use:guide'), 'computer section restored')

// 3. another session is unaffected.
const a2 = mkAgent('s2', 'standard')
emit('agent/created', { agent: a2 })
assert.ok(!a2.visible().includes('computer'))

// 4. enable_tools via the model.
const r = await registered.execute({ groups: ['visualize', 'nope'] }, { agent: a2 })
assert.equal(r.ok, true)
assert.ok(a2.visible().includes('visualize'))

// 5. persona no longer decides tools: switching persona neither opens nor resets anything.
setPersona({ s1: { role: 'standard' }, s2: { role: 'pro', at: 1 } })
emit('agent/inbox/inserted', { agent: a2, message: userMsg('继续') })
assert.ok(!a2.visible().includes('image_generate') && a2.visible().includes('visualize'), 'persona switch changes nothing')
setPersona({ s1: { role: 'standard' }, s2: { role: 'whale', at: 2 } })
emit('agent/inbox/inserted', { agent: a2, message: userMsg('继续') })
assert.ok(a2.visible().includes('visualize'), 'unlock survives a persona switch')
// idle auto-hide: visualize was last used at turn 0; at turn 3 (> idleTurns 2) it is hidden again.
emit('agent/inbox/inserted', { agent: a2, message: userMsg('继续') })
assert.ok(!a2.visible().includes('visualize'), 'idle group hidden again')

// 6. professional / game presets are never gated; subagents ignored.
const a3 = mkAgent('s3', 'professional'); emit('agent/created', { agent: a3 })
assert.equal(a3.state.deny?.has('computer') ?? false, false)
const a4 = mkAgent('s4', 'standard', 1); emit('agent/created', { agent: a4 })
assert.equal(a4.state.deny, null)

// 7. a tool registered later (browser-skill style) gets masked; skill call unlocks it.
globalTools.add('bsk_page'); globalTools.add('bsk_tabs'); emit('tools/change')
assert.ok(!a1.visible().includes('bsk_page'))
emit('session/event', a1.session, { type: 'tool/call', data: { name: 'skill', arguments: JSON.stringify({ name: 'browser-skill' }) } })
assert.ok(a1.visible().includes('bsk_page'))

// 8. prompt-gears wording unlocks visualize but not media.
const a5 = mkAgent('s5', 'standard'); emit('agent/created', { agent: a5 })
emit('agent/inbox/inserted', { agent: a5, message: userMsg('回答时用 visualize 在对话里画一张图或可交互卡片') })
assert.ok(a5.visible().includes('visualize') && !a5.visible().includes('image_generate'))

// 9. unlock records persisted; a resumed agent (new object, same sid) restores them.
const saved = JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'))
assert.deepEqual(saved.sessions.s1.groups.sort(), ['browser', 'computer'])
const a1b = mkAgent('s1', 'standard'); emit('agent/created', { agent: a1b })
assert.ok(a1b.visible().includes('computer') && !a1b.visible().includes('visualize'))

// 10. plugin-injected messages never trigger.
const a6 = mkAgent('s6', 'standard'); emit('agent/created', { agent: a6 })
emit('agent/inbox/inserted', { agent: a6, message: { role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: '操控电脑' }] } })
assert.ok(!a6.visible().includes('computer'))

// 11. no persona record (persona-switcher absent or never used): the DSH mode alone decides.
const a7 = mkAgent('s7', 'standard'); emit('agent/created', { agent: a7 })
assert.ok(!a7.visible().includes('computer') && !a7.visible().includes('visualize'), 'standard mode gates without a persona')
const a8 = mkAgent('s8', 'professional'); emit('agent/created', { agent: a8 })
assert.ok(a8.visible().includes('computer') && !a8.visible().includes('enable_tools'), 'ungated mode: everything open, no enable_tools')

// 12. the old groups.json shape still reads the same.
const { normalizeConfig, hiddenGroups } = await import('../lib/gate.js')
const legacy = normalizeConfig({ gatedPresets: ['standard'], gateWithoutPreset: true, policies: { default: ['g1'], pro: [] }, groups: { g1: { tools: ['x'] } } })
assert.deepEqual(hiddenGroups(legacy, { preset: 'standard', unlocked: [] }), ['g1'])
assert.deepEqual(hiddenGroups(legacy, { preset: 'standard', role: 'pro', unlocked: [] }), [])
assert.deepEqual(hiddenGroups(legacy, { preset: 'hoi4', unlocked: [] }), [])
assert.deepEqual(hiddenGroups(legacy, { preset: undefined, unlocked: [] }), ['g1'])

// 13. using a tool keeps its group open; a user turn mid-task never drops it.
const a9 = mkAgent('s9', 'standard'); emit('agent/created', { agent: a9 })
emit('agent/inbox/inserted', { agent: a9, message: userMsg('帮我操控电脑打开记事本') })
for (let i = 0; i < 5; i++) {
  emit('session/event', a9.session, { type: 'tool/call', data: { name: 'computer', arguments: '{}' } })
  emit('agent/inbox/inserted', { agent: a9, message: userMsg('继续') })
}
assert.ok(a9.visible().includes('computer'), 'a used group stays open')
for (let i = 0; i < 3; i++) emit('agent/inbox/inserted', { agent: a9, message: userMsg('继续') })
assert.ok(!a9.visible().includes('computer'), 'unused group closes after idle turns')

console.log('all 13 checks passed')
