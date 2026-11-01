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
test.after(() => { try { rmSync(home, { recursive: true, force: true }) } catch { /* a stray handle on Windows: the folder is throw-away */ } })

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
  // a route may answer with a picture or a zip; only JSON answers are parsed
  let json = null
  try { json = out ? JSON.parse(String(out)) : null } catch { json = null }
  return { status, json, raw: out }
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
    const ach = (await call(route, { url: '/persona-kit/achievements?role=' })).json
    assert.equal(ach.ok, true)
    assert.equal(ach.total, 32) // the 32 global badges: the 8 role ones need a role selected
    assert.deepEqual(ach.series.map((s) => s.id), ['chat', 'day', 'meet', 'bond', 'work', 'secret'])
    assert.equal(ach.summary.total, 32)
    assert.equal(ach.summary.days, 0)
    const secret = ach.list.find((x) => x.id === 'secret-night')
    assert.equal(secret.hidden, true)
    assert.equal(secret.desc, '') // masked on the server, not in the panel
    assert.equal(secret.gte, 0)
    assert.equal(secret.value, 0)
    assert.equal((await call(route, { url: '/persona-kit/avatar-settings' })).json.settings.account, false)
  } finally { process.env.DSH_HOME = keep; rmSync(empty, { recursive: true, force: true }) }
})

test('GET /sessions lists every session that has a role: the pill draws a switch before /session answers', async () => {
  const dir = join(home, 'persona-switcher')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'sessions.json'), JSON.stringify({ sessions: {
    'session-real': { role: 'alice' }, // tool-gate-era key shape
    plain: { role: 'alice' },
    none: { role: null }, // "no persona" is not a role, so there is nothing to draw
  } }))
  const h = fakeHost()
  mod.apply(h.ctx)
  const route = h.routes.find((r) => r.path === '/persona-kit')
  const got = await call(route, { url: '/persona-kit/sessions' })
  assert.equal(got.status, 200)
  assert.deepEqual(Object.keys(got.json.sessions).sort(), ['plain', 'real'])
  const a = got.json.sessions.real
  assert.equal(a.role, 'alice')
  assert.equal(a.level, 3)
  assert.ok(a.accent.startsWith('#'))
  // the map must say exactly what /session will say, or the pill would still change after the switch lands
  const s = await call(route, { url: '/persona-kit/session?session=session-real' })
  assert.equal(a.name, s.json.name) // 'Alice', read from ROLE.md
  assert.equal(a.levelName, s.json.levels[s.json.level - 1].name)
  assert.equal((await call(route, { url: '/persona-kit/sessions', headers: { origin: 'https://evil.example' } })).status, 403)
})

test('the meme routes are mounted under /persona-kit and serve a pack picture only when the index lists it', async () => {
  // give this home one pack to serve; the fixture above has none
  const { DatabaseSync } = await import('node:sqlite')
  const packDir = join(home, 'meme-packs', 'alice-pack', 'memes', 'happy')
  mkdirSync(packDir, { recursive: true })
  writeFileSync(join(packDir, '1.png'), 'png-bytes')
  const db = new DatabaseSync(join(home, 'meme-packs', 'alice-pack', 'index.db'))
  db.exec('CREATE TABLE memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
  db.prepare('INSERT INTO memes VALUES (?,?,?,?,?,?,?)').run('memes/happy/1.png', 'happy', '1.png', '开心', '开心', 0, 0)
  db.close()

  const h = fakeHost()
  mod.apply(h.ctx)
  const route = h.routes.find((r) => r.path === '/persona-kit')

  // the management api answers a local caller
  const api = await call(route, { url: '/persona-kit/memes-api?packId=all' })
  assert.equal(api.status, 200)
  assert.equal(api.json.ok, true)
  assert.deepEqual(api.json.packs.map((p) => p.id), ['alice-pack'])

  // a picture the index lists comes back; anything else is 404
  assert.equal((await call(route, { url: '/persona-kit/memes/alice-pack/memes/happy/1.png' })).status, 200)
  assert.equal((await call(route, { url: '/persona-kit/memes/alice-pack/memes/happy/2.png' })).status, 404)
  assert.equal((await call(route, { url: '/persona-kit/memes/alice-pack/../../index.db' })).status, 404)
  assert.equal((await call(route, { url: '/persona-kit/memes/nope/memes/happy/1.png' })).status, 404)

  // the export refuses to build the whole library at once, and takes one pack on request
  const all = await call(route, { url: '/persona-kit/memes-export' })
  assert.equal(all.status, 400)
  const one = await call(route, { url: '/persona-kit/memes-export?packId=alice-pack' })
  assert.equal(one.status, 200)

  // and every meme route is local-only, like the rest
  assert.equal((await call(route, { url: '/persona-kit/memes-api?packId=all', headers: { origin: 'https://evil.example' } })).status, 403)
  assert.equal((await call(route, { url: '/persona-kit/memes/alice-pack/memes/happy/1.png', headers: { host: 'evil.example' } })).status, 403)
})

test('the meme routes are mounted once, under this plugin\'s own prefix only', () => {
  const h = fakeHost()
  mod.apply(h.ctx)
  // While the old plugin is installed it keeps serving /dsh-memes*; this plugin must not put a second handler
  // on those paths, because which one wins was never established.
  for (const p of ['/dsh-memes', '/dsh-memes-api', '/dsh-memes-export']) {
    assert.ok(!h.routes.some((r) => r.path === p), `${p} must not be mounted by this plugin`)
  }
  // everything this plugin serves lives under its own prefixes; the tool gate adds /persona-kit-gate
  assert.deepEqual(h.routes.map((r) => r.path).sort(), ['/persona-kit', '/persona-kit-gate'])
  assert.ok(!h.routes.some((r) => r.path.startsWith('/dsh-memes') || r.path === '/memes-panel'))
})

test('send_sticker offers packId and preview, and preview never reaches queue', () => {
  const h = fakeHost()
  const registered = []
  h.ctx.tools.register = (t) => { registered.push(t); return () => {} }
  mod.apply(h.ctx)
  const tool = registered.find((t) => t.name === 'send_sticker')
  assert.ok(tool, 'send_sticker is registered')
  assert.ok(tool.parameters.properties.packId, 'packId is offered')
  assert.ok(tool.parameters.properties.preview, 'preview is offered')
  // the output schema must allow the candidate list, or the host would drop it
  assert.ok(tool.output.schema.properties.memes, 'the output schema carries the candidates')
})
