import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installHandoff, TOOL_NAME, notice, noticePlain } from '../lib/handoff.js'
import { setLang } from '../lib/lang.js'

function setup({ controller } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ho-'))
  const tools = []
  const handlers = []
  const rebirths = []
  const services = { sessionController: controller, tokenMeter: { measure: () => ({ totalTokens: 400_000 }) } }
  const ctx = {
    logger: {},
    get: (k) => services[k],
    on: (name, fn) => handlers.push([name, fn]),
    effect: (fn) => { tools.push(fn()) },
    tools: { register: (t) => t },
  }
  const kit = { roleOf: (sid) => (sid === 'withrole' ? 'alice' : ''), store: { setTokens() {} } }
  installHandoff(ctx, { kit, triggerTokens: 300_000, dir, onRebirth: (p, c) => rebirths.push([p, c]) })
  return { dir, tool: tools[0], pre: handlers.find(([n]) => n === 'agent/pre-step')[1], rebirths }
}

test('the notice differs for sessions with and without a role, and fires once', async () => {
  const { dir, pre } = setup()
  const run = (sid) => pre({ agent: { session: { id: sid } }, signal: {} }, async () => ({ kind: 'continue', messages: [] }))
  const a = await run('withrole')
  assert.match(a.messages[0].content[0].text, /转生/)
  const b = await run('plain')
  assert.doesNotMatch(b.messages[0].content[0].text, /转生/)
  const again = await run('withrole')
  assert.equal(again.messages.length, 0)
  assert.ok(notice().includes(TOOL_NAME) && noticePlain().includes(TOOL_NAME))
  setLang('en')
  assert.match(notice(), /rebirth/i)
  assert.ok(notice().includes(TOOL_NAME) && noticePlain().includes(TOOL_NAME))
  assert.doesNotMatch(noticePlain(), /rebirth/i)
  setLang('zh')
  rmSync(dir, { recursive: true, force: true })
})

test('the tool refuses a thin summary and records a rebirth on success', async () => {
  const controller = { create: async () => ({ sessionId: 'child-1' }), prompt: async () => {}, cancel: async () => {} }
  const { dir, tool, rebirths } = setup({ controller })
  assert.equal((await tool.execute({ summary: 'x' }, { agent: { session: { id: 'p1' } } })).ok, false)
  assert.equal(rebirths.length, 0)
  const ok = await tool.execute({ summary: '目标：把表情包整理好。已完成：全部。下一步：无。' }, { agent: { session: { id: 'p1', header: {} } } })
  assert.equal(ok.ok, true)
  assert.deepEqual(rebirths, [['p1', 'child-1']])
  rmSync(dir, { recursive: true, force: true })
})

test('a failed session creation records nothing', async () => {
  const controller = { create: async () => { throw new Error('boom') }, prompt: async () => {}, cancel: async () => {} }
  const { dir, tool, rebirths } = setup({ controller })
  const r = await tool.execute({ summary: '目标：x，已完成：y，下一步：z，足够长的说明。' }, { agent: { session: { id: 'p2' } } })
  assert.equal(r.ok, false)
  assert.equal(rebirths.length, 0)
  rmSync(dir, { recursive: true, force: true })
})
