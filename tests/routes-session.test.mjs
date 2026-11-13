import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Sessions reach this plugin in two key shapes: the host's own id is "session-<uuid>", while the role tables
// (and the /sessions map the client reads) key on the bare uuid. /timeline also used to read an undeclared
// `got`, which threw on every call. Both are pinned here.

const home = mkdtempSync(join(tmpdir(), 'routesession-'))
process.env.DSH_HOME = home
mkdirSync(join(home, 'roles', 'alice'), { recursive: true })
writeFileSync(join(home, 'roles', 'alice', 'ROLE.md'), '---\nid: alice\nname: Alice\n---\nYou are Alice.')
writeFileSync(join(home, 'roles', 'alice', 'card.json'), JSON.stringify({ packs: [] }))
mkdirSync(join(home, 'persona-kit'), { recursive: true })
writeFileSync(join(home, 'persona-kit', 'config.json'), JSON.stringify({ roles: { enabled: true, defaultRole: 'alice' } }))
test.after(() => { try { rmSync(home, { recursive: true, force: true }) } catch { /* throw-away folder */ } })

const mod = await import('../lib/index.js')

const user = (seq, text) => ({ type: 'user/message', seq, data: { role: 'user', content: [{ type: 'text', text }] } })
const assistant = (seq, text) => ({ type: 'assistant/message', seq, data: { content: [{ type: 'text', text }] } })

/** One host session whose events are addressable by seq, as the host's sessions service hands them out. */
function fakeSession(id) {
  const events = [user(1, '第一句'), assistant(2, '收到。'), user(3, '第二句'), assistant(4, '好的。')]
  const bySeq = new Map(events.map((e) => [e.seq, e]))
  return {
    id,
    surface: { nodes: events.map((e) => e.seq) },
    eventAt: (seq) => bySeq.get(seq),
  }
}

function apply(routes, sessions) {
  const ctx = {
    logger: { info() {}, warn() {} },
    on() {},
    effect() {},
    get: (key) => (key === 'sessions' ? sessions : undefined),
    inject: (_keys, cb) => cb({ webServer: { register: (r) => { routes.push(r); return () => {} } }, effect: (fn) => fn(), agents: { list: () => [] } }),
    tools: { register: () => () => {}, schemas: () => [] },
    commands: { register: () => () => {} },
  }
  mod.apply(ctx)
}

const call = async (route, url, method = 'GET') => {
  let status = 0
  let out = ''
  const req = Object.assign((async function* () { yield Buffer.from('') })(), { url, method, headers: { host: '127.0.0.1:1' }, socket: { remoteAddress: '127.0.0.1' } })
  await route.handler(req, { writeHead: (s) => { status = s }, end: (t) => { out = t || '' } })
  let json = null
  try { json = JSON.parse(String(out)) } catch { json = null }
  return { status, json }
}

test('/timeline answers instead of throwing on an undeclared variable', async () => {
  const host = fakeSession('session-abc-123')
  const sessions = { get: (id) => (id === 'session-abc-123' ? host : undefined) }
  const routes = []
  apply(routes, sessions)
  const route = routes.find((r) => r.path === '/persona-kit')

  for (const id of ['session-abc-123', 'abc-123']) {
    const r = await call(route, `/persona-kit/timeline?session=${id}`)
    assert.equal(r.status, 200, `timeline for ${id} must not be a 500`)
    assert.equal(r.json.ok, true)
    assert.equal(r.json.turns.length, 2, 'two user turns, one role each')
  }
  const missing = await call(route, '/persona-kit/timeline?session=nope')
  assert.equal(missing.status, 200)
  assert.deepEqual(missing.json.turns, [])
})

test('/probe resolves the bare uuid as well', async () => {
  const host = fakeSession('session-abc-123')
  const sessions = { get: (id) => (id === 'session-abc-123' ? host : undefined) }
  const routes = []
  apply(routes, sessions)
  const route = routes.find((r) => r.path === '/persona-kit')
  const r = await call(route, '/persona-kit/probe?session=abc-123')
  assert.equal(r.json.ok, true)
  assert.ok(Array.isArray(r.json.nodes))
})
