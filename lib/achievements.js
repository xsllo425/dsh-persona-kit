// dsh-persona-kit achievements: milestones for chatting and getting things done together.
//
// Definitions are plain data (defaults/achievements.json, plus optional `achievements` in a role card). A
// definition names a metric and a threshold, and may also count a phrase in the role's replies. The plugin counts
// real events itself; the model can never announce an unlock.
//
// Two fields are catalog structure rather than counting, and both are enforced here:
//  - `series` groups the badges for the panel; an unknown value falls back to the scope's own series, never an error.
//  - `hidden` keeps a badge's condition secret: the server withholds desc/gte/value until it is earned, so opening
//    the network panel shows nothing the panel itself would not show.

import { getLang, pick } from './lang.js'

export const GLOBAL_METRICS = [
  'turnsTotal', 'rolesMet', 'sessionsTotal', 'streak', 'nightTurns', 'rebirthsTotal', 'stickersTotal',
  'tasksTotal', 'toolCalls', 'levelsUsed', 'tracksTried', 'avatarEdits', 'ghostAccepts',
]
export const ROLE_METRICS = ['turns', 'stickers', 'sessions', 'rebirths', 'tasks', 'days', 'affinity', 'titleIndexMax', 'trackKinds', 'phrase']

/** Panel groups, in the order the panel draws them. `misc` catches anything a future definition mislabels. */
const SERIES_TEXT = {
  chat: { zh: '聊天', en: 'Chat' },
  day: { zh: '日子', en: 'Days' },
  meet: { zh: '相遇', en: 'Meetings' },
  bond: { zh: '相处', en: 'Bond' },
  work: { zh: '一起做事', en: 'Working together' },
  role: { zh: '角色专属', en: 'Role' },
  secret: { zh: '隐藏', en: 'Secrets' },
  misc: { zh: '其他', en: 'Other' },
}
export const SERIES_ORDER = ['chat', 'day', 'meet', 'bond', 'work', 'role', 'secret', 'misc']

/** One series' name in the current language. */
export function seriesName(id) {
  const s = SERIES_TEXT[id] || SERIES_TEXT.misc
  return pick(s.zh, s.en)
}

const ID = /^[\w.-]{1,40}$/

/** One definition, cleaned, or null when it is unusable. `scope` is fixed by where it was found. */
export function normalizeDef(raw, scope) {
  if (!raw || typeof raw !== 'object') return null
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const id = text(raw.id, 40)
  // a definition may carry `en: { name, desc }`; the plugin shows it when it runs in English
  const loc = getLang() === 'en' && raw.en && typeof raw.en === 'object' ? raw.en : null
  const name = text(loc && loc.name ? loc.name : raw.name, 32)
  const metric = text(raw.metric, 24)
  const gte = Math.floor(Number(raw.gte))
  const allowed = scope === 'global' ? GLOBAL_METRICS : ROLE_METRICS
  if (!ID.test(id) || !name || !allowed.includes(metric) || !Number.isFinite(gte) || gte < 1 || gte > 1_000_000) return null
  const def = { id, scope, name, desc: text(loc && loc.desc ? loc.desc : raw.desc, 120), metric, gte }
  // a card's own achievements live in the role series unless they say otherwise; globals fall back to misc
  const series = text(raw.series, 16)
  def.series = SERIES_ORDER.includes(series) ? series : scope === 'role' ? 'role' : 'misc'
  def.hidden = raw.hidden === true
  if (metric === 'phrase') {
    const pattern = text(raw.pattern, 80)
    try { new RegExp(pattern, 'i') } catch { return null }
    if (!pattern) return null
    def.pattern = pattern
  }
  if (typeof raw.reward === 'string' && raw.reward.trim()) def.reward = raw.reward.trim().slice(0, 60)
  return def
}

/** Defaults, then a card's own role achievements; duplicate ids keep the first. */
export function collectDefs(defaults, cardDefs = []) {
  const out = []
  const seen = new Set()
  const push = (raw, scope) => { const d = normalizeDef(raw, scope); if (d && !seen.has(`${scope}:${d.id}`)) { seen.add(`${scope}:${d.id}`); out.push(d) } }
  for (const r of defaults?.global ?? []) push(r, 'global')
  for (const r of defaults?.role ?? []) push(r, 'role')
  for (const r of cardDefs) push(r, 'role')
  return out
}

/** The longest run of consecutive local days in a list of 'YYYY-MM-DD'. */
export function longestStreak(days) {
  const set = [...new Set(days)].sort()
  let best = 0
  let run = 0
  let prev = null
  for (const d of set) {
    const t = Date.parse(`${d}T12:00:00Z`)
    run = prev !== null && Math.round((t - prev) / 86_400_000) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  return best
}

/** The run that is still alive: today counts, and yesterday still counts until today is missed. */
export function currentStreak(days, today) {
  const set = new Set((Array.isArray(days) ? days : []).map(String))
  let day = String(today || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0
  if (!set.has(day)) day = shiftDay(day, -1)
  let n = 0
  while (day && set.has(day)) { n += 1; day = shiftDay(day, -1) }
  return n
}

function shiftDay(day, delta) {
  const t = Date.parse(`${day}T12:00:00Z`)
  return Number.isFinite(t) ? new Date(t + delta * 86_400_000).toISOString().slice(0, 10) : ''
}

/** Number counted for a definition, given the metrics the plugin collected. */
export function valueOf(def, metrics) {
  return Number(metrics?.[def.metric]) || 0
}

/** Definitions grouped for the panel; empty groups are left out and order follows SERIES_ORDER. */
export function groupDefs(defs) {
  const list = Array.isArray(defs) ? defs : []
  return SERIES_ORDER
    .map((id) => ({ id, name: seriesName(id), defs: list.filter((d) => d.series === id) }))
    .filter((g) => g.defs.length > 0)
}

/** Per-series earned/total, for the group headers. `isUnlocked` takes one definition. */
export function groupStats(defs, isUnlocked) {
  const got = typeof isUnlocked === 'function' ? isUnlocked : () => false
  return groupDefs(defs).map((g) => ({ id: g.id, name: g.name, got: g.defs.filter((d) => got(d)).length, total: g.defs.length }))
}

export const keyOf = (def, roleId) => (def.scope === 'role' ? `${def.id}@${roleId}` : def.id)
