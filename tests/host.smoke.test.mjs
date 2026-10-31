import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// a throw-away DSH_HOME with one role, so the whole host half can start for real
const home = mkdtempSync(join(tmpdir(), 'hostsmoke-'))
process.env.DSH_HOME = home
mkdirSync(join(home, 'roles', 'alice'), { recursive: true })
writeFileSync(join(home, 'roles', 'alice', 'ROLE.md'), '---\nid: alice\nname: Alice\n---\nYou are Alice.')
writeFileSync(join(home, 'roles', 'alice', 'card.json'), JSON.stringify({ packs: [] }))
mkdirSync(join(home, 'persona-kit'), { recursive: true })
writeFileSync(join(home, 'persona-kit', 'config.json'), JSON.stringify({ roles: { enabled: true, defaultRole: 'alice' } }))
test.after(() => rmSync(home, { recursive: true, force: true }))

const mod = await import('../lib/index.js')

function fakeHost() {
  const tools = []
  const commands = []
  const routes = []
  const listeners = []
  const ctx = {
    logger: { info() {}, warn() {} },
    on: (name, cb) => listeners.push(name),
    get: () => undefined,
    effect: (fn) => { const r = fn(); if (r && typeof r.next === 'function') for (let x = r.next(); !x.done; x = r.next(x.value)) { /* run */ } },
    inject: (_keys, cb) => cb({ webServer: { register: (r) => { routes.push(r); return () => {} } }, effect: (fn) => fn(), agents: { list: () => [] } }),
    tools: { register: (t) => { tools.push(t.name); return () => {} }, schemas: () => [] },
    commands: { register: (c) => { commands.push(c.name); return () => {} } },
  }
  return { ctx, tools, commands, routes, listeners }
}
const call = async (route, { url, method = 'GET', headers = {}, body }) => {
  let status = 0
  let out = ''
  const req = Object.assign((async function* () { if (body) yield Buffer.from(JSON.stringify(body)) })(), { url, method, headers: { host: '127.0.0.1:1234', ...headers }, socket: { remoteAddress: '127.0.0.1' } })
  const res = { writeHead: (s) => { status = s }, end: (t) => { out = t || '' } }
  await route.handler(req, res)
  return { status, json: out ? JSON.parse(out) : null }
}

test('the plugin asks the host for the services it uses (a missing one silently drops a feature)', () => {
  for (const s of ['tools', 'commands']) assert.ok(mod.inject.includes(s), `inject must list ${s}`)
})

test('apply() starts the whole host half: tools, the /role command, routes, event listeners', () => {
  const h = fakeHost()
  mod.apply(h.ctx)
  assert.ok(h.tools.includes('send_sticker'))
  assert.ok(h.tools.includes('handoff_new_session'))
  assert.ok(!h.tools.includes('enable_tools'), 'no tool groups configured: the gate stays out of the way')
  assert.deepEqual(h.commands, ['role'])
  assert.ok(h.routes.some((r) => r.path === '/persona-kit'))
  for (const ev of ['agent/created', 'agent/inbox/inserted', 'agent/pre-step', 'session/event']) assert.ok(h.listeners.includes(ev), ev)
})

test('the routes answer local requests and refuse anything that came through a proxy or from another site', async () => {
  const h = fakeHost()
  mod.apply(h.ctx)
  const route = h.routes.find((r) => r.path === '/persona-kit')
  const ok = await call(route, { url: '/persona-kit/roles' })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.json.roles.map((r) => r.id), ['alice'])
  assert.equal((await call(route, { url: '/persona-kit/roles', headers: { 'x-forwarded-for': '1.2.3.4' } })).status, 403)
  assert.equal((await call(route, { url: '/persona-kit/roles', headers: { origin: 'https://evil.example' } })).status, 403)
  assert.equal((await call(route, { url: '/persona-kit/roles', headers: { host: 'evil.example' } })).status, 403)
  assert.equal((await call(route, { url: '/persona-kit/nope' })).status, 404)
  assert.equal((await call(route, { url: '/persona-kit/avatar-upload?target=role:../x', method: 'POST', body: {} })).status, 422)
})

test('a body that is not JSON is a 422, not a server error', async () => {
  const h = fakeHost()
  mod.apply(h.ctx)
  const route = h.routes.find((r) => r.path === '/persona-kit')
  let status = 0
  const req = Object.assign((async function* () { yield Buffer.from('{ not json') })(), { url: '/persona-kit/level', method: 'POST', headers: { host: '127.0.0.1:1' }, socket: { remoteAddress: '127.0.0.1' } })
  await route.handler(req, { writeHead: (s) => { status = s }, end() {} })
  assert.equal(status, 422)
})

test('the avatar-settings answer carries what the sidebar needs even when no chat is open', async () => {
  const h = fakeHost()
  mod.apply(h.ctx)
  const route = h.routes.find((r) => r.path === '/persona-kit')
  const set = await call(route, { url: '/persona-kit/avatar-settings', method: 'POST', body: { account: true, accountName: '  测试  ' } })
  assert.equal(set.json.settings.account, true)
  assert.equal(set.json.settings.accountName, '测试')
  const got = await call(route, { url: '/persona-kit/avatar-settings' })
  assert.equal(got.json.settings.accountName, '测试')
  assert.equal(got.json.userAvatar, '') // no picture chosen yet
})

test('a brand-new, empty DSH home starts cleanly and answers sensibly', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'emptyhome-'))
  const keep = process.env.DSH_HOME
  process.env.DSH_HOME = empty
  try {
    const m2 = await import('../lib/index.js?empty=' + Date.now())
    const h = fakeHost()
    m2.apply(h.ctx)
    const route = h.routes.find((r) => r.path === '/persona-kit')
    assert.deepEqual((await call(route, { url: '/persona-kit/roles' })).json.roles, [])
    const s = await call(route, { url: '/persona-kit/session?session=session-new' })
    assert.equal(s.status, 200)
    assert.equal(s.json.roleId, '') // no role, no crash
    assert.equal((await call(route, { url: '/persona-kit/stats' })).json.roles.length, 0)
    assert.equal((await call(route, { url: '/persona-kit/achievements?role=' })).json.ok, true)
    assert.equal((await call(route, { url: '/persona-kit/avatar-settings' })).json.settings.account, false)
  } finally { process.env.DSH_HOME = keep; rmSync(empty, { recursive: true, force: true }) }
})
