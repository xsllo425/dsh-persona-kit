import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installHandoff, TOOL_NAME, notice, noticePlain } from '../lib/handoff.js'
import { setLang } from '../lib/lang.js'

function setup(opts = {}) {
  return setupInto(mkdtempSync(join(tmpdir(), 'ho-')), opts)
}

/** Install against an existing state directory, so a pre-seeded `asked.json` is read at start-up. */
function setupInto(dir, { controller, tokens = 400_000, meter = true, projection = null } = {}) {
  const tools = []
  const handlers = []
  const rebirths = []
  const logs = []
  const state = { tokens }
  const services = { sessionController: controller }
  if (meter) services.tokenMeter = { measure: () => ({ totalTokens: state.tokens }) }
  if (projection) services.sessionProjections = { stateOf: (_session, key) => projection[key] }
  const logger = {}
  for (const level of ['info', 'warn', 'error']) logger[level] = (msg) => logs.push([level, msg])
  const ctx = {
    logger,
    get: (k) => services[k],
    on: (name, fn) => handlers.push([name, fn]),
    effect: (fn) => { tools.push(fn()) },
    tools: { register: (t) => t },
  }
  const kit = { roleOf: (sid) => (sid === 'withrole' ? 'alice' : ''), store: { setTokens() {} } }
  installHandoff(ctx, { kit, triggerTokens: 400_000, secondTriggerTokens: 500_000, dir, onRebirth: (p, c) => rebirths.push([p, c]) })
  const pre = handlers.find(([n]) => n === 'agent/pre-step')[1]
  // measuring is throttled to every 4th step, so a round of four calls is one measurement window.
  // The session object must stay the same across calls: the step counter is keyed by it.
  // Whatever a window decides lands on the step that measured, so return the window's non-empty decision.
  const sessions = new Map()
  const measure = async (sid) => {
    let session = sessions.get(sid)
    if (session === undefined) { session = { id: sid }; sessions.set(sid, session) }
    let last = { kind: 'continue', messages: [] }
    for (let i = 0; i < 4; i++) {
      const decision = await pre({ agent: { session }, signal: {} }, async () => ({ kind: 'continue', messages: [] }))
      if (decision.messages.length > 0) last = decision
    }
    return last
  }
  return { dir, tool: tools[0], pre, measure, rebirths, logs, state }
}

test('the notice differs for sessions with and without a role', async () => {
  const { dir, measure } = setup()
  const a = await measure('withrole')
  assert.match(a.messages[0].content[0].text, /转生/)
  const b = await measure('plain')
  assert.doesNotMatch(b.messages[0].content[0].text, /转生/)
  assert.ok(notice().includes(TOOL_NAME) && noticePlain().includes(TOOL_NAME))
  setLang('en')
  assert.match(notice(), /rebirth/i)
  assert.ok(notice().includes(TOOL_NAME) && noticePlain().includes(TOOL_NAME))
  assert.doesNotMatch(noticePlain(), /rebirth/i)
  setLang('zh')
  rmSync(dir, { recursive: true, force: true })
})

test('the first notice fires at the trigger and stays quiet below it', async () => {
  const { dir, measure, state } = setup({ tokens: 399_000 })
  assert.equal((await measure('s1')).messages.length, 0)
  state.tokens = 400_000
  assert.equal((await measure('s1')).messages.length, 1)
  assert.equal((await measure('s1')).messages.length, 0) // never twice for the same threshold
  rmSync(dir, { recursive: true, force: true })
})

test('a second, firmer notice fires at the second threshold and then stops', async () => {
  const { dir, measure, state } = setup({ tokens: 400_000 })
  const first = await measure('s2')
  assert.equal(first.messages.length, 1)
  assert.match(first.messages[0].content[0].text, /（上下文提醒）/)

  state.tokens = 499_000
  assert.equal((await measure('s2')).messages.length, 0) // between the two thresholds: nothing

  state.tokens = 500_000
  const second = await measure('s2')
  assert.equal(second.messages.length, 1)
  assert.match(second.messages[0].content[0].text, /第二次/)

  state.tokens = 900_000
  assert.equal((await measure('s2')).messages.length, 0) // the budget is two, then silence
  rmSync(dir, { recursive: true, force: true })
})

test('with neither a meter nor a projection it warns once instead of failing silently', async () => {
  const { dir, measure, logs } = setup({ meter: false })
  assert.equal((await measure('s3')).messages.length, 0)
  await measure('s3')
  const warnings = logs.filter(([level]) => level === 'warn')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0][1], /cannot measure context tokens/)
  rmSync(dir, { recursive: true, force: true })
})

test('without any projection the lifetime totals still fire the notice', async () => {
  const projection = { tokenUsage: { totals: { uncachedInputTokens: 300_000, cacheReadTokens: 90_000, outputTokens: 20_000 } } }
  const { dir, measure } = setup({ meter: false, projection })
  // last-resort path: 410k of tokens, over the first threshold (400k), no meter and no context pressure
  assert.equal((await measure('s3')).messages.length, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('a near-empty context stays quiet even when the lifetime totals are huge', async () => {
  // a long session accumulates hundreds of millions of lifetime tokens while its context sits far below the line
  const projection = {
    contextPressure: { pressureTokens: 172_388, contextWindow: 1_048_576 },
    tokenUsage: { totals: { uncachedInputTokens: 14_762_838, cacheReadTokens: 175_049_472, outputTokens: 315_857 } },
  }
  const { dir, measure } = setup({ meter: false, projection })
  assert.equal((await measure('s3')).messages.length, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('a full context fires on the context pressure number, not on the lifetime totals', async () => {
  const projection = {
    contextPressure: { pressureTokens: 420_000, contextWindow: 1_048_576 },
    tokenUsage: { totals: { uncachedInputTokens: 1_000, cacheReadTokens: 1_000, outputTokens: 1_000 } },
  }
  const { dir, measure, logs } = setup({ meter: false, projection })
  assert.equal((await measure('s3')).messages.length, 1)
  const info = logs.filter(([level]) => level === 'info').map(([, msg]) => msg).join('\n')
  assert.match(info, /measured via contextPressure/)
  rmSync(dir, { recursive: true, force: true })
})

test('a notice count file survives a restart and older id lists read as one notice', async () => {
  const { dir, measure } = setup({ tokens: 400_000 })
  await measure('s4')
  const file = join(dir, 'asked.json')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { s4: 1 })

  // an older version wrote a plain array of ids: that must count as one notice already sent.
  // The file has to be in place before the plugin starts, so write it and then install.
  const dir2 = mkdtempSync(join(tmpdir(), 'ho-'))
  writeFileSync(join(dir2, 'asked.json'), JSON.stringify(['s5']), 'utf8')
  const second = setupInto(dir2, { tokens: 400_000 })
  assert.equal((await second.measure('s5')).messages.length, 0, 'a legacy entry means the first notice was already sent')
  second.state.tokens = 500_000
  assert.equal((await second.measure('s5')).messages.length, 1, 'the second notice can still fire')
  rmSync(dir, { recursive: true, force: true })
  rmSync(dir2, { recursive: true, force: true })
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
