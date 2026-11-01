// dsh-persona-kit meme HTTP: image route, management API, zip export, ops panel, settings.
//
// Packs live under ~/.dsh/meme-packs, the same folder the old dsh-meme plugin used, so nothing has to
// move. This module only serves and manages them; browsing and keyword search logic is in memes.js.
//
// Two rules hold everywhere here:
//  - a request may read a file only if the pack's own index.db lists that path. The index is the
//    whitelist, so "../" and stray files answer 404 without a second guess about escaping the root;
//  - the management API answers loopback callers only (trusted()), because it writes to the library.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sendJson, trusted } from './http.js'
import { pick } from './lang.js'
import { isSafeId } from './store.js'
import { prunePackKeywords, unzipStore, zipStore } from './memes.js'

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const VALID_TAG = /^[a-z0-9_-]+$/
const SIDECAR_NAME = '.dsh-remote.json'
const WHITELIST_TTL = 30 * 1000
/** A single pack is at most a few thousand files; past this the export is refused rather than buffered. */
const MAX_EXPORT_BYTES = 64 * 1024 * 1024

// ---- settings ----

const SETTINGS_DEFAULTS = {
  enabledPacks: [],
  packId: '',
  packsDir: '',
  promptEnabled: false,
  memeRoot: '',
  companionPrompt: '',
  remoteSubs: [],
}

/**
 * Read the kit's own meme settings, importing the old plugin's file once when ours does not exist yet.
 *
 * The old file (~/.dsh/dsh-expression.json) is read and never written: it stays as the rollback copy, and
 * a settings file that exists but cannot be parsed falls back to the defaults instead of throwing, so a
 * damaged file can never keep the plugin from starting.
 * @param {{dshHome: () => string, kitHome: () => string}} paths
 * @returns {{read: () => object, write: (patch: object) => object, file: string, legacy: string, imported: boolean}}
 */
export function createMemeSettings({ dshHome, kitHome }) {
  const file = join(kitHome(), 'memes.json')
  const legacy = join(dshHome(), 'dsh-expression.json')
  let imported = false
  let cached = null

  const normal = (o) => ({
    enabledPacks: Array.isArray(o?.enabledPacks) ? o.enabledPacks.filter((x) => typeof x === 'string') : [],
    packId: typeof o?.packId === 'string' ? o.packId : '',
    packsDir: typeof o?.packsDir === 'string' ? o.packsDir : '',
    promptEnabled: o?.promptEnabled === true,
    memeRoot: typeof o?.memeRoot === 'string' ? o.memeRoot : '',
    companionPrompt: typeof o?.companionPrompt === 'string' ? o.companionPrompt : '',
    remoteSubs: Array.isArray(o?.remoteSubs) ? o.remoteSubs.filter((x) => x && typeof x === 'object') : [],
  })

  const write = (value) => {
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n')
      renameSync(file + '.tmp', file)
    } catch { /* a read-only home must not break serving; the caller keeps the in-memory value */ }
    cached = value
    return value
  }

  const read = () => {
    if (cached) return cached
    if (existsSync(file)) {
      try { return (cached = normal(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')))) } catch {
        // A damaged file is replaced by the defaults on the next write; it is never deleted here.
        return (cached = { ...SETTINGS_DEFAULTS })
      }
    }
    // First run after the merge: carry the old plugin's choices over. The library a user collected is
    // decided by these fields, so losing them would look like every sticker vanished.
    //
    // This stays in memory: reading must not create files. The old choices apply immediately, and our own
    // file appears only once something is actually written — a GET that silently creates a config file is
    // a side effect that makes permissions, rollback and tests all harder to reason about.
    if (existsSync(legacy)) {
      try {
        const old = JSON.parse(readFileSync(legacy, 'utf8').replace(/^﻿/, ''))
        imported = true
        return (cached = normal(old))
      } catch { /* a damaged old file is left alone; the defaults stand */ }
    }
    return (cached = { ...SETTINGS_DEFAULTS })
  }

  return {
    read,
    write: (patch) => write({ ...read(), ...normal({ ...read(), ...patch }) }),
    file,
    legacy,
    get imported() { return imported },
  }
}

// ---- pack discovery (standard layout only: <packsDir>/<id>/index.db) ----

/**
 * Every pack in the scan folder. A folder without index.db is not a pack and is skipped — the old
 * plugin also accepted a folder of folders, but that nesting was a foot-gun (a pack nested inside a
 * pack made the outer one disappear), so only the flat layout is recognised.
 * @param {string} packsDir
 * @returns {Array<{id: string, path: string, name: string, count: number, cover: string, source: string}>}
 */
export function listPacks(packsDir) {
  const out = []
  let names = []
  try { names = readdirSync(packsDir) } catch { return out }
  for (const name of names.sort()) {
    if (!isSafeId(name)) continue
    const dir = join(packsDir, name)
    let st
    try { st = statSync(dir) } catch { continue }
    if (!st.isDirectory()) continue
    if (!existsSync(join(dir, 'index.db'))) continue
    let meta = {}
    try { meta = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, '')) } catch { /* optional */ }
    out.push({
      id: name,
      path: dir,
      name: typeof meta.name === 'string' && meta.name ? meta.name : name,
      count: countRows(dir),
      cover: typeof meta.cover === 'string' ? meta.cover : '',
      source: 'custom',
    })
  }
  return out
}

function countRows(packDir) {
  try {
    const db = new DatabaseSync(join(packDir, 'index.db'), { readOnly: true })
    try { return db.prepare('SELECT COUNT(*) AS n FROM memes').get().n } catch { return 0 }
  } catch { return 0 }
}

/** Rows of one pack, or [] when the index is missing or damaged. */
function readRows(packDir) {
  try {
    const db = new DatabaseSync(join(packDir, 'index.db'), { readOnly: true })
    try {
      return db.prepare("SELECT path, tag, COALESCE(file_name, '') AS file_name, COALESCE(caption, '') AS caption, COALESCE(keywords, '') AS keywords FROM memes ORDER BY path").all()
    } finally { db.close() }
  } catch { return [] }
}

/**
 * The paths a pack's index lists, cached briefly and invalidated by the index file's size and mtime, so
 * an upload shows up without a restart. A missing or unreadable index yields null, which denies every
 * path rather than allowing them.
 */
function createWhitelist() {
  const cache = new Map()
  return (packDir) => {
    const key = resolve(packDir)
    const indexPath = join(key, 'index.db')
    let st = null
    try { st = statSync(indexPath) } catch { return null }
    const hit = cache.get(key)
    const now = Date.now()
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size && now - hit.at < WHITELIST_TTL) return hit.paths
    let paths = null
    try {
      const db = new DatabaseSync(indexPath, { readOnly: true })
      try { paths = new Set(db.prepare('SELECT path FROM memes').all().map((r) => String(r.path))) } finally { db.close() }
    } catch { paths = null }
    if (paths) cache.set(key, { paths, mtimeMs: st.mtimeMs, size: st.size, at: now })
    else cache.delete(key)
    return paths
  }
}

// ---- handlers ----

/**
 * Build the four handlers plus the settings store.
 * @param {{packsDir: string, dshHome: () => string, kitHome: () => string, log?: (m: string) => void}} options
 */
export function createMemeApi({ packsDir, dshHome, kitHome, log = () => {} }) {
  const settings = createMemeSettings({ dshHome, kitHome })
  const allowedPaths = createWhitelist()

  const packsDirNow = () => {
    const s = settings.read()
    return s.packsDir && s.packsDir !== '' ? s.packsDir : packsDir
  }
  const activePack = () => {
    const s = settings.read()
    const packs = listPacks(packsDirNow())
    if (s.packId) {
      const hit = packs.find((p) => p.id === s.packId)
      if (hit) return hit
    }
    if (s.memeRoot) {
      const byRoot = packs.find((p) => resolve(p.path) === resolve(s.memeRoot))
      if (byRoot) return byRoot
    }
    return packs[0] || null
  }
  /** Packs the model may draw from: the enabled list, defaulting to the active pack. */
  const enabledPacks = () => {
    const s = settings.read()
    const packs = listPacks(packsDirNow())
    const active = activePack()
    const ids = Array.isArray(s.enabledPacks) ? s.enabledPacks : []
    const live = ids.filter((id) => packs.some((p) => p.id === id))
    if (live.length > 0) return live
    return active ? [active.id] : []
  }

  const payload = () => {
    const s = settings.read()
    const packs = listPacks(packsDirNow())
    const active = activePack()
    const enabled = enabledPacks()
    return {
      memeRoot: active ? active.path : '',
      packId: active ? active.id : '',
      packs: packs.map((p) => ({ id: p.id, name: p.name, count: p.count, enabled: enabled.includes(p.id) })),
      enabledPacks: enabled,
      packsDir: packsDirNow(),
      promptEnabled: s.promptEnabled,
      companionPrompt: s.companionPrompt,
      configured: !!(s.memeRoot || s.packId),
    }
  }

  // ---- image route: the index is the whitelist ----

  /**
   * Serve one picture. `prefix` is whichever mount the request arrived on, so the compatibility route can
   * reuse this handler instead of keeping its own copy of the logic.
   */
  const image = (prefix) => (req, res, url) => {
    const rawUrl = String(url || req.url || '/').split('?')[0]
    let pathname
    try { pathname = decodeURIComponent(rawUrl) } catch {
      // A hand-typed broken escape (%E5%A) is "not found", never a 500.
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('not found')
    }
    const raw = pathname.startsWith(prefix + '/') ? pathname.slice(prefix.length + 1) : null
    if (!raw) return notFound(res)
    const slash = raw.indexOf('/')
    const first = slash > 0 ? raw.slice(0, slash) : ''
    // The first segment names a pack, except for the old url shape where every stored path started with
    // "memes/" — there the whole thing addresses the active pack, which is what pre-merge urls carry.
    const packId = first && first !== 'memes' ? first : ''
    const rel = packId ? raw.slice(slash + 1) : raw
    let packDir = ''
    if (packId) {
      const hit = listPacks(packsDirNow()).find((p) => p.id === packId)
      if (!hit) return notFound(res)
      packDir = hit.path
    } else {
      const active = activePack()
      if (!active) return notFound(res)
      packDir = active.path
    }
    const stored = rel
    const allowed = allowedPaths(packDir)
    // The whitelist is the whole check: "..", an absolute path or a file outside the pack is simply not a
    // string the index contains, so all three answer 404 without a separate traversal test.
    if (!stored || !allowed || !allowed.has(stored)) return notFound(res)
    const base = resolve(packDir)
    const file = resolve(base, stored)
    if (!file.startsWith(base + sep)) return notFound(res)
    let st
    try { st = lstatSync(file) } catch { return notFound(res) }
    if (st.isSymbolicLink() || !st.isFile()) return notFound(res)
    const ext = extname(file).slice(1).toLowerCase()
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': String(st.size),
      'cache-control': 'private, max-age=3600',
    })
    res.end(readFileSync(file))
  }

  // ---- management API ----

  const readBody = (req, limit = 32 * 1024 * 1024) => new Promise((resolveBody, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      if (total > limit) { reject(new Error('request body too large')); return }
      chunks.push(c)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

  const packSlug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^-+|-+$/g, '').slice(0, 40)

  /**
   * Install a pack from zip entries into a staging folder, clean it up, then swap it in.
   *
   * prunePackKeywords runs on the staged copy only — never on a pack the user already has. Say so at the
   * call site, because "clean the keywords" on a live pack would rewrite a library nobody asked to change.
   */
  const installZipEntries = (entries, wantedId) => {
    const id = packSlug(wantedId)
    if (!id) throw new Error('invalid pack id')
    if (!entries.get('index.db')) throw new Error('the zip has no index.db, so it is not a meme pack')
    const enabledBefore = enabledPacks()
    const root = resolve(packsDirNow())
    const target = resolve(join(root, id))
    if (!target.startsWith(root + sep)) throw new Error('pack path escapes the packs folder')
    const nonce = Math.random().toString(16).slice(2, 10)
    const stage = resolve(join(root, id + '.tmp-' + nonce))
    const backup = resolve(join(root, id + '.bak-' + nonce))
    if (!stage.startsWith(root + sep) || !backup.startsWith(root + sep)) throw new Error('staging path escapes the packs folder')
    for (const [rel] of entries) {
      if (!rel || /[\\/]$/.test(rel)) continue
      const full = resolve(stage, rel)
      if (full === stage || !full.startsWith(stage + sep)) throw new Error('zip entry escapes the pack: ' + rel)
    }
    mkdirSync(root, { recursive: true })
    rmSync(stage, { recursive: true, force: true })
    rmSync(backup, { recursive: true, force: true })
    try {
      mkdirSync(stage, { recursive: true })
      for (const [rel, bytes] of entries) {
        if (!rel || /[\\/]$/.test(rel)) continue
        const full = resolve(stage, rel)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, bytes)
      }
      const verify = new DatabaseSync(join(stage, 'index.db'), { readOnly: true })
      try { verify.prepare('SELECT COUNT(*) AS n FROM memes').get() } finally { verify.close() }
      // Staged copy only — the user's existing packs are never opened here. Cleaning a shared pack's
      // site-wide tags is a retrieval improvement, so a failure must not fail the import.
      try {
        const pruned = prunePackKeywords(join(stage, 'index.db'))
        if (pruned.drop.length) log(`meme pack ${id}: dropped ${pruned.drop.length} high-frequency keywords (${pruned.changed} rows)`)
      } catch (error) { log(`meme pack ${id}: keyword cleanup skipped: ${error?.message || error}`) }
      let backedUp = false
      try {
        if (existsSync(target)) { renameSync(target, backup); backedUp = true }
        renameSync(stage, target)
      } catch (error) {
        if (backedUp && !existsSync(target) && existsSync(backup)) renameSync(backup, target)
        throw error
      }
      rmSync(backup, { recursive: true, force: true })
      settings.write({ packId: id, enabledPacks: [...new Set([...enabledBefore, id])] })
      return target
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }

  const api = async (req, res) => {
    if (!trusted(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' })
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'http://x')
      const packs = listPacks(packsDirNow())
      const active = activePack()
      const wanted = url.searchParams.get('packId') || (active ? active.id : '')
      const q = url.searchParams.get('q') || ''
      const tag = url.searchParams.get('tag') || ''
      if (wanted === 'all') {
        // The picker's hover previews need every pack at once with the pack in each url.
        const all = []
        for (const p of packs) {
          const rows = readRows(p.path)
          for (const r of rows) all.push({ ...r, pack: p.id, url: p.id + '/' + r.path })
        }
        return sendJson(res, 200, { ok: true, total: all.length, tags: [], packId: active ? active.id : '', packs: packs.map((p) => ({ id: p.id, name: p.name, count: p.count })), memes: all })
      }
      const pack = packs.find((p) => p.id === wanted) || active
      let rows = pack ? readRows(pack.path) : []
      if (tag) {
        const fine = String(tag).toLowerCase()
        rows = rows.filter((r) => String(r.tag || '').toLowerCase() === fine)
      }
      if (q) {
        const needle = String(q).toLowerCase()
        const tokens = needle.split(/\s+/).filter(Boolean)
        rows = rows.filter((r) => tokens.some((t) => `${r.tag} ${r.caption} ${r.keywords} ${r.file_name}`.toLowerCase().includes(t)))
      }
      const pid = pack ? pack.id : ''
      return sendJson(res, 200, { ok: true, total: rows.length, packId: pid, packs: packs.map((p) => ({ id: p.id, name: p.name, count: p.count })), memes: rows.map((r) => ({ ...r, pack: pid, url: pid + '/' + r.path })) })
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })

    let body
    try { body = JSON.parse(await readBody(req)) } catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }) }
    try {
      const op = String(body.op || '')
      const s = settings.read()

      if (op === 'getMemeRoot') return sendJson(res, 200, { ok: true, ...payload() })

      if (op === 'setPack') {
        const packId = String(body.packId || '').trim()
        if (!packId) throw new Error('no pack named')
        const hit = listPacks(packsDirNow()).find((p) => p.id === packId)
        if (!hit) throw new Error('unknown pack: ' + packId)
        settings.write({ packId: hit.id, memeRoot: hit.path })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      if (op === 'setMemeRoot') {
        const dir = String(body.memeRoot || '').trim()
        if (!dir) throw new Error('folder required')
        settings.write({ memeRoot: resolve(dir) })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      if (op === 'setPacksDir') {
        const dir = String(body.packsDir || '').trim()
        if (!dir) throw new Error('folder required')
        // The scan folder must be the parent of the packs, not one pack itself: picking a pack would nest
        // every later import inside it and make the outer pack disappear from the list.
        if (existsSync(join(dir, 'index.db'))) throw new Error('that folder is itself a pack (it has an index.db); choose its parent')
        mkdirSync(dir, { recursive: true })
        settings.write({ packsDir: resolve(dir) })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      if (op === 'setPackEnabled') {
        const target = String(body.packId || '').trim()
        const packs = listPacks(packsDirNow())
        if (!packs.some((p) => p.id === target)) throw new Error('unknown pack: ' + target)
        const current = enabledPacks()
        const next = body.enabled !== false ? [...new Set([...current, target])] : current.filter((id) => id !== target)
        settings.write({ enabledPacks: next })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      if (op === 'setPromptEnabled') {
        settings.write({ promptEnabled: body.enabled !== false })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      if (op === 'setCompanionPrompt') {
        settings.write({ companionPrompt: String(body.text || '').trim() })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      if (op === 'browse') {
        // The host has no workspaces service, so picking a folder goes through here.
        let dir = resolve(String(body.path || '').trim() || packsDirNow())
        if (!existsSync(dir)) dir = dshHome()
        const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => ({ name: e.name, path: join(dir, e.name) })).sort((a, b) => a.name.localeCompare(b.name))
        const breadcrumbs = []
        for (let cur = dir; ;) {
          const parent = dirname(cur)
          breadcrumbs.unshift({ name: cur === parent ? cur : basename(cur), path: cur })
          if (cur === parent) break
          cur = parent
        }
        return sendJson(res, 200, { ok: true, path: dir, parent: dirname(dir) === dir ? '' : dirname(dir), entries, breadcrumbs })
      }

      if (op === 'createMemePack') {
        const rawId = String(body.id || '').trim()
        const id = packSlug(rawId)
        const name = String(body.name || '').trim()
        // Refuse rather than quietly rename: a caller that asked for "../../evil" must not end up with a
        // pack called "evil", or the id they then use is not the id that exists.
        if (!id || id !== rawId.toLowerCase()) throw new Error('id must be 1-40 characters: lowercase letters, digits, dashes or underscores')
        if (!name || name.length > 60) throw new Error('pack name must be 1-60 characters')
        if (listPacks(packsDirNow()).some((p) => p.id === id)) throw new Error('that pack id already exists')
        const root = resolve(packsDirNow())
        const dir = join(root, id)
        if (!resolve(dir).startsWith(root + sep)) throw new Error('pack path escapes the packs folder')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id, name, description: String(body.description || '').slice(0, 200), version: '1.0.0' }, null, 2))
        const db = new DatabaseSync(join(dir, 'index.db'))
        try { db.exec('CREATE TABLE IF NOT EXISTS memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)') } finally { db.close() }
        settings.write({ packId: id, memeRoot: dir, enabledPacks: [...new Set([...enabledPacks(), id])] })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      if (op === 'recognize') {
        // Asks the model what a picture is. Soft service lookup: without an llm the op reports that it
        // cannot help instead of making the whole plugin depend on one.
        const data = String(body.dataBase64 || '')
        if (!data) throw new Error('no image data')
        const buf = Buffer.from(data, 'base64')
        if (buf.byteLength === 0 || buf.byteLength > 8 * 1024 * 1024) throw new Error('image too large (max 8 MB)')
        return sendJson(res, 501, { ok: false, error: 'automatic recognition is not available in this build; set the category by hand' })
      }

      if (op === 'upload') {
        const tag = String(body.tag || '').trim().toLowerCase()
        const fileName = String(body.fileName || '').trim()
        const data = String(body.dataBase64 || '')
        const caption = String(body.caption || '').trim().slice(0, 200)
        const keywords = String(body.keywords || '').trim().slice(0, 200)
        if (!tag || !VALID_TAG.test(tag)) throw new Error('the category may only contain lowercase letters, digits, dash and underscore')
        const ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : ''
        if (!IMAGE_EXTS.includes(ext)) throw new Error('only jpg/png/gif/webp are supported')
        if (!data) throw new Error('no image data')
        const active = activePack()
        if (!active) throw new Error('there is no pack to add this to')
        const name = Date.now() + '_' + Math.floor(Math.random() * 1000) + ext
        const rel = 'memes/' + tag + '/' + name
        const dir = join(active.path, 'memes', tag)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(active.path, rel), Buffer.from(data, 'base64'))
        const db = new DatabaseSync(join(active.path, 'index.db'))
        try {
          db.prepare('INSERT INTO memes (path, tag, file_name, caption, keywords, mtime, captioned_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(rel, tag, name, caption, keywords, Date.now(), Date.now())
        } finally { db.close() }
        return sendJson(res, 200, { ok: true, meme: { path: rel, tag, file_name: name, caption, keywords } })
      }

      if (op === 'update') {
        const path = String(body.path || '')
        const active = activePack()
        if (!active) throw new Error('there is no active pack')
        const row = readRows(active.path).find((m) => m.path === path)
        if (!row) throw new Error('unknown path: ' + path)
        const tag = body.tag != null ? String(body.tag).trim().toLowerCase() : row.tag
        if (!VALID_TAG.test(tag)) throw new Error('the category may only contain lowercase letters, digits, dash and underscore')
        const caption = body.caption != null ? String(body.caption).trim() : row.caption
        const keywords = body.keywords != null ? String(body.keywords).trim() : row.keywords
        const db = new DatabaseSync(join(active.path, 'index.db'))
        try { db.prepare('UPDATE memes SET tag = ?, caption = ?, keywords = ? WHERE path = ?').run(tag, caption, keywords, path) } finally { db.close() }
        return sendJson(res, 200, { ok: true })
      }

      if (op === 'delete') {
        const path = String(body.path || '')
        const active = activePack()
        if (!active) throw new Error('there is no active pack')
        if (!readRows(active.path).some((m) => m.path === path)) throw new Error('unknown path: ' + path)
        const db = new DatabaseSync(join(active.path, 'index.db'))
        try { db.prepare('DELETE FROM memes WHERE path = ?').run(path) } finally { db.close() }
        try { unlinkSync(join(active.path, path)) } catch { /* already gone */ }
        return sendJson(res, 200, { ok: true })
      }

      if (op === 'deleteTag') {
        const tag = String(body.tag || '').trim().toLowerCase()
        if (!tag || !VALID_TAG.test(tag)) throw new Error('the category may only contain lowercase letters, digits, dash and underscore')
        const active = activePack()
        if (!active) throw new Error('there is no active pack')
        let deleted = 0
        const db = new DatabaseSync(join(active.path, 'index.db'))
        try { deleted = db.prepare('DELETE FROM memes WHERE tag = ?').run(tag).changes } finally { db.close() }
        rmSync(join(active.path, 'memes', tag), { recursive: true, force: true })
        return sendJson(res, 200, { ok: true, deleted })
      }

      if (op === 'importMemePack') {
        const data = String(body.dataBase64 || '')
        if (!data) throw new Error('no zip data')
        const name = packSlug(body.name) || 'meme-pack'
        installZipEntries(unzipStore(Buffer.from(data, 'base64')), name)
        return sendJson(res, 200, { ok: true, ...payload(), message: 'imported' })
      }

      if (op === 'deleteMemePack') {
        const target = String(body.packId || '').trim()
        const packs = listPacks(packsDirNow())
        const hit = packs.find((p) => p.id === target)
        if (!hit) throw new Error('unknown pack: ' + target)
        const root = resolve(packsDirNow())
        const dir = resolve(hit.path)
        // Only a directory directly inside the scan folder may be removed: this is what keeps a typo in
        // packId from deleting something else on disk.
        if (dirname(dir) !== root) throw new Error('this pack is not inside the scan folder, refusing to delete it')
        const remaining = packs.filter((p) => p.id !== target)
        if (remaining.length === 0) throw new Error('this is the last pack; there would be nothing left to draw from')
        const s2 = settings.read()
        settings.write({
          packId: s2.packId === target ? remaining[0].id : s2.packId,
          memeRoot: s2.packId === target ? remaining[0].path : s2.memeRoot,
          enabledPacks: (Array.isArray(s2.enabledPacks) ? s2.enabledPacks : []).filter((id) => id !== target),
        })
        rmSync(dir, { recursive: true, force: true })
        return sendJson(res, 200, { ok: true, ...payload() })
      }

      return sendJson(res, 400, { ok: false, error: 'unknown operation: ' + op })
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // ---- export: one pack at a time, on purpose ----

  const exportZip = (req, res) => {
    if (!trusted(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' })
    if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }); return res.end() }
    const wanted = new URL(req.url || '/', 'http://x').searchParams.get('packId')
    try {
      if (!wanted) {
        // Exporting every pack at once would need the whole library in memory (measured: 52 MB and 813
        // files), so each pack is exported on its own instead.
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        return res.end('name one pack with ?packId=; the whole library is not exported in one archive')
      }
      const hit = listPacks(packsDirNow()).find((p) => p.id === wanted)
      if (!hit) throw new Error('unknown pack: ' + wanted)
      const rows = readRows(hit.path)
      if (rows.length === 0) throw new Error('this pack has no pictures to export')
      const files = []
      let bytes = 0
      const add = (name, full) => {
        const st = statSync(full)
        bytes += st.size
        if (bytes > MAX_EXPORT_BYTES) throw new Error('this pack is too large to export in one archive')
        files.push({ name, data: readFileSync(full) })
      }
      add('index.db', join(hit.path, 'index.db'))
      if (existsSync(join(hit.path, 'manifest.json'))) add('manifest.json', join(hit.path, 'manifest.json'))
      for (const r of rows) {
        const full = resolve(hit.path, r.path)
        if (!full.startsWith(resolve(hit.path) + sep)) continue
        if (existsSync(full)) add(r.path, full)
      }
      const zip = zipStore(files)
      const stamp = new Date().toISOString().slice(0, 10)
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': String(zip.byteLength),
        'content-disposition': `attachment; filename="dsh-meme-${hit.id}-${stamp}.zip"`,
      })
      res.end(zip)
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('export failed: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // ---- the ops panel page ----
  const panel = (getHtml) => (req, res) => {
    if (!trusted(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' })
    try {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(getHtml())
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('panel.html is missing: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  /** The model's view: the rows of every enabled pack, so send_sticker can draw from any of them. */
  const libraryRows = () => {
    const out = []
    for (const id of enabledPacks()) {
      const hit = listPacks(packsDirNow()).find((p) => p.id === id)
      if (!hit) continue
      for (const r of readRows(hit.path)) out.push({ ...r, pack: id, rel: r.path })
    }
    return out
  }

  return {
    settings,
    payload,
    image,
    api,
    exportZip,
    panel,
    libraryRows,
    listPacks: () => listPacks(packsDirNow()),
    activePack,
    enabledPacks,
    packsDirNow,
  }
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
}
