// dsh-persona-kit achievements: milestones for chatting and getting things done together.
//
// Definitions are plain data (defaults/achievements.json, plus optional `achievements` in a role card). A
// definition names a metric and a threshold, and may also count a phrase in the role's replies. The plugin counts
// real events itself; the model can never announce an unlock.

import { getLang } from './lang.js'

export const GLOBAL_METRICS = [
  'turnsTotal', 'rolesMet', 'sessionsTotal', 'streak', 'nightTurns', 'rebirthsTotal', 'stickersTotal',
  'tasksTotal', 'toolCalls', 'levelsUsed', 'tracksTried', 'avatarEdits', 'ghostAccepts',
]
export const ROLE_METRICS = ['turns', 'stickers', 'sessions', 'rebirths', 'tasks', 'days', 'affinity', 'titleIndexMax', 'trackKinds', 'phrase']

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

/** Number counted for a definition, given the metrics the plugin collected. */
export function valueOf(def, metrics) {
  return Number(metrics?.[def.metric]) || 0
}

export const keyOf = (def, roleId) => (def.scope === 'role' ? `${def.id}@${roleId}` : def.id)
