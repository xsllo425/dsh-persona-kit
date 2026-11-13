// dsh-persona-kit storage: session state file, role cards, sticker library. Node built-ins only.
import { readFileSync, mkdirSync, statSync, existsSync, readdirSync, renameSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { writeFileAtomic } from './atomic-write.js'
import { clampLevel, DEFAULT_LEVEL, normalizeCard } from './core.js'
import { normalizeBond } from './bond.js'
import { cleanNickname, DEFAULT_TRACK, isTrack } from './tracks.js'

const STALE_MS = 90 * 24 * 60 * 60 * 1000
const SAFE_ID = /^[\w.-]{1,80}$/

export const isSafeId = (s) => typeof s === 'string' && SAFE_ID.test(s)

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) } catch { return fallback }
}
/** Like readJson, but a file that exists and cannot be parsed is moved aside (never silently overwritten). */
function readJsonKeep(file, fallback) {
  if (!existsSync(file)) return fallback
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) } catch {
    try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* nothing more we can do */ }
    return fallback
  }
}
// Windows refuses to replace a file that another handle has open (EPERM) and also
// fails under concurrent replace attempts; lib/atomic-write.js retries and falls
// back to an in-place write so a transient failure never drops the update.
function writeJsonAtomic(file, value) {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n')
}

/**
 * The context credited to the roles of a session can never exceed the context the session was measured at. An older
 * build credited the growth of a cumulative token counter instead, which left real state files holding 189,797,436
 * credited tokens against a 198,187-token context: those sessions read as a permanently full bond meter. Repair the
 * numbers on load, once — they are scaled back proportionally so they sum to the session total. Nothing is dropped.
 * @returns true when something was repaired, so the caller can write the file back.
 */
function repairCredits(data) {
  let repaired = false
  for (const e of Object.values(data.sessions)) {
    const total = Number.isFinite(e.tokens) ? e.tokens : 0
    if (!(total > 0) || !e.roleTokens || typeof e.roleTokens !== 'object') continue
    let sum = 0
    for (const n of Object.values(e.roleTokens)) if (Number.isFinite(n) && n > 0) sum += n
    if (sum <= total * 1.2 + 1000) continue
    const factor = total / sum
    for (const roleId of Object.keys(e.roleTokens)) {
      const n = e.roleTokens[roleId]
      if (Number.isFinite(n) && n > 0) e.roleTokens[roleId] = Math.floor(n * factor)
    }
    repaired = true
  }
  return repaired
}

/** Per-session state: level, sticker cadence, recent stickers, a sticker the model queued. */
export function createStore(file, now = Date.now) {
  const raw = readJsonKeep(file, null)
  const data = raw && typeof raw === 'object' && raw.sessions ? raw : { version: 1, sessions: {}, roleLevels: {} }
  data.roleLevels = data.roleLevels && typeof data.roleLevels === 'object' ? data.roleLevels : {}
  data.roles = data.roles && typeof data.roles === 'object' ? data.roles : {}
  data.stats = data.stats && typeof data.stats === 'object' ? data.stats : {}
  data.phrases = data.phrases && typeof data.phrases === 'object' ? data.phrases : {}
  data.achievements = data.achievements && typeof data.achievements === 'object' ? data.achievements : {}
  data.trackBonds = data.trackBonds && typeof data.trackBonds === 'object' ? data.trackBonds : {}
  data.roleSettings = data.roleSettings && typeof data.roleSettings === 'object' ? data.roleSettings : {}
  // Old files can still carry the inflated credits the previous build wrote; fix them here rather than
  // expecting anyone to run a repair script against a file the running host holds in memory.
  const repairedCredits = repairCredits(data)
  let dirty = false
  let timer = null
  let retryDelay = 0
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (!dirty) return
    dirty = false
    for (const [sid, e] of Object.entries(data.sessions)) if (now() - (e.at || 0) > STALE_MS) delete data.sessions[sid]
    try { writeJsonAtomic(file, data); retryDelay = 0 } catch {
      // Keep the change queued and try again on a backoff. Without rescheduling,
      // a single transient failure would leave the file stale until the next user action.
      dirty = true
      retryDelay = retryDelay ? Math.min(retryDelay * 2, 30_000) : 1_000
      if (!timer) { timer = setTimeout(flush, retryDelay); timer.unref?.() }
    }
  }
  const touch = () => {
    dirty = true
    if (!timer) { timer = setTimeout(flush, 400); timer.unref?.() }
  }
  if (repairedCredits) touch() // write the repaired numbers back instead of leaving them for the next mutation
  return {
    flush,
    /** The level a session is at, for one role: levels are kept per role, so switching role never carries a level over. */
    levelOf(sid, roleId) {
      const l = data.sessions[sid]?.levels?.[roleId]
      if (Number.isFinite(l)) return clampLevel(l)
      return clampLevel(data.roleLevels[roleId] ?? DEFAULT_LEVEL)
    },
    setLevel(sid, roleId, level) {
      const k = clampLevel(level)
      const e = data.sessions[sid] || (data.sessions[sid] = {})
      e.levels = e.levels && typeof e.levels === 'object' ? e.levels : {}
      e.levels[roleId || ''] = k
      e.at = now()
      if (roleId) data.roleLevels[roleId] = k
      this.noteLevel(k)
      touch()
      return k
    },
    /** Mutable sticker bookkeeping for one session. */
    sticker(sid) {
      const e = data.sessions[sid] || (data.sessions[sid] = {})
      if (!e.sticker || typeof e.sticker !== 'object') e.sticker = { sinceLast: 0, recent: [], queued: null }
      e.at = now()
      return e.sticker
    },
    // ---- bond: lifetime numbers per role (never pruned), tokens per session ----
    /** Which relationship track a role is on, and what it calls the user. */
    settingsOf(roleId) {
      const s = data.roleSettings[roleId] || {}
      return { track: isTrack(s.track) ? s.track : DEFAULT_TRACK, nickname: cleanNickname(s.nickname) }
    },
    setSettings(roleId, patch) {
      const cur = this.settingsOf(roleId)
      const next = { track: isTrack(patch.track) ? patch.track : cur.track, nickname: patch.nickname !== undefined ? cleanNickname(patch.nickname) : cur.nickname }
      data.roleSettings[roleId] = next
      touch()
      return next
    },
    /** Facts about a role that do not depend on the relationship: sessions, total turns, first/last time. */
    roleStatsOf(roleId) { return (data.roles[roleId] = normalizeBond(data.roles[roleId])) },
    /** One relationship track's own counters for a role (the track in force when none is named). */
    bondOf(roleId, trackId) {
      let all = data.trackBonds[roleId]
      if (!all) {
        // numbers from before tracks existed belong to the track the role was on at that time (the current one)
        const legacy = data.roles[roleId]
        all = data.trackBonds[roleId] = {}
        if (legacy && legacy.turns > 0) {
          const t = this.settingsOf(roleId).track
          all[t] = normalizeBond({ turns: legacy.turns, stickers: legacy.stickers, firstAt: legacy.firstAt, lastAt: legacy.lastAt })
        }
      }
      const t = isTrack(trackId) ? trackId : this.settingsOf(roleId).track
      return (all[t] = normalizeBond(all[t]))
    },
    /** Tracks of a role that have any history, for the overview. */
    tracksWithHistory(roleId) {
      const all = data.trackBonds[roleId] || {}
      return Object.keys(all).filter((t) => isTrack(t) && all[t].turns > 0)
    },
    recordTurn(roleId, sid) {
      const r = this.roleStatsOf(roleId)
      r.turns += 1
      r.lastAt = now()
      if (!r.firstAt) r.firstAt = now()
      const e = data.sessions[sid] || (data.sessions[sid] = {})
      e.counted = e.counted && typeof e.counted === 'object' ? e.counted : {}
      if (!e.counted[roleId]) { e.counted[roleId] = true; r.sessions += 1 }
      e.at = now()
      const b = this.bondOf(roleId)
      b.turns += 1
      b.lastAt = now()
      if (!b.firstAt) b.firstAt = now()
      const when = new Date(now())
      const today = when.toLocaleDateString('sv-SE')
      if (b.lastDay !== today) { b.lastDay = today; b.days += 1 }
      this.noteDay(today)
      if (when.getHours() >= 23 || when.getHours() < 5) this.bump('nightTurns')
      touch()
    },
    /** The role in force when the user sent turn N of a session (the last entries line up with the last turns). */
    noteTurnRole(sid, roleId) {
      const e = data.sessions[sid] || (data.sessions[sid] = {})
      if (!Array.isArray(e.turnRoles)) e.turnRoles = []
      e.turnRoles.push(roleId || '')
      if (e.turnRoles.length > 3000) e.turnRoles = e.turnRoles.slice(-3000)
      e.at = now()
      touch()
    },
    turnRolesOf: (sid) => (Array.isArray(data.sessions[sid]?.turnRoles) ? data.sessions[sid].turnRoles : []),
    recordSticker(roleId) { this.roleStatsOf(roleId).stickers += 1; this.bondOf(roleId).stickers += 1; touch() },
    recordTask(roleId) { this.roleStatsOf(roleId).tasks += 1; this.bondOf(roleId).tasks += 1; this.bump('tasks'); touch() },
    // ---- counters that belong to no single role, and the achievements themselves ----
    statsOf() {
      const st = data.stats
      for (const k of ['tasks', 'toolCalls', 'nightTurns', 'avatarEdits']) if (!Number.isFinite(st[k])) st[k] = 0
      if (!Array.isArray(st.days)) st.days = []
      if (!Array.isArray(st.levels)) st.levels = []
      return st
    },
    bump(name, n = 1) { const st = this.statsOf(); st[name] = (Number.isFinite(st[name]) ? st[name] : 0) + n; touch() },
    noteDay(day) { const st = this.statsOf(); if (!st.days.includes(day)) { st.days.push(day); if (st.days.length > 800) st.days = st.days.slice(-800); touch() } },
    noteLevel(level) { const st = this.statsOf(); if (!st.levels.includes(level)) { st.levels.push(level); touch() } },
    countPhrase(roleId, defId, n = 1) { const r = data.phrases[roleId] || (data.phrases[roleId] = {}); r[defId] = (r[defId] || 0) + n; touch() },
    phraseOf: (roleId, defId) => data.phrases[roleId]?.[defId] || 0,
    unlocked: () => data.achievements,
    /** @returns true when this key was not unlocked before */
    unlock(key) { if (data.achievements[key]) return false; data.achievements[key] = { at: now(), seen: false }; touch(); return true },
    markSeen(keys) { for (const k of keys) if (data.achievements[k]) data.achievements[k].seen = true; touch() },
    /**
     * Context size of a session; the growth since the last reading is credited to the role that was speaking.
     * `window` is the model's context window at that reading, kept so the panel can turn a percentage
     * threshold into tokens without asking the host again.
     */
    setTokens(sid, n, roleId, window) {
      const e = data.sessions[sid] || (data.sessions[sid] = {})
      const total = Math.max(0, Math.floor(n) || 0)
      const prev = Number.isFinite(e.tokens) ? e.tokens : 0
      if (roleId && total > prev) { e.roleTokens = e.roleTokens && typeof e.roleTokens === 'object' ? e.roleTokens : {}; e.roleTokens[roleId] = (e.roleTokens[roleId] || 0) + (total - prev) }
      e.tokens = total
      if (Number.isFinite(window) && window > 0) e.window = Math.floor(window)
      e.at = now()
      touch()
    },
    roleTokensOf: (sid, roleId) => (data.sessions[sid]?.roleTokens?.[roleId] || 0),
    tokensOf: (sid) => (data.sessions[sid] && Number.isFinite(data.sessions[sid].tokens) ? data.sessions[sid].tokens : 0),
    /** The context window the last reading of this session was taken against, if it was recorded. */
    windowOf: (sid) => (data.sessions[sid] && Number.isFinite(data.sessions[sid].window) && data.sessions[sid].window > 0 ? data.sessions[sid].window : undefined),
    touch,
    snapshot: () => data,
  }
}

/** Role cards: `<rolesDir>/<id>/card.json` merged over defaults; display name falls back to ROLE.md's `name:`. */
export function createCards(rolesDir) {
  const roleName = (id) => {
    try {
      const head = readFileSync(join(rolesDir, id, 'ROLE.md'), 'utf8').slice(0, 800)
      const m = head.match(/^name:\s*(.+)$/m)
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
    } catch { return '' }
  }
  const memo = new Map() // id -> { at, card }: the page asks every couple of seconds, the files rarely change
  return {
    get(id) {
      if (!isSafeId(id)) return normalizeCard({}, '')
      const hit = memo.get(id)
      if (hit && Date.now() - hit.at < 1500) return hit.card
      const card = normalizeCard(readJson(join(rolesDir, id, 'card.json'), {}), id)
      if (card.name === id) card.name = roleName(id) || id
      memo.set(id, { at: Date.now(), card })
      return card
    },
    /** Every role folder that has a card.json, in card order. */
    list() {
      let ids = []
      try { ids = readdirSync(rolesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && isSafeId(d.name) && existsSync(join(rolesDir, d.name, 'card.json'))).map((d) => d.name) } catch {}
      return ids.map((id) => this.get(id)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    },
    /** Absolute path of the card's image, only when it stays inside the role's own folder. */
    imageFile(id, card, kind = 'image') {
      const name = kind === 'avatar' && card.avatar ? card.avatar : card.image
      if (!isSafeId(id) || !name) return null
      const base = resolve(rolesDir, id)
      const file = resolve(base, name)
      if (!file.startsWith(base + sep) || !existsSync(file)) return null
      return file
    },
  }
}

/** Sticker library: packs are folders with index.db (memes table) and the image files. */
export function createLibrary(packsDir) {
  const cache = new Map() // packId -> { mtime, rows, allowed }
  const load = (packId) => {
    if (!isSafeId(packId)) return { rows: [], allowed: new Set() }
    const dbFile = join(packsDir, packId, 'index.db')
    let mtime
    try { mtime = statSync(dbFile).mtimeMs } catch { cache.delete(packId); return { rows: [], allowed: new Set() } }
    const hit = cache.get(packId)
    if (hit && hit.mtime === mtime) return hit
    let rows = []
    let db
    try {
      db = new DatabaseSync(dbFile, { readOnly: true })
      rows = db.prepare('SELECT path, tag, caption, keywords FROM memes').all().map((r) => ({
        id: `${packId}/${r.path}`,
        pack: packId,
        rel: r.path,
        tag: String(r.tag || ''),
        caption: String(r.caption || ''),
        keywords: String(r.keywords || ''),
      }))
    } catch { rows = [] } finally { try { db?.close() } catch {} }
    const entry = { mtime, rows, allowed: new Set(rows.map((r) => r.rel)) }
    cache.set(packId, entry)
    return entry
  }
  return {
    list: (packIds) => packIds.flatMap((p) => load(p).rows),
    byId(id) {
      const slash = String(id).indexOf('/')
      if (slash < 1) return null
      return load(id.slice(0, slash)).rows.find((r) => r.id === id) || null
    },
    /** Absolute file for /sticker/<pack>/<rel>, only for paths listed in that pack's index. */
    fileOf(packId, rel) {
      const entry = load(packId)
      if (!entry.allowed.has(rel)) return null
      const base = resolve(packsDir, packId)
      const file = resolve(base, rel)
      return file.startsWith(base + sep) && existsSync(file) ? file : null
    },
  }
}
