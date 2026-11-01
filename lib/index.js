/**
 * dsh-persona-kit host half.
 *
 *  - Prompt: per root agent, one scoped system-prompt section that says how strongly the active role should
 *    play (level 1-5). Re-registered when the level or the role changes.
 *  - Stickers: the role card names its sticker packs; the client asks POST /persona-kit/pick after each reply
 *    and the server decides (by level) whether one is due and which one. The model can also queue one with the
 *    send_sticker tool. Stickers are identified by "<pack>/<file>", never by their description.
 *  - HTTP (loopback only): GET /session, GET /sessions, POST /level, POST /pick, GET /asset, GET /sticker/<pack>/<file>.
 *
 * Which role a session has is read from dsh-persona-switcher's sessions.json (adapter: roleOf). That is the only
 * place that knows about it, so replacing the switcher later touches one function.
 */
import { readFileSync, statSync, createReadStream, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clampLevel, decideSticker, pickSticker, sectionText, STICKER_PLAN, MAX_LEVEL } from './core.js'
import { createCards, createLibrary, createStore, isSafeId } from './store.js'
import { affinityOf, titleOf, nextProgress, heatOf, rebirthDue, DEFAULT_TRIGGER_TOKENS } from './bond.js'
import { bondText, groups, TRACKS, titlesFor, isTrack } from './tracks.js'
import { installHandoff } from './handoff.js'
import { installToolGate } from './toolgate.js'
import { installRoles } from './roles.js'
import { trusted, sendJson as send } from './http.js'
import { setLang, getLang, resolveLang, pick } from './lang.js'
import { roleTimeline, mergeTurns } from './timeline.js'
import { MODES, recentTurns, sentMessages, buildPayload, buildSystem, cleanSuggestion, suggestLine, LABEL_WORDS } from './ghost.js'
import { createAvatars, MAX_BYTES } from './avatars.js'
import { createMemeApi } from './meme-api.js'
import { collectDefs, longestStreak, currentStreak, groupStats, keyOf } from './achievements.js'
import { titleIndexOf } from './bond.js'

export const name = 'dsh-persona-kit'
export const inject = ['tools', 'commands']

const ACH_DEFAULTS = (() => { try { return JSON.parse(readFileSync(new URL('../defaults/achievements.json', import.meta.url), 'utf8')) } catch { return { global: [], role: [] } } })()

const PREFIX = '/persona-kit'
const SECTION = 'persona-kit:level'
const SECTION_ORDER = 10400 // right after persona-switcher's role section (10300)
const QUEUE_TTL_MS = 10 * 60 * 1000
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh')
const kitHome = () => join(dshHome(), 'persona-kit')

export function readConfig() {
  let o = {}
  try { o = JSON.parse(readFileSync(join(kitHome(), 'config.json'), 'utf8').replace(/^﻿/, '')) } catch {}
  return {
    rolesDir: typeof o.rolesDir === 'string' && o.rolesDir ? o.rolesDir : join(dshHome(), 'roles'),
    packsDir: typeof o.packsDir === 'string' && o.packsDir ? o.packsDir : join(dshHome(), 'meme-packs'),
    roleSessionsFile: typeof o.roleSessionsFile === 'string' && o.roleSessionsFile ? o.roleSessionsFile : join(dshHome(), 'persona-switcher', 'sessions.json'),
    triggerTokens: Number.isFinite(o.triggerTokens) && o.triggerTokens > 0 ? Math.floor(o.triggerTokens) : DEFAULT_TRIGGER_TOKENS,
    // the kit's own role switcher; off until the third-party dsh-persona-switcher has been removed (two /role commands clash)
    roles: { enabled: o.roles?.enabled === true, defaultRole: typeof o.roles?.defaultRole === 'string' ? o.roles.defaultRole : '' },
    avatars: { ai: !(o.avatars && o.avatars.ai === false), user: !(o.avatars && o.avatars.user === false) },
    ghost: {
      provider: typeof o.ghost?.provider === 'string' ? o.ghost.provider : '',
      model: typeof o.ghost?.model === 'string' ? o.ghost.model : '',
      defaultMode: ['off', 'normal', 'affinity'].includes(o.ghost?.defaultMode) ? o.ghost.defaultMode : 'off',
      timeoutMs: Number.isFinite(o.ghost?.timeoutMs) ? Math.min(60000, Math.max(3000, o.ghost.timeoutMs)) : 20000,
    },
    // which sessions are chats with the user (workers, automations and imports must not raise affinity)
    countSessions: typeof o.countSessions === 'string' && o.countSessions ? o.countSessions : '^session-',
    // "auto" follows the machine's locale; "zh" / "en" force one
    language: ['zh', 'en', 'auto'].includes(o.language) ? o.language : 'zh',
    maxChars: Number.isFinite(o.maxChars) ? Math.min(5000, Math.max(100, o.maxChars)) : 700,
  }
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw new Error('too large'); chunks.push(c) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { const e = new Error('invalid JSON body'); e.status = 422; throw e }
}
async function readRaw(req, max = MAX_BYTES) {
  const chunks = []
  let size = 0
  for await (const c of req) { size += c.length; if (size > max) throw new Error('too large'); chunks.push(c) }
  return Buffer.concat(chunks)
}
/**
 * Candidates in the order pickSticker would weigh them, for preview only.
 *
 * pickSticker returns one picture and shuffles inside the winning tier, which is right for sending but
 * useless for "show me what you have". This scores the same way and keeps the order, so the preview and
 * the eventual pick agree about what fits. Recently sent pictures go last rather than disappearing:
 * a preview that hides them would look like the pack is smaller than it is.
 */
function rankStickers(stickers, text, recent = []) {
  const list = Array.isArray(stickers) ? stickers : []
  const scored = list.map((m) => {
    const kws = String(m.keywords || '').split(/[\s,、，]+/).filter((k) => k.length >= 2)
    const hits = kws.filter((k) => String(text || '').includes(k)).length
    return { m, score: hits, used: recent.includes(m.id) ? 1 : 0 }
  })
  scored.sort((a, b) => b.score - a.score || a.used - b.used || String(a.m.id).localeCompare(String(b.m.id)))
  return scored.map((x) => x.m)
}
function sendFile(res, file, { revalidate = false, req } = {}) {
  let st
  try { st = statSync(file) } catch { return send(res, 404, { ok: false, error: 'not found' }) }
  const headers = { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': revalidate ? 'private, no-cache' : 'private, max-age=3600' }
  if (revalidate) {
    // pictures the user can change: always ask, answer 304 when nothing changed
    headers['last-modified'] = st.mtime.toUTCString()
    const since = Date.parse(req?.headers?.['if-modified-since'] || '')
    if (Number.isFinite(since) && Math.floor(st.mtimeMs / 1000) * 1000 <= since) { res.writeHead(304, headers); return res.end() }
  }
  res.writeHead(200, { ...headers, 'content-length': st.size })
  createReadStream(file).pipe(res)
}

/** Build the service object. Split from apply() so tests can drive it without the host. */
export function createKit({ config = readConfig(), now = Date.now, rnd = Math.random } = {}) {
  setLang(resolveLang(config.language))
  const store = createStore(join(kitHome(), 'state.json'), now)
  const cards = createCards(config.rolesDir)
  const library = createLibrary(config.packsDir)
  const memes = createMemeApi({ packsDir: config.packsDir, dshHome, kitHome })

  let sessionsMtime = '' // mtime AND size: two writes inside one clock tick must not look like the same file
  let sessions = {}
  /** The role-per-session file, re-read only when it changed. */
  const sessionsTable = () => {
    try {
      const st = statSync(config.roleSessionsFile)
      const key = `${st.mtimeMs}:${st.size}`
      if (key !== sessionsMtime) { sessions = JSON.parse(readFileSync(config.roleSessionsFile, 'utf8')).sessions || {}; sessionsMtime = key }
    } catch { sessions = {}; sessionsMtime = '' }
    return sessions
  }
  const roleOf = (sid) => {
    const table = sessionsTable()
    // persona-switcher keys are bare session ids; tool-gate-era files used "session-<id>"
    const e = table[sid] || table[`session-${sid}`] || table[String(sid).replace(/^session-/, '')]
    return e && typeof e.role === 'string' && e.role ? e.role : ''
  }

  const view = (sid) => {
    const roleId = roleOf(sid)
    if (!roleId) return { roleId: '', level: store.levelOf(sid, ''), card: null }
    return { roleId, level: store.levelOf(sid, roleId), card: cards.get(roleId) }
  }

  /** The user's own avatar: ~/.dsh/persona-kit/user-avatar.(png|jpg|jpeg|webp|gif), if they put one there. */
  const avatars = createAvatars(kitHome(), config.avatars)
  const userAvatarFile = () => avatars.fileOf('user')
  /** One role's avatar picture: the user's own pick first, then the role card's. */
  const roleAvatarFile = (roleId) => avatars.fileOf(`role:${roleId}`) || cards.imageFile(roleId, cards.get(roleId), 'avatar')
  let countRe
  try { countRe = new RegExp(config.countSessions) } catch { countRe = /^session-/ }
  const countable = (sid) => countRe.test(String(sid))
  const toolTurn = new Map() // sid -> role that used a tool during the turn in progress
  const bondView = (roleId, card, sid) => {
    const set = store.settingsOf(roleId)
    const track = TRACKS[set.track]
    const b = store.bondOf(roleId, set.track) // this relationship's own numbers
    const role = store.roleStatsOf(roleId) // facts about the role as a whole
    const tokens = sid ? store.tokensOf(sid) : 0
    const p = nextProgress(b, set.track)
    const titles = titlesFor(set.track, card.titles)
    return {
      track: set.track, trackName: track.name, metric: track.metric, nickname: set.nickname, nicknames: track.nicknames,
      title: titleOf(b, titles, set.track), affinity: affinityOf(b, set.track),
      turns: role.turns, stickers: role.stickers, sessions: role.sessions, rebirths: b.rebirths, days: b.days, tasks: b.tasks,
      next: p.next === null ? '' : titles[p.next], progress: p.fraction, need: p.need,
      others: store.tracksWithHistory(roleId).filter((t) => t !== set.track).map((t) => ({ id: t, name: TRACKS[t].name, metric: TRACKS[t].metric, affinity: affinityOf(store.bondOf(roleId, t), t), title: titleOf(store.bondOf(roleId, t), titlesFor(t, card.titles), t) })),
      heat: heatOf(sid ? store.roleTokensOf(sid, roleId) : 0, config.triggerTokens), sessionHeat: heatOf(tokens, config.triggerTokens), tokens,
      rebirthDue: rebirthDue(tokens, config.triggerTokens), firstAt: role.firstAt, lastAt: role.lastAt,
    }
  }

  return {
    config, store, cards, library, roleOf, view, bondView, countable, userAvatarFile, roleAvatarFile, avatars, memes,
    /** Prompt text for a session, or '' when it has no role. */
    promptFor(sid) {
      if (!countable(sid)) return '' // a worker or automation session gets her persona (if any) but none of the chat flavour
      const v = view(sid)
      if (!v.card) return ''
      const set = store.settingsOf(v.roleId)
      const title = titleOf(store.bondOf(v.roleId, set.track), titlesFor(set.track, v.card.titles), set.track)
      return sectionText(v.card, v.level, bondText(set.track, title, set.nickname))
    },
    session(sid) {
      const v = view(sid)
      if (!v.card) return { ok: true, roleId: '', level: v.level, max: MAX_LEVEL, carryRole: store.carryOf(sid), achievementsFresh: this.freshAchievements(), ghostDefault: config.ghost.defaultMode, lang: getLang() }
      return {
        ok: true, roleId: v.roleId, name: v.card.name, accent: v.card.accent, level: v.level, max: MAX_LEVEL,
        levels: v.card.levels.map((l) => ({ name: l.name, line: l.line })),
        image: cards.imageFile(v.roleId, v.card) ? `${PREFIX}/asset?role=${encodeURIComponent(v.roleId)}` : '',
        stickers: STICKER_PLAN[v.level].gap > 0,
        avatar: roleAvatarFile(v.roleId) ? `${PREFIX}/asset?role=${encodeURIComponent(v.roleId)}&kind=avatar` : '',
        userAvatar: userAvatarFile() ? `${PREFIX}/user-avatar` : '',
        avatarSettings: avatars.settings(),
        achievementsFresh: this.freshAchievements(),
        ghostDefault: config.ghost.defaultMode,
        lang: getLang(),
        bond: bondView(v.roleId, v.card, sid),
      }
    },
    /**
     * Which role every session is on, small enough to send in one answer. The pill asks for this once, so a
     * session switch can draw the role it is about to show instead of falling back to the unbound label while
     * /session is still in flight.
     */
    sessionRoles() {
      const out = {}
      let n = 0
      for (const key of Object.keys(sessionsTable())) {
        const sid = String(key).replace(/^session-/, '')
        if (!sid || sid in out) continue
        const roleId = roleOf(sid) // roleOf resolves both bare and "session-<id>" keys
        const card = roleId ? cards.get(roleId) : null
        if (!card || !card.name) continue // no role at all: the pill stays on the plain label
        const level = clampLevel(store.levelOf(sid, roleId))
        // Exactly what /session will answer, so the pill reads the same before and after the switch lands.
        out[sid] = { role: roleId, name: card.name, accent: card.accent, level, levelName: card.levels[level - 1].name }
        if (++n >= 2000) break
      }
      return out
    },
    /** Every role with a card: its bond numbers, for the overview panel. */
    // ---- achievements ----
    achDefs(roleId) { return collectDefs(ACH_DEFAULTS, roleId ? cards.get(roleId).achievements : []) },
    metrics(roleId) {
      const roleIds = cards.list().map((c) => c.id)
      const st = store.statsOf()
      const rolesStats = roleIds.map((id) => store.roleStatsOf(id))
      const tried = new Set()
      for (const id of roleIds) for (const t of store.tracksWithHistory(id)) tried.add(t)
      const g = {
        turnsTotal: rolesStats.reduce((n, r) => n + r.turns, 0), rolesMet: rolesStats.filter((r) => r.turns > 0).length,
        sessionsTotal: rolesStats.reduce((n, r) => n + r.sessions, 0), streak: longestStreak(st.days), nightTurns: st.nightTurns,
        rebirthsTotal: rolesStats.reduce((n, r) => n + r.rebirths, 0), stickersTotal: rolesStats.reduce((n, r) => n + r.stickers, 0),
        tasksTotal: st.tasks, toolCalls: st.toolCalls, levelsUsed: st.levels.length,
        tracksTried: new Set([...tried].map((t) => TRACKS[t].group)).size, avatarEdits: st.avatarEdits, ghostAccepts: st.ghostAccepts,
      }
      if (!roleId) return { global: g }
      const r = store.roleStatsOf(roleId)
      const tracks = store.tracksWithHistory(roleId)
      const affs = tracks.map((t) => affinityOf(store.bondOf(roleId, t), t))
      const best = Math.max(0, ...affs)
      return {
        global: g,
        role: { turns: r.turns, stickers: r.stickers, sessions: r.sessions, rebirths: r.rebirths, tasks: r.tasks, days: Math.max(0, ...tracks.map((t) => store.bondOf(roleId, t).days)), affinity: best, titleIndexMax: titleIndexOf(best), trackKinds: new Set(tracks.map((t) => TRACKS[t].group)).size },
      }
    },
    valueFor(def, m, roleId) {
      if (def.scope === 'global') return Number(m.global[def.metric]) || 0
      if (def.metric === 'phrase') return store.phraseOf(roleId, def.id)
      return Number(m.role?.[def.metric]) || 0
    },
    /** Unlock whatever is now earned (global ones, and this role's). @returns keys unlocked just now */
    checkAchievements(roleId) {
      const m = this.metrics(roleId)
      const fresh = []
      for (const def of this.achDefs(roleId)) {
        if (def.scope === 'role' && !roleId) continue
        if (this.valueFor(def, m, roleId) >= def.gte && store.unlock(keyOf(def, roleId))) fresh.push(keyOf(def, roleId))
      }
      return fresh
    },
    /** Everything for the panel: every global definition, and one role's own. */
    achievementList(roleId) {
      const m = this.metrics(roleId)
      const have = store.unlocked()
      return this.achDefs(roleId).filter((d) => d.scope === 'global' || roleId).map((d) => {
        const key = keyOf(d, roleId)
        const got = have[key]
        const value = this.valueFor(d, m, roleId)
        const item = {
          key, id: d.id, scope: d.scope, series: d.series, hidden: !!d.hidden,
          name: d.name, desc: d.desc, reward: d.reward || '', gte: d.gte,
          value: Math.min(value, d.gte), unlocked: !!got, at: got?.at || 0,
        }
        // a hidden badge says nothing until it is earned: not the condition, not the progress. Masked here, on
        // the server, because a guard in the panel would still hand the answer to anyone who opens the network tab.
        if (d.hidden && !got) { item.desc = ''; item.reward = ''; item.gte = 0; item.value = 0 }
        return item
      })
    },
    /** The panel's whole answer: the badges, their series with counts, and the numbers shown above them. */
    achievementView(roleId) {
      const list = this.achievementList(roleId)
      const have = store.unlocked()
      const m = this.metrics(roleId)
      const st = store.statsOf()
      const defs = this.achDefs(roleId).filter((d) => d.scope === 'global' || roleId)
      return {
        list,
        series: groupStats(defs, (d) => !!have[keyOf(d, roleId)]),
        summary: {
          badges: list.filter((x) => x.unlocked).length, total: list.length, days: st.days.length,
          streakNow: currentStreak(st.days, new Date(now()).toLocaleDateString('sv-SE')),
          streakBest: longestStreak(st.days), turns: m.global.turnsTotal,
        },
      }
    },
    /** Unlocks the user has not been told about yet. */
    freshAchievements() {
      const have = store.unlocked()
      const out = []
      for (const [key, v] of Object.entries(have)) {
        if (v.seen) continue
        const [id, roleId = ''] = key.split('@')
        const def = this.achDefs(roleId).find((d) => d.id === id && (d.scope === 'global') === !roleId)
        if (def) out.push({ key, id, name: def.name, desc: def.desc, reward: def.reward || '', role: roleId, roleName: roleId ? cards.get(roleId).name : '' })
      }
      return out.slice(0, 4)
    },
    toolCalled(sid, name) {
      const roleId = roleOf(sid)
      if (!countable(sid)) return roleId
      store.bump('toolCalls')
      if (roleId) toolTurn.set(sid, roleId)
      return roleId
    },
    ghostAccepted() { store.bump('ghostAccepts'); return this.checkAchievements(''), 1 },
    avatarEdited() { store.bump('avatarEdits'); this.checkAchievements(''); return 1 },

    /** Who she is and how close you are, for the affinity-mode suggestion prompt. */
    ghostInfo(sid) {
      const v = view(sid)
      if (!v.card) return {}
      const b = bondView(v.roleId, v.card, sid)
      return { name: v.card.name, track: b.track, trackName: b.trackName, title: b.title, stage: titleIndexOf(b.affinity), nickname: b.nickname, group: TRACKS[b.track].group }
    },
    stats() {
      return cards.list().map((c) => ({ id: c.id, name: c.name, accent: c.accent, image: cards.imageFile(c.id, c) ? `${PREFIX}/asset?role=${encodeURIComponent(c.id)}` : '', ...bondView(c.id, c, '') }))
    },
    /** A real user message arrived in this session. */
    userTurn(sid) {
      const roleId = roleOf(sid)
      if (!countable(sid)) return roleId
      store.noteTurnRole(sid, roleId)
      // a turn that used tools was something done together: credit it to the role that did it
      const worked = toolTurn.get(sid)
      if (worked) { store.recordTask(worked); toolTurn.delete(sid) }
      if (roleId) store.recordTurn(roleId, sid)
      this.checkAchievements(roleId || worked || '')
      return roleId
    },
    /** The session handed off to a new one: the role is reborn. */
    rebirth(sid) {
      const roleId = roleOf(sid)
      if (roleId) store.recordRebirth(roleId)
      this.checkAchievements(roleId || '')
      return roleId
    },
    setBond(sid, patch) {
      const roleId = roleOf(sid)
      if (!roleId) return null
      const set = store.setSettings(roleId, { track: isTrack(patch.track) ? patch.track : undefined, nickname: patch.nickname })
      this.checkAchievements(roleId)
      return set
    },
    setLevel(sid, level) {
      const v = view(sid)
      const k = store.setLevel(sid, v.roleId, level)
      this.checkAchievements(v.roleId)
      return k
    },
    /**
     * The pictures this session may draw from: the role's own packs, or one named pack.
     * A named pack that does not resolve falls back to the role's packs, so a stale pack id can never
     * leave the model with no pictures at all.
     */
    stickerPool(sid, packId) {
      const v = view(sid)
      if (!v.card) return []
      if (typeof packId === 'string' && packId) {
        const named = library.list([packId])
        if (named.length > 0) return named
      }
      return library.list(v.card.packs)
    },
    /** The model queued a sticker for the reply it is writing. */
    queue(sid, { mood, query, packId }) {
      const v = view(sid)
      if (!v.card) return { ok: false, note: pick('这个会话没有绑定角色，没有可用的表情包。', 'This session has no role, so there are no stickers.') }
      if (!STICKER_PLAN[v.level].tool) return { ok: false, note: pick('当前说话强度不发表情包，这次不用发。', 'The current intensity level sends no stickers; skip it this time.') }
      let list = this.stickerPool(sid, packId)
      if (list.length === 0) return { ok: false, note: pick('这个角色没有配表情包。', 'This role has no sticker packs.') }
      if (mood) { const byTag = list.filter((m) => m.tag === mood); if (byTag.length) list = byTag }
      const st = store.sticker(sid)
      const m = pickSticker(list, `${query || ''}`, st.recent, rnd)
      if (!m) return { ok: false, note: pick('没有可用的表情包。', 'No sticker is available.') }
      st.queued = { id: m.id, at: now(), role: v.roleId }
      store.touch()
      return { ok: true, note: pick('表情已选好，会自动显示在你这条回复的下面。不要在文字里再写任何图片标记，也不用描述它。', 'The sticker is chosen and will appear under your reply by itself. Do not write any image marker in the text and do not describe it.') }
    },
    /**
     * Look at the candidates without committing to one.
     *
     * Deliberately a separate function from queue(): queue() sets st.queued, and pick() clears st.queued
     * unconditionally when a turn ends, so previewing through queue() would throw away a sticker the model
     * had already chosen. Nothing here reads or writes session state.
     */
    preview(sid, { mood, query, packId, limit = 8 }) {
      const v = view(sid)
      if (!v.card) return { ok: false, note: pick('这个会话没有绑定角色，没有可用的表情包。', 'This session has no role, so there are no stickers.'), memes: [] }
      let list = this.stickerPool(sid, packId)
      if (list.length === 0) return { ok: false, note: pick('这个角色没有配表情包。', 'This role has no sticker packs.'), memes: [] }
      if (mood) { const byTag = list.filter((m) => m.tag === mood); if (byTag.length) list = byTag }
      const st = store.sticker(sid)
      const ranked = rankStickers(list, `${query || ''}`, st.recent)
      const asked = Number(limit)
      const n = Number.isFinite(asked) && asked > 0 ? Math.min(20, Math.floor(asked)) : 8
      const memes = ranked.slice(0, n).map((m) => ({ id: m.id, tag: m.tag, caption: m.caption, keywords: m.keywords }))
      return { ok: true, memes, note: pick('上面是候选。看中哪张就用它的描述调用 send_sticker。', 'Those are the candidates; call send_sticker with the description of the one you want.') }
    },
    /** After a reply: is a sticker due, and which one? */
    pick(sid, { text, plain }) {
      const v = view(sid)
      if (!v.card) return { ok: true, url: '', why: 'no-role' }
      let phrased = false
      for (const d of this.achDefs(v.roleId)) if (d.metric === 'phrase') { try { if (new RegExp(d.pattern, 'i').test(String(text || ''))) { store.countPhrase(v.roleId, d.id); phrased = true } } catch {} }
      if (phrased) this.checkAchievements(v.roleId)
      const list = library.list(v.card.packs)
      if (list.length === 0) return { ok: true, url: '', why: 'no-pack' }
      const plan = STICKER_PLAN[v.level]
      const st = store.sticker(sid)
      let chosen = null
      let why = ''
      if (st.queued && st.queued.role === v.roleId && plan.tool && now() - st.queued.at < QUEUE_TTL_MS) {
        chosen = library.byId(st.queued.id)
        why = 'model'
      }
      st.queued = null
      if (chosen) st.sinceLast = 0
      else {
        const d = decideSticker({ level: v.level, text, plain, maxChars: config.maxChars }, st)
        why = d.why
        if (d.show) chosen = pickSticker(list, String(text || ''), st.recent, rnd)
      }
      store.touch()
      if (!chosen) return { ok: true, url: '', why }
      st.recent = [...st.recent, chosen.id].slice(-10)
      store.recordSticker(v.roleId)
      this.checkAchievements(v.roleId)
      return { ok: true, url: `${PREFIX}/sticker/${encodeURIComponent(chosen.pack)}/${chosen.rel.split('/').map(encodeURIComponent).join('/')}`, id: chosen.id, why }
    },
  }
}

export function apply(ctx) {
  const kit = createKit()
  const log = (m) => ctx.logger?.info?.(`[persona-kit] ${m}`)
  const warn = (m) => ctx.logger?.warn?.(`[persona-kit] ${m}`)

  // ---- per-agent level section ----
  const isRoot = (agent) => !(typeof agent?.depth === 'number' && agent.depth > 0)
  const applied = new Map() // sid -> { agent, text, dispose }
  const promptOf = (agent) => {
    const c = agent?.ctx
    if (!c) return undefined
    try { return typeof c.get === 'function' ? c.get('systemPrompt') : c.systemPrompt } catch { return undefined }
  }
  const release = (sid) => {
    const st = applied.get(sid)
    if (!st) return
    try { st.dispose?.() } catch {}
    applied.delete(sid)
  }
  const evaluate = (agent) => {
    const sid = agent?.session?.id
    if (typeof sid !== 'string' || !isRoot(agent)) return
    try {
      const text = kit.promptFor(sid)
      const st = applied.get(sid)
      if (st && st.agent === agent && st.text === text) return
      release(sid)
      if (!text) return
      const prompt = promptOf(agent)
      if (!prompt || typeof prompt.section !== 'function') return
      const dispose = prompt.section({ name: SECTION, order: SECTION_ORDER, text })
      applied.set(sid, { agent, text, dispose })
    } catch (error) {
      warn(`evaluate ${sid} failed: ${String(error)}`)
    }
  }
  const agents = new Map()
  const track = (agent) => { const sid = agent?.session?.id; if (typeof sid === 'string' && isRoot(agent)) { agents.set(sid, agent); evaluate(agent) } }
  ctx.on('agent/created', ({ agent }) => track(agent), { global: true })
  const service = (key) => { try { return ctx.get?.(key) } catch { return undefined } }
  const userTextOf = (message) => {
    if (!message || message.role !== 'user' || (message.source?.kind !== undefined && message.source.kind !== 'user')) return ''
    return (Array.isArray(message.content) ? message.content : []).filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join(' ')
  }
  const turnsBySid = new Map()
  const lastRoleBySid = new Map()
  ctx.on('agent/inbox/inserted', ({ message, agent }) => {
    const sid = agent?.session?.id
    if (typeof sid === 'string' && isRoot(agent) && userTextOf(message)) {
      try {
        kit.userTurn(sid)
        // measuring walks the whole session, so only every 4th user message (dsh-handoff does the same)
        const n = (turnsBySid.get(sid) || 0) + 1
        turnsBySid.set(sid, n)
        // a role switch forces a reading, so the growth so far is credited to the role that was speaking
        const role = kit.roleOf(sid)
        const before = lastRoleBySid.get(sid)
        lastRoleBySid.set(sid, role)
        const switched = before !== undefined && before !== role
        if (switched || n % 4 === 1) {
          const total = service('tokenMeter')?.measure?.(agent.session)?.totalTokens
          if (Number.isFinite(total)) kit.store.setTokens(sid, total, switched ? before : role)
        }
      } catch (error) { warn(`bond update failed: ${String(error)}`) }
    }
    track(agent)
  }, { global: true })
  const eventsOf = (sid) => {
    const sess = service('sessions')?.get?.(sid)
    if (!sess) return null
    const seqs = [...sess.surface.nodes]
    // a cheap fingerprint: the log only ever grows, so same length and same last seq = same content
    const sig = `${seqs.length}:${seqs.length ? seqs[seqs.length - 1] : 0}`
    let built
    return { sess, sig, get events() { return (built ??= seqs.map((q) => sess.eventAt(q))) } }
  }
  const timelineMemo = new Map() // sid -> { sig, turns }
  const logTurns = (sid, got) => {
    const hit = timelineMemo.get(sid)
    if (hit && hit.sig === got.sig) return hit.turns
    const turns = roleTimeline(got.events)
    timelineMemo.set(sid, { sig: got.sig, turns })
    if (timelineMemo.size > 30) timelineMemo.delete(timelineMemo.keys().next().value)
    return turns
  }
  const routeOf = (sess) => {
    const pin = kit.config.ghost
    if (pin.provider && pin.model) return { provider: pin.provider, model: pin.model }
    let sel
    try { sel = sess?.requestHeader?.()?.config } catch {}
    if (!sel) { try { sel = service('agentDefaultModel')?.currentSelection?.() } catch {} }
    return sel && typeof sel.provider === 'string' && sel.provider && typeof sel.model === 'string' && sel.model ? { provider: sel.provider, model: sel.model } : null
  }
  const ghostBySid = new Map() // sid -> { controller, at, key, text }
  async function suggest(sid, mode, debug) {
    if (!MODES.includes(mode) || mode === 'off') return { ok: true, text: '', why: 'off' }
    const got = eventsOf(sid)
    if (!got) return { ok: false, error: 'no session' }
    const turns = recentTurns(got.events)
    if (turns.length === 0 || turns[turns.length - 1].who !== 'assistant') return { ok: true, text: '', why: 'no-reply' }
    const lastSeq = Math.max(0, ...got.events.filter(Boolean).map((e) => e.seq ?? 0))
    const gi = kit.ghostInfo(sid)
    // the suggestion depends on who she is and the kind and closeness of the bond, not only on the last message
    const key = `${mode}|${gi.name || ''}|${gi.track || ''}|${gi.stage ?? ''}|${gi.nickname || ''}|${lastSeq}`
    const st = ghostBySid.get(sid) || { controller: null, at: 0, key: '', text: '' }
    ghostBySid.set(sid, st)
    if (st.key === key) return { ok: true, text: st.text, why: 'cached' }
    const llm = service('llm')
    const route = routeOf(got.sess)
    if (!llm || typeof llm.stream !== 'function') return { ok: false, error: 'no model route' }
    if (!route) return { ok: false, error: 'no model selected' }
    try { st.controller?.abort() } catch {}
    const controller = new AbortController()
    st.controller = controller
    const timer = setTimeout(() => controller.abort(), kit.config.ghost.timeoutMs)
    try {
      const payload = buildPayload(turns)
      const raw = await suggestLine(llm, route, { sessionId: sid, system: buildSystem(mode, kit.ghostInfo(sid)), payload, signal: controller.signal })
      let text = cleanSuggestion(raw)
      if (mode === 'affinity' && LABEL_WORDS.test(text)) {
        // she must feel the bond, not read its name: ask once more, and give nothing rather than a labelled line
        const again = await suggestLine(llm, route, { sessionId: sid, system: buildSystem(mode, kit.ghostInfo(sid)), payload: payload + pick('\n\n（上一句里出现了称谓或关系的字眼。请重写，整句话里一个称谓都不要有。）', '\n\n(The last line contained a title or relationship word. Rewrite it with no title or relationship word anywhere in it.)'), signal: controller.signal })
        text = cleanSuggestion(again)
        if (LABEL_WORDS.test(text)) text = ''
      }
      if (st.controller === controller) { st.key = key; st.text = text; st.at = Date.now() }
      return { ok: true, text, why: 'fresh', ...(debug ? { route, payload, raw } : {}) }
    } catch (error) {
      return controller.signal.aborted ? { ok: true, text: '', why: 'superseded' } : { ok: false, error: String(error?.message || error) }
    } finally { clearTimeout(timer) }
  }

  // tools used together: every tool call counts, and a turn with any tool call is a "thing done"
  const IGNORED_TOOLS = new Set(['send_sticker', 'enable_tools', 'role_probe', 'handoff_new_session'])
  ctx.on('session/event', (session, event) => {
    const sid = session?.id
    if (typeof sid !== 'string' || event?.type !== 'tool/call') return
    const name = event.data?.name
    if (typeof name !== 'string' || IGNORED_TOOLS.has(name)) return
    try { kit.toolCalled(sid, name) } catch (error) { warn(`tool count failed: ${String(error)}`) }
  })

  // role switcher (lib/roles.js): the library, the per-session role, /role. Off by default.
  if (kit.config.roles.enabled) {
    try { installRoles(ctx, { rolesDir: kit.config.rolesDir, stateFile: kit.config.roleSessionsFile, defaultRole: kit.config.roles.defaultRole }) } catch (error) { warn(`role switcher failed to start: ${String(error)}`) }
  }

  // tool gate (lib/toolgate.js): heavy tool groups start hidden and come back per session on request
  installToolGate(ctx, {
    kit,
    configFile: join(kitHome(), 'tool-gate.json'),
    defaultsFile: fileURLToPath(new URL('../defaults/tool-gate.json', import.meta.url)),
    storeFile: join(kitHome(), 'tool-gate-state.json'),
    legacyStoreFile: join(dshHome(), 'tool-gate', 'sessions.json'),
  })

  // rebirth: the handoff tool (lib/handoff.js) records it and tells the new session which role to start as
  installHandoff(ctx, {
    kit, triggerTokens: kit.config.triggerTokens, dir: join(kitHome(), 'handoff'),
    onRebirth: (parentSid, childSid) => {
      const role = kit.rebirth(parentSid)
      if (role && childSid) kit.store.setCarry(childSid, role)
      const agent = agents.get(parentSid)
      if (agent) evaluate(agent)
    },
  })
  ctx.inject(['agents'], (scoped) => { for (const agent of scoped.agents.list()) track(agent) })

  // ---- the one model-facing tool ----
  ctx.effect(() => ctx.tools.register({
    name: 'send_sticker',
    description: pick('给当前这条回复配一张角色自己的表情包。只在气氛合适时用，发完让图自己说话。图会自动显示在回复下方，文字里不要写图片标记或描述。可选 mood（happy/sad/angry/shy/confused/daily）或 query（想表达的意思，几个词）。', 'Attach one of the role\'s own stickers to the reply you are writing. Use it only when the mood fits and let the picture speak. The picture appears under the reply by itself, so do not write an image marker or a description in the text. Optional: mood (happy/sad/angry/shy/confused/daily) or query (what you want to express, a few words).'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mood: { type: 'string', description: pick('情绪：happy、sad、angry、shy、confused、daily 之一', 'Mood: one of happy, sad, angry, shy, confused, daily') },
        query: { type: 'string', description: pick('想表达的意思，几个词', 'What you want to express, a few words') },
        packId: { type: 'string', description: pick('可选：只在某个图库里挑（不给就用角色自己配的那几个）', 'Optional: draw only from this pack (leave out to use the role\'s own packs)') },
        preview: { type: 'boolean', description: pick('只看候选、先不发：返回若干张的分类和描述，不占名额。挑好了再不带 preview 调用一次。', 'List candidates without sending: returns a few categories and descriptions and commits to nothing. Call again without preview once you have picked one.') },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          note: { type: 'string' },
          memes: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { id: { type: 'string' }, tag: { type: 'string' }, caption: { type: 'string' }, keywords: { type: 'string' } } } },
        },
        required: ['ok', 'note'],
      },
      render: (_a, value) => {
        const lines = [value.note]
        for (const m of Array.isArray(value.memes) ? value.memes : []) {
          lines.push(`${m.tag || ''}${m.tag ? ': ' : ''}${m.caption || m.keywords || m.id}`)
        }
        return [{ type: 'text', text: lines.filter(Boolean).join('\n') }]
      },
    },
    async execute(args, exec) {
      const sid = exec?.agent?.session?.id
      if (typeof sid !== 'string') return { ok: false, note: pick('没有会话。', 'No session.') }
      const mood = typeof args?.mood === 'string' ? args.mood : ''
      const query = typeof args?.query === 'string' ? args.query : ''
      const packId = typeof args?.packId === 'string' ? args.packId : ''
      // preview is its own read-only path: routing it through queue() would write st.queued, and pick()
      // clears that unconditionally, so looking before buying would discard a sticker already chosen.
      if (args?.preview === true) return kit.preview(sid, { mood, query, packId })
      return kit.queue(sid, { mood, query, packId })
    },
  }), 'persona-kit.tool')

  // ---- HTTP ----
  const handle = async (req, res) => {
    if (!trusted(req)) return send(res, 403, { ok: false, error: 'loopback only' })
    const url = new URL(req.url || '/', 'http://x')
    const path = url.pathname.slice(PREFIX.length)
    try {
      if (req.method === 'GET' && path === '/session') {
        const sid = url.searchParams.get('session') || ''
        return send(res, 200, kit.session(sid))
      }
      if (req.method === 'GET' && path === '/sessions') return send(res, 200, { ok: true, sessions: kit.sessionRoles() })
      if (req.method === 'POST' && path === '/level') {
        const body = await readBody(req)
        if (typeof body.session !== 'string' || !body.session) return send(res, 422, { ok: false, error: 'session required' })
        const level = kit.setLevel(body.session, clampLevel(body.level))
        const agent = agents.get(body.session)
        if (agent) evaluate(agent)
        return send(res, 200, { ok: true, level })
      }
      if (req.method === 'POST' && path === '/pick') {
        const body = await readBody(req)
        if (typeof body.session !== 'string' || !body.session) return send(res, 422, { ok: false, error: 'session required' })
        return send(res, 200, kit.pick(body.session, { text: String(body.text || ''), plain: body.plain === true }))
      }
      if (req.method === 'GET' && path === '/tracks') return send(res, 200, { ok: true, groups: groups().map(([id, name]) => ({ id, name, tracks: Object.entries(TRACKS).filter(([, t]) => t.group === id).map(([tid, t]) => ({ id: tid, name: t.name, nicknames: t.nicknames })) })) })
      if (req.method === 'POST' && path === '/bond') {
        const body = await readBody(req)
        if (typeof body.session !== 'string' || !body.session) return send(res, 422, { ok: false, error: 'session required' })
        const set = kit.setBond(body.session, { track: body.track, nickname: body.nickname })
        const agent = agents.get(body.session)
        if (agent) evaluate(agent)
        return send(res, 200, { ok: !!set, settings: set })
      }
      if (req.method === 'POST' && path === '/carried') {
        const body = await readBody(req)
        if (typeof body.session === 'string') kit.store.clearCarry(body.session)
        return send(res, 200, { ok: true })
      }
      if (req.method === 'GET' && path === '/achievements') {
        const roleId = url.searchParams.get('role') || ''
        const view = kit.achievementView(isSafeId(roleId) && kit.cards.list().some((c) => c.id === roleId) ? roleId : '')
        return send(res, 200, { ok: true, unlocked: view.summary.badges, total: view.summary.total, ...view })
      }
      if (req.method === 'POST' && path === '/achievements/seen') {
        const body = await readBody(req)
        kit.store.markSeen(Array.isArray(body.keys) ? body.keys.map(String).slice(0, 20) : [])
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && path === '/event') {
        const body = await readBody(req)
        if (body.type === 'ghost-accept') kit.ghostAccepted()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && path === '/suggest') {
        const body = await readBody(req)
        if (typeof body.session !== 'string' || !body.session) return send(res, 422, { ok: false, error: 'session required' })
        return send(res, 200, await suggest(body.session, String(body.mode || 'normal'), body.debug === true))
      }
      if (req.method === 'GET' && path === '/sent') {
        // the n-th most recent thing the user sent in this session (0 = latest), for the up/down history keys
        const got = eventsOf(url.searchParams.get('session') || '')
        if (!got) return send(res, 200, { ok: false })
        const list = sentMessages(got.events)
        const n = Math.max(0, Math.floor(Number(url.searchParams.get('index')) || 0))
        const text = list[list.length - 1 - n]
        return send(res, 200, text === undefined ? { ok: false, end: true } : { ok: true, text })
      }
      if (req.method === 'GET' && path === '/probe') {
        // diagnostics: which system-prompt pieces did this session actually receive (role text, level, bond)?
        const sid = url.searchParams.get('session') || ''
        const got = eventsOf(sid)
        if (!got) return send(res, 200, { ok: false })
        const needle = (url.searchParams.get('needle') || '').slice(0, 40)
        const nodes = []
        for (const ev of got.events) {
          if (ev?.type !== 'system/message') continue
          const blocks = ev.data?.message?.content ?? ev.data?.content ?? []
          const text = (Array.isArray(blocks) ? blocks : []).map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ')
          nodes.push({ seq: ev.seq, chars: text.length, hasNeedle: needle ? text.includes(needle) : null, hasLevel: /说话强度|Speaking intensity/.test(text), hasBond: /目前的关系|current relationship/i.test(text), head: text.slice(0, 60).replace(/\n/g, ' ') })
        }
        return send(res, 200, { ok: true, role: kit.roleOf(sid), level: kit.session(sid).level, promptNow: kit.promptFor(sid).slice(0, 120), nodes: nodes.slice(-8) })
      }
      if (req.method === 'GET' && path === '/timeline') {
        // which role spoke at each user turn, rebuilt from the session's own events (covers turns from before this plugin)
        const sid = url.searchParams.get('session') || ''
        const s = service('sessions')?.get?.(sid)
        if (!s) return send(res, 200, { ok: false, turns: [] })
        const events = []
        try { for (const seq of s.surface.nodes) events.push(s.eventAt(seq)) } catch { return send(res, 200, { ok: false, turns: [] }) }
        // what this plugin saw (exact, from now on) over what the notices in the log imply (covers older turns)
        const fromLog = logTurns(sid, got)
        const mine = kit.store.turnRolesOf(sid)
        const turns = mergeTurns(fromLog, mine)
        return send(res, 200, { ok: true, turns })
      }
      if (req.method === 'GET' && path === '/stats') return send(res, 200, { ok: true, roles: kit.stats() })
      if (req.method === 'GET' && path === '/roles') {
        const roles = kit.cards.list().map((c) => ({ id: c.id, name: c.name, accent: c.accent, order: c.order, avatar: !!kit.roleAvatarFile(c.id), bond: (() => { const b = kit.bondView(c.id, c, ''); return { trackName: b.trackName, metric: b.metric, title: b.title, affinity: b.affinity } })(), image: kit.cards.imageFile(c.id, c) ? `${PREFIX}/asset?role=${encodeURIComponent(c.id)}` : '' }))
        return send(res, 200, { ok: true, roles })
      }
      if (req.method === 'GET' && path === '/user-avatar') {
        const f = kit.userAvatarFile()
        return f ? sendFile(res, f, { revalidate: true, req }) : send(res, 404, { ok: false, error: 'not found' })
      }
      if (req.method === 'GET' && path === '/avatar-settings') return send(res, 200, { ok: true, settings: kit.avatars.settings(), userAvatar: kit.userAvatarFile() ? `${PREFIX}/user-avatar` : '', lang: getLang() })
      if (req.method === 'POST' && path === '/avatar-settings') {
        const body = await readBody(req)
        const settings = kit.avatars.setSettings(body)
        kit.avatarEdited()
        return send(res, 200, { ok: true, settings })
      }
      if (req.method === 'POST' && path === '/avatar-upload') {
        const target = url.searchParams.get('target') || ''
        if (!kit.avatars.validTarget(target)) return send(res, 422, { ok: false, error: 'bad target' })
        let buf
        try { buf = await readRaw(req) } catch { return send(res, 413, { ok: false, error: 'too large (max 2 MB)' }) }
        const r = kit.avatars.save(target, buf)
        if (r.ok) kit.avatarEdited()
        return send(res, r.ok ? 200 : 422, r)
      }
      if (req.method === 'POST' && path === '/avatar-reset') {
        const body = await readBody(req)
        return send(res, 200, { ok: kit.avatars.reset(String(body.target || '')) })
      }
      if (req.method === 'GET' && path === '/asset') {
        const role = url.searchParams.get('role') || ''
        const wantAvatar = url.searchParams.get('kind') === 'avatar'
        const file = wantAvatar ? (isSafeId(role) ? kit.roleAvatarFile(role) : null) : kit.cards.imageFile(role, kit.cards.get(role), 'image')
        return file ? sendFile(res, file, { revalidate: wantAvatar, req }) : send(res, 404, { ok: false, error: 'not found' })
      }
      if (req.method === 'GET' && path.startsWith('/sticker/')) {
        const parts = path.slice('/sticker/'.length).split('/').map(decodeURIComponent)
        const pack = parts.shift()
        const file = isSafeId(pack) ? kit.library.fileOf(pack, parts.join('/')) : null
        return file ? sendFile(res, file) : send(res, 404, { ok: false, error: 'not found' })
      }
      // ---- meme library ----
      // /memes-api answers the ops panel and the picker, /memes/<pack>/<rel> serves a picture, /memes-export
      // zips one pack, /memes-panel is the ops page. All of it lives under this plugin's own prefix; the paths
      // the old plugin used are deliberately not mounted here.
      if (path === '/memes-api') return kit.memes.api(req, res)
      if (path === '/memes-export') return kit.memes.exportZip(req, res)
      if (path === '/memes-panel') return kit.memes.panel(() => {
        try { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'memes-panel.html'), 'utf8') } catch { return '<!doctype html><meta charset="utf-8"><p>panel.html is missing' }
      })(req, res)
      if (path.startsWith('/memes/')) return kit.memes.image(PREFIX + '/memes')(req, res, url.pathname)
      return send(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      return send(res, error?.status === 422 ? 422 : 500, { ok: false, error: String(error?.message || error) })
    }
  }
  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped.webServer ?? (typeof scoped.get === 'function' ? scoped.get('webServer') : undefined)
    if (!webServer || typeof webServer.register !== 'function') return
    scoped.effect(() => webServer.register({ kind: 'prefix', path: PREFIX, handler: handle }), 'persona-kit.route')
    // No /dsh-memes* aliases. The client and the ops page both call /persona-kit/memes*, and the old dsh-meme
    // plugin is uninstalled, so nothing reads those paths. Leaving them unmounted also keeps any single route
    // from ending up with two handlers on one prefix — tests/host.smoke holds that line.
  })

  ctx.effect(() => () => {
    for (const sid of [...applied.keys()]) release(sid)
    kit.store.flush()
  })
  log('ready')
}
