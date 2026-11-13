import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, utimesSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createMemeApi, createMemeSettings, listPacks } from '../lib/meme-api.js'
import { zipStore } from '../lib/memes.js'

// Each test gets a throw-away DSH home with its own copy of the fixture packs, so an upload or an import
// in one test cannot leak into the next.
let ctx = null
const dshHome = () => ctx.home
const kitHome = () => join(ctx.home, 'persona-kit')

function makePack(packsDir, id, rows, meta) {
  const dir = join(packsDir, id)
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'index.db'))
  db.exec('CREATE TABLE memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
  for (const r of rows) {
    const full = join(dir, r.path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, r.bytes || ('bytes of ' + r.path))
    db.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(r.path, r.tag || 'happy', r.path.split('/').pop(), r.caption || '', r.keywords || '', 1, 1)
  }
  db.close()
  if (meta) writeFileSync(join(dir, 'manifest.json'), JSON.stringify(meta))
  return dir
}

/** A fresh home with the standard two packs. Returns the context the handlers are built from. */
function freshHome() {
  const home = mkdtempSync(join(tmpdir(), 'memeapi-'))
  const packsDir = join(home, 'meme-packs')
  makePack(packsDir, 'alpha', [
    { path: 'memes/happy/a1.webp', tag: 'happy', caption: '开心', keywords: '猫' },
    { path: 'memes/sad/a2.webp', tag: 'sad', caption: '难过', keywords: '狗' },
  ], { id: 'alpha', name: 'Alpha Pack' })
  makePack(packsDir, 'beta', [{ path: 'memes/happy/b1.webp', caption: '比心', keywords: '心' }])
  // a file inside the pack that is NOT in its index: it must stay unreachable
  writeFileSync(join(packsDir, 'alpha', 'secret.txt'), 'not in the index')
  return { home, packsDir }
}

test.beforeEach(() => { ctx = freshHome() })
test.afterEach(() => { try { rmSync(ctx.home, { recursive: true, force: true }) } catch { /* a stray handle on Windows: the folder is throw-away */ } })

const api = () => createMemeApi({ packsDir: ctx.packsDir, dshHome, kitHome })

/** Drive a handler the way the host does: a loopback socket, a Host header, an optional body. */
function req(handler, { url = '/', method = 'GET', body, host = '127.0.0.1:1234', remote = '127.0.0.1', origin } = {}) {
  const payload = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  const request = {
    url, method,
    headers: { host, ...(origin ? { origin } : {}) },
    socket: { remoteAddress: remote },
    on(event, cb) {
      if (event === 'data') for (const chunk of payload) cb(chunk)
      if (event === 'end') cb()
    },
  }
  let status = 0
  const headers = {}
  const out = []
  const res = {
    writeHead(s, h) { status = s; Object.assign(headers, h || {}) },
    end(t) { if (t !== undefined) out.push(Buffer.isBuffer(t) ? t : Buffer.from(String(t))) },
  }
  return Promise.resolve(handler(request, res)).then(() => ({
    status,
    headers,
    body: Buffer.concat(out).toString('utf8'),
    bytes: Buffer.concat(out),
  }))
}

const post = (handler, body, opts = {}) => req(handler, { method: 'POST', body, ...opts })

test('the image route serves only paths the pack index lists', async () => {
  const image = api().image('/persona-kit/memes')
  let r = await req(image, { url: '/persona-kit/memes/alpha/memes/happy/a1.webp' })
  assert.equal(r.status, 200)
  assert.equal(r.headers['content-type'], 'image/webp')
  assert.equal(r.body, 'bytes of memes/happy/a1.webp')

  // a real file inside the pack that the index does not list
  r = await req(image, { url: '/persona-kit/memes/alpha/secret.txt' })
  assert.equal(r.status, 404)

  // traversal, absolute paths and a sibling pack all answer 404 without a special case
  for (const bad of [
    '/persona-kit/memes/alpha/../beta/memes/happy/b1.webp',
    '/persona-kit/memes/alpha/memes/happy/../../secret.txt',
    '/persona-kit/memes/alpha//etc/passwd',
    '/persona-kit/memes/alpha/%2e%2e/%2e%2e/etc/passwd',
    '/persona-kit/memes/nosuchpack/memes/happy/a1.webp',
  ]) {
    assert.equal((await req(image, { url: bad })).status, 404, bad)
  }

  // a broken escape is "not found", never a 500
  assert.equal((await req(image, { url: '/persona-kit/memes/alpha/%E5%A' })).status, 404)

  // no pack prefix falls back to the active pack (pre-merge urls keep working)
  r = await req(image, { url: '/persona-kit/memes/memes/happy/a1.webp' })
  assert.equal(r.status, 200)
})

test('a symbolic link inside a pack is not followed even when the index lists it', async () => {
  const dir = makePack(ctx.packsDir, 'linked', [{ path: 'memes/happy/l1.webp' }])
  const outside = join(ctx.home, 'outside.txt')
  writeFileSync(outside, 'outside')
  try { symlinkSync(outside, join(dir, 'memes/happy/evil.webp')) } catch { return /* no symlink rights: nothing to prove */ }
  const db = new DatabaseSync(join(dir, 'index.db'))
  db.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('memes/happy/evil.webp', 'happy', 'evil.webp', '', '', 1, 1)
  db.close()
  const r = await req(api().image('/persona-kit/memes'), { url: '/persona-kit/memes/linked/memes/happy/evil.webp' })
  assert.equal(r.status, 404)
})

test('the management api answers loopback callers only', async () => {
  const handler = api().api
  for (const opts of [
    { remote: '10.0.0.9' },
    { host: 'evil.example.com' },
    { origin: 'https://evil.example.com' },
    { headersProxy: true },
  ]) {
    if (opts.headersProxy) {
      // a request that came through a proxy is refused as well
      const request = { url: '/', method: 'GET', headers: { host: '127.0.0.1:1234', 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '127.0.0.1' }, on() {} }
      let status = 0
      const res = { writeHead(s) { status = s }, end() {} }
      await handler(request, res)
      assert.equal(status, 403)
      continue
    }
    const r = await req(handler, opts)
    assert.equal(r.status, 403, JSON.stringify(opts))
  }
  const ok = await req(handler, { url: '/persona-kit/memes-api?packId=all' })
  assert.equal(ok.status, 200)
})

test('one pack can be listed, filtered and searched; all packs come back with their pack in the url', async () => {
  const handler = api().api
  let r = await req(handler, { url: '/persona-kit/memes-api?packId=alpha' })
  let j = JSON.parse(r.body)
  assert.equal(j.total, 2)
  assert.deepEqual(j.memes.map((m) => m.url).sort(), ['alpha/memes/happy/a1.webp', 'alpha/memes/sad/a2.webp'])

  r = await req(handler, { url: '/persona-kit/memes-api?packId=alpha&tag=sad' })
  assert.equal(JSON.parse(r.body).total, 1)

  r = await req(handler, { url: '/persona-kit/memes-api?packId=alpha&q=' + encodeURIComponent('难过') })
  assert.equal(JSON.parse(r.body).total, 1)

  r = await req(handler, { url: '/persona-kit/memes-api?packId=all' })
  j = JSON.parse(r.body)
  assert.equal(j.total, 3)
  assert.ok(j.memes.every((m) => m.pack && m.url.startsWith(m.pack + '/')))
})

test('a pack id that does not exist is refused instead of answered with the active pack', async () => {
  const handler = api().api
  // a typo must not look like a perfectly good gallery of the wrong pictures
  const bad = await req(handler, { url: '/persona-kit/memes-api?packId=../../etc' })
  assert.equal(bad.status, 400)
  assert.match(bad.body, /unknown pack/)
  assert.equal((await req(handler, { url: '/persona-kit/memes-api?packId=no-such-pack' })).status, 400)
  // no packId at all still means "the active one", which is what the picker sends on its first load
  assert.equal((await req(handler, { url: '/persona-kit/memes-api' })).status, 200)
})

test('turning a pack off takes it out of what the model can draw from', async () => {
  const a = api()
  // both packs start enabled: the active one is the default
  let r = await post(a.api, { op: 'setPackEnabled', packId: 'beta', enabled: true })
  assert.equal(r.status, 200)
  assert.ok(JSON.parse(r.body).enabledPacks.includes('beta'))

  r = await post(a.api, { op: 'setPackEnabled', packId: 'beta', enabled: false })
  const after = JSON.parse(r.body)
  assert.ok(!after.enabledPacks.includes('beta'), 'beta must be gone from the enabled list')
  assert.ok(a.libraryRows().every((m) => m.pack !== 'beta'), 'and out of the model library')

  await post(a.api, { op: 'setPackEnabled', packId: 'beta', enabled: true })
  assert.ok(a.libraryRows().some((m) => m.pack === 'beta'))
})

test('the scan folder may not be a pack itself, and pack ids may not escape', async () => {
  const a = api()
  const r = await post(a.api, { op: 'setPacksDir', packsDir: join(ctx.packsDir, 'alpha') })
  assert.equal(r.status, 400)
  assert.match(JSON.parse(r.body).error, /itself a pack/)

  const bad = await post(a.api, { op: 'createMemePack', id: '../../evil', name: 'x' })
  assert.equal(bad.status, 400)
  assert.ok(listPacks(ctx.packsDir).every((p) => !p.id.includes('..')))
})

test('an upload lands in the active pack and shows up in the next listing', async () => {
  const a = api()
  await post(a.api, { op: 'setPack', packId: 'alpha' })
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')
  const up = await post(a.api, { op: 'upload', tag: 'happy', fileName: 'new.png', dataBase64: png, caption: '新图', keywords: '新' })
  assert.equal(up.status, 200)
  const rel = JSON.parse(up.body).meme.path
  // the stored name is generated (timestamp + a counter) to avoid collisions, so match that shape
  assert.match(rel, /^memes\/happy\/\d+_\d+\.png$/)
  assert.equal(readFileSync(join(ctx.packsDir, 'alpha', rel)).toString('hex'), '89504e470d0a1a0a')
  const list = JSON.parse((await req(a.api, { url: '/persona-kit/memes-api?packId=alpha&q=' + encodeURIComponent('新图') })).body)
  assert.ok(list.memes.some((m) => m.path === rel))
  // the whitelist cache must notice the new rows, not wait out its ttl
  assert.equal((await req(a.image('/persona-kit/memes'), { url: '/persona-kit/memes/alpha/' + rel })).status, 200)
})

test('recognize reports that it cannot help instead of pretending', async () => {
  const r = await post(api().api, { op: 'recognize', fileName: 'x.png', dataBase64: Buffer.from('x').toString('base64') })
  assert.equal(r.status, 501)
  assert.match(JSON.parse(r.body).error, /not available/)
})

test('importing a zip installs the pack and leaves every existing pack untouched', async () => {
  const a = api()
  // fingerprint the packs the user already had
  const before = new Map()
  for (const p of listPacks(ctx.packsDir)) {
    const st = statSync(join(p.path, 'index.db'))
    const db = new DatabaseSync(join(p.path, 'index.db'), { readOnly: true })
    before.set(p.id, { mtimeMs: st.mtimeMs, size: st.size, rows: db.prepare('SELECT COUNT(*) AS n FROM memes').get().n })
    db.close()
  }

  // a pack whose keywords repeat a site-wide tag on every row, so the cleanup has work to do
  const rows = Array.from({ length: 10 }, (_, i) => ({ path: `memes/happy/z${i}.webp`, tag: 'happy', file_name: `z${i}.webp`, caption: `图${i}`, keywords: `站名 词${i}` }))
  const stage = mkdtempSync(join(tmpdir(), 'packstage-'))
  const db = new DatabaseSync(join(stage, 'index.db'))
  db.exec('CREATE TABLE memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
  for (const r of rows) db.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(r.path, r.tag, r.file_name, r.caption, r.keywords, 1, 1)
  db.close()
  const files = [{ name: 'index.db', data: readFileSync(join(stage, 'index.db')) }, { name: 'manifest.json', data: Buffer.from(JSON.stringify({ id: 'imported', name: 'Imported' })) }]
  for (const r of rows) files.push({ name: r.path, data: Buffer.from('pic ' + r.path) })
  rmSync(stage, { recursive: true, force: true })
  const zip = zipStore(files).toString('base64')

  const r = await post(a.api, { op: 'importMemePack', name: 'imported', dataBase64: zip })
  assert.equal(r.status, 200)
  assert.ok(listPacks(ctx.packsDir).some((p) => p.id === 'imported'))

  // the pack the user already had is byte-for-byte the same file, with the same row count
  for (const [id, want] of before) {
    const p = listPacks(ctx.packsDir).find((x) => x.id === id)
    const st = statSync(join(p.path, 'index.db'))
    assert.equal(st.size, want.size, `${id} index.db size changed`)
    assert.equal(st.mtimeMs, want.mtimeMs, `${id} index.db was rewritten`)
    const d = new DatabaseSync(join(p.path, 'index.db'), { readOnly: true })
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM memes').get().n, want.rows, `${id} row count changed`)
    d.close()
  }

  // and the cleanup did run on the imported copy: the site-wide tag is gone from its rows
  const imported = listPacks(ctx.packsDir).find((p) => p.id === 'imported')
  const d = new DatabaseSync(join(imported.path, 'index.db'), { readOnly: true })
  const kws = d.prepare('SELECT keywords FROM memes').all().map((x) => x.keywords)
  d.close()
  assert.ok(kws.every((k) => !k.includes('站名')), 'the high-frequency tag should have been dropped from the import')
  assert.ok(kws.some((k) => k.includes('词0')))
})

test('export needs a packId and refuses to build the whole library in memory', async () => {
  const a = api()
  let r = await req(a.exportZip, { url: '/persona-kit/memes-export' })
  assert.equal(r.status, 400)
  assert.match(r.body, /name one pack/)

  r = await req(a.exportZip, { url: '/persona-kit/memes-export?packId=nope' })
  assert.equal(r.status, 400)
  assert.match(r.body, /unknown pack/)

  r = await req(a.exportZip, { url: '/persona-kit/memes-export?packId=alpha' })
  assert.equal(r.status, 200)
  assert.equal(r.headers['content-type'], 'application/zip')
  assert.ok(r.bytes.subarray(0, 2).equals(Buffer.from('PK')))
  assert.match(r.headers['content-disposition'], /dsh-meme-alpha-/)

  // and the archive really holds the pack
  const { unzipStore } = await import('../lib/memes.js')
  const entries = unzipStore(r.bytes)
  assert.ok(entries.has('index.db'))
  assert.ok(entries.has('memes/happy/a1.webp'))
  assert.ok(!entries.has('secret.txt'), 'a file outside the index must not be exported')
})

test('the old settings are read once, in memory only, and never on top of an existing file', () => {
  const h = mkdtempSync(join(tmpdir(), 'memesettings-'))
  const old = join(h, 'dsh-expression.json')
  writeFileSync(old, JSON.stringify({ enabledPacks: ['a', 'b'], packId: 'a', packsDir: '/x', promptEnabled: true, remoteSubs: [{ id: 'r' }] }))
  try {
    // legacy present, ours absent → every field carried over, and nothing written yet
    const s = createMemeSettings({ dshHome: () => h, kitHome: () => join(h, 'persona-kit') })
    const v = s.read()
    assert.deepEqual(v.enabledPacks, ['a', 'b'])
    assert.equal(v.packId, 'a')
    assert.equal(v.packsDir, '/x')
    assert.equal(v.promptEnabled, true)
    assert.deepEqual(v.remoteSubs, [{ id: 'r' }])
    assert.ok(s.imported)
    // reading must not create the file: that side effect belongs to the first real change
    assert.throws(() => readFileSync(s.file), /ENOENT/)

    // a first write persists what the read had in memory, so the old choices are not lost
    s.write({ promptEnabled: false })
    const onDisk = JSON.parse(readFileSync(s.file, 'utf8'))
    assert.deepEqual(onDisk.enabledPacks, ['a', 'b'])
    assert.equal(onDisk.packId, 'a')
    assert.equal(onDisk.promptEnabled, false)

    // our own file now wins, even when the old one changes afterwards
    const s2 = createMemeSettings({ dshHome: () => h, kitHome: () => join(h, 'persona-kit') })
    assert.equal(s2.read().packId, 'a')
    writeFileSync(old, JSON.stringify({ packId: 'changed' }))
    const s3 = createMemeSettings({ dshHome: () => h, kitHome: () => join(h, 'persona-kit') })
    assert.notEqual(s3.read().packId, 'changed')
    assert.equal(s3.imported, false)
  } finally { rmSync(h, { recursive: true, force: true }) }
})

test('a GET on the management api does not create the settings file', async () => {
  const h = mkdtempSync(join(tmpdir(), 'memessettings-get-'))
  try {
    writeFileSync(join(h, 'dsh-expression.json'), JSON.stringify({ enabledPacks: ['alpha'], packId: 'alpha' }))
    const packsDir = join(h, 'meme-packs')
    makePack(packsDir, 'alpha', [{ path: 'memes/happy/a.webp', tag: 'happy' }])
    const local = createMemeApi({ packsDir, dshHome: () => h, kitHome: () => join(h, 'persona-kit') })
    const r = await req(local.api, { url: '/persona-kit/memes-api' })
    assert.equal(r.status, 200)
    assert.equal(JSON.parse(r.body).ok, true)
    // the legacy choices apply right away, from memory
    assert.deepEqual(local.enabledPacks(), ['alpha'], 'the old choices apply right away')
    assert.throws(() => readFileSync(join(h, 'persona-kit', 'memes.json')), /ENOENT/, 'reading must not write')
  } finally { try { rmSync(h, { recursive: true, force: true }) } catch { /* a stray handle on Windows */ } }
})

test('with no old file the defaults stand and no old file is created', () => {
  const h = mkdtempSync(join(tmpdir(), 'memesettings2-'))
  try {
    const s = createMemeSettings({ dshHome: () => h, kitHome: () => join(h, 'persona-kit') })
    const v = s.read()
    assert.deepEqual(v.enabledPacks, [])
    assert.equal(v.packId, '')
    assert.equal(v.promptEnabled, false)
    assert.equal(s.imported, false)
    // reading must not write either file
    assert.throws(() => readFileSync(join(h, 'dsh-expression.json')), /ENOENT/)
  } finally { rmSync(h, { recursive: true, force: true }) }
})

test('a damaged old file falls back to the defaults instead of throwing', () => {
  const h = mkdtempSync(join(tmpdir(), 'memesettings3-'))
  try {
    writeFileSync(join(h, 'dsh-expression.json'), '{ this is not json')
    const s = createMemeSettings({ dshHome: () => h, kitHome: () => join(h, 'persona-kit') })
    const v = s.read()
    assert.deepEqual(v.enabledPacks, [])
    assert.equal(v.packId, '')
    // the damaged file is left exactly as it was, for the user to look at
    assert.equal(readFileSync(join(h, 'dsh-expression.json'), 'utf8'), '{ this is not json')
  } finally { rmSync(h, { recursive: true, force: true }) }
})

test('our own damaged file also falls back instead of throwing', () => {
  const h = mkdtempSync(join(tmpdir(), 'memesettings4-'))
  try {
    mkdirSync(join(h, 'persona-kit'), { recursive: true })
    writeFileSync(join(h, 'persona-kit', 'memes.json'), 'not json at all')
    const s = createMemeSettings({ dshHome: () => h, kitHome: () => join(h, 'persona-kit') })
    assert.deepEqual(s.read().enabledPacks, [])
  } finally { rmSync(h, { recursive: true, force: true }) }
})

test('an unknown operation answers 400 with the reason', async () => {
  const r = await post(api().api, { op: 'launchMissiles' })
  assert.equal(r.status, 400)
  assert.match(JSON.parse(r.body).error, /unknown operation/)
})
