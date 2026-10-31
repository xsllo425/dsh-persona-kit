import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installRoles, parseRole, scanLibrary, formatNotice, createRoleState, PERSONA_SECTION, NOTICE_KIND } from '../lib/roles.js'
import { roleTimeline } from '../lib/timeline.js'

const home = mkdtempSync(join(tmpdir(), 'roles-'))
const dir = join(home, 'roles')
const role = (id, name, body, extra = '') => { mkdirSync(join(dir, id), { recursive: true }); writeFileSync(join(dir, id, 'ROLE.md'), `---\nid: ${id}\nname: ${name}\n${extra}---\n\n${body}\n`) }
role('alice', 'Alice', 'You are Alice, calm and exact.', 'description: the calm one\n')
role('bob', 'Bob', 'You are Bob, loud and fun.')
writeFileSync(join(dir, 'flat.md'), '---\nname: Flat\n---\nYou are Flat.')
test.after(() => rmSync(home, { recursive: true, force: true }))

// ---- a fake host: events, agent-scoped prompt sections, a command registry ----
function host() {
  const listeners = new Map()
  const commands = new Map()
  const ctx = {
    logger: { info() {}, warn() {} },
    on: (name, cb) => { (listeners.get(name) ?? listeners.set(name, []).get(name)).push(cb) },
    inject: (_k, cb) => cb({ agents: { list: () => [] } }),
    effect: (fn) => { const r = fn(); if (r && typeof r.next === 'function') { for (let x = r.next(); !x.done; x = r.next(x.value)) { /* run */ } } },
    commands: { register: (c) => { commands.set(c.name, c); return () => {} } },
  }
  const mkAgent = (sid, depth = 0) => {
    const sections = new Map()
    return { depth, session: { id: sid }, sections, ctx: { get: (k) => (k === 'systemPrompt' ? { section: (s) => { sections.set(s.name, s.text); return () => sections.delete(s.name) } } : undefined) } }
  }
  const emit = async (name, arg) => { for (const cb of listeners.get(name) ?? []) await cb(arg) }
  const step = async (agent, messages = []) => {
    const chain = listeners.get('agent/pre-step') ?? []
    const run = async (i) => (i >= chain.length ? { kind: 'ok', messages } : chain[i]({ agent, messages }, () => run(i + 1)))
    return run(0)
  }
  return { ctx, mkAgent, emit, step, command: (n) => commands.get(n) }
}
const stateFile = (n) => join(home, `state-${n}.json`)
const say = (h, agent, raw) => h.command('role').handler({ agent, rawInput: raw })
const hasNotice = (out) => out.messages.some((m) => m.source?.kind === NOTICE_KIND)

test('role files parse, with or without a frontmatter id, and bad ones are skipped', () => {
  assert.equal(parseRole('---\nid: x\nname: X\n---\nbody', 'f').id, 'x')
  assert.equal(parseRole('no frontmatter at all', 'plain').id, 'plain')
  assert.equal(parseRole('---\nid: x\n---\n', 'f'), null) // no text, no role
  assert.equal(parseRole('---\nid: ../evil\n---\nbody', 'f'), null)
  assert.deepEqual(scanLibrary(dir).map((r) => r.id), ['alice', 'bob', 'flat'])
})

test('a new session gets the default role in step one, and it is remembered', async () => {
  const h = host(); const f = stateFile('a')
  installRoles(h.ctx, { rolesDir: dir, stateFile: f, defaultRole: 'alice' })
  const a = h.mkAgent('s1'); await h.emit('agent/created', { agent: a })
  assert.equal(a.sections.get(PERSONA_SECTION), 'You are Alice, calm and exact.')
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).sessions.s1.role, 'alice')
})

test('/role switches only the persona, announces it once, and the notice reads back as a role change', async () => {
  const h = host(); const f = stateFile('b')
  installRoles(h.ctx, { rolesDir: dir, stateFile: f, defaultRole: 'alice' })
  const a = h.mkAgent('s2'); await h.emit('agent/created', { agent: a })
  const r = await say(h, a, 'bob')
  assert.equal(r.kind, 'success'); assert.match(r.text, /Switched this session from "alice" to "bob"/)
  assert.equal(a.sections.get(PERSONA_SECTION), 'You are Bob, loud and fun.')
  const user = { role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }
  const out = await h.step(a, [user])
  const notice = out.messages.find((m) => m.source?.kind === NOTICE_KIND)
  assert.ok(notice); assert.equal(notice.source.form, 'role-change'); assert.equal(notice.source.from, 'alice'); assert.equal(notice.source.to, 'bob')
  assert.equal(out.messages.indexOf(notice), out.messages.indexOf(user) + 1) // right after the user's message, before the reply
  assert.equal(hasNotice(await h.step(a, [user])), false) // once
  // the log replays into the same timeline the avatars use
  const events = [{ type: 'user/message', seq: 1, data: user }, { type: 'user/message', seq: 2, data: notice }, { type: 'assistant/message', seq: 3, data: {} }]
  assert.deepEqual(roleTimeline(events, 'bob'), ['bob'])
})

test('/role none, list, default and mistakes', async () => {
  const h = host()
  installRoles(h.ctx, { rolesDir: dir, stateFile: stateFile('c'), defaultRole: 'alice' })
  const a = h.mkAgent('s3'); await h.emit('agent/created', { agent: a })
  assert.match((await say(h, a, 'list')).text, /\* alice: Alice — the calm one/)
  assert.match((await say(h, a, '')).text, /current session role: alice/)
  assert.equal((await say(h, a, 'nobody')).kind, 'error')
  const none = await say(h, a, 'none')
  assert.match(none.text, /deployment persona again/)
  assert.match(a.sections.get(PERSONA_SECTION), /No role is active/)
  assert.match((await say(h, a, 'default bob')).text, /Default role for new sessions: "bob"/)
  assert.equal((await say(h, a, 'default ghost')).kind, 'error')
})

test('after a restart the remembered role comes back; a chosen "none" is not reclaimed by the default', async () => {
  const f = stateFile('d')
  let h = host(); installRoles(h.ctx, { rolesDir: dir, stateFile: f, defaultRole: 'alice' })
  const a = h.mkAgent('s4'); await h.emit('agent/created', { agent: a }); await say(h, a, 'bob')
  const b = h.mkAgent('s5'); await h.emit('agent/created', { agent: b }); await say(h, b, 'none')
  h = host(); installRoles(h.ctx, { rolesDir: dir, stateFile: f, defaultRole: 'alice' }) // "restart"
  const a2 = h.mkAgent('s4'); await h.emit('agent/created', { agent: a2 })
  const b2 = h.mkAgent('s5'); await h.emit('agent/created', { agent: b2 })
  assert.equal(a2.sections.get(PERSONA_SECTION), 'You are Bob, loud and fun.')
  assert.match(b2.sections.get(PERSONA_SECTION), /No role is active/)
  assert.equal(hasNotice(await h.step(a2, [])), false) // restoring is silent
})

test('a remembered role that left the library falls back and says so', async () => {
  const f = stateFile('e'); createRoleState(f).set('s6', 'gone')
  const h = host(); installRoles(h.ctx, { rolesDir: dir, stateFile: f, defaultRole: 'alice' })
  const a = h.mkAgent('s6'); await h.emit('agent/created', { agent: a })
  assert.equal(a.sections.get(PERSONA_SECTION), 'You are Alice, calm and exact.')
  const n = (await h.step(a, [])).messages.find((m) => m.source?.kind === NOTICE_KIND)
  assert.equal(n.source.from, 'gone'); assert.equal(n.source.to, 'alice')
})

test('delegated sub-agents are left alone', async () => {
  const h = host(); installRoles(h.ctx, { rolesDir: dir, stateFile: stateFile('f'), defaultRole: 'alice' })
  const child = h.mkAgent('s7', 1); await h.emit('agent/created', { agent: child })
  assert.equal(child.sections.size, 0)
})

test('notice wording: names both sides, and is silent when nothing changed', () => {
  assert.equal(formatNotice('a', 'a'), '')
  assert.match(formatNotice('a', 'b'), /from role "a" to role "b"/)
  assert.match(formatNotice('a', null), /back to the deployment persona/)
  assert.match(formatNotice(null, 'b'), /switched to role "b"/)
})
