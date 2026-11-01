// dsh-persona-kit bond: how close the user is to a role, counted separately for every relationship track.
//
//  - A role keeps one set of counters per track (friend, partner, family, lover). Switching the track does not
//    move or erase anything: each relationship has its own history and picks up where it was left.
//  - Affinity is those counters times the track's weights, so different kinds of bond grow in different ways
//    (a partnership rewards getting things done, a family rewards showing up day after day, ...).
//  - Heat is how full this session's context is (tokens / trigger). When it is full, a rebirth is due.
import { TRACKS, DEFAULT_TRACK, isTrack } from './tracks.js'
import { pick } from './lang.js'

export const defaultTitles = () => TRACKS[DEFAULT_TRACK].titles
/** Affinity needed for each title (same length as the titles). Rising steps = growth slows down. */
export const TITLE_AT = [0, 40, 160, 500, 1200]
/** Context size at which the first rebirth notice is offered. */
export const DEFAULT_TRIGGER_TOKENS = 400_000
/** Context size at which a second, firmer notice is offered if the first was ignored. */
export const DEFAULT_SECOND_TRIGGER_TOKENS = 500_000

const NUMERIC = ['turns', 'stickers', 'tasks', 'days', 'rebirths', 'sessions', 'firstAt', 'lastAt']

export function emptyBond() {
  return { turns: 0, stickers: 0, tasks: 0, days: 0, rebirths: 0, sessions: 0, firstAt: 0, lastAt: 0, lastDay: '' }
}

export function normalizeBond(raw) {
  const b = emptyBond()
  if (raw && typeof raw === 'object') {
    for (const k of NUMERIC) if (Number.isFinite(raw[k]) && raw[k] >= 0) b[k] = Math.floor(raw[k])
    if (typeof raw.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDay)) b.lastDay = raw.lastDay
  }
  return b
}

const weightsOf = (trackId) => TRACKS[isTrack(trackId) ? trackId : DEFAULT_TRACK].weights

/** Affinity of one track's counters. */
export function affinityOf(b, trackId = DEFAULT_TRACK) {
  const w = weightsOf(trackId)
  return Math.floor(b.turns * w.turns + b.stickers * w.stickers + b.tasks * w.tasks + b.days * w.days + b.rebirths * w.rebirths)
}

export function titleIndexOf(affinity) {
  let idx = 0
  TITLE_AT.forEach((at, i) => { if (affinity >= at) idx = i })
  return idx
}

/** "亲近" or "亲近·二转". `titles` is the five titles of the track in force. */
export function titleOf(b, titles, trackId = DEFAULT_TRACK) {
  const list = Array.isArray(titles) && titles.length === TITLE_AT.length ? titles : defaultTitles()
  const base = list[titleIndexOf(affinityOf(b, trackId))]
  return b.rebirths > 0 ? pick(`${base}·${numeral(b.rebirths)}转`, `${base} · Rebirth ${b.rebirths}`) : base
}

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
export function numeral(n) { return n >= 0 && n <= 10 ? DIGITS[n] : String(n) }

/** Progress to the next title, 0..1 (1 when already at the top). */
export function nextProgress(b, trackId = DEFAULT_TRACK) {
  const a = affinityOf(b, trackId)
  const i = titleIndexOf(a)
  if (i >= TITLE_AT.length - 1) return { next: null, fraction: 1, need: 0 }
  const from = TITLE_AT[i]
  const to = TITLE_AT[i + 1]
  return { next: i + 1, fraction: (a - from) / (to - from), need: to - a }
}

export const heatOf = (tokens, trigger = DEFAULT_TRIGGER_TOKENS) =>
  Math.max(0, Math.min(100, Math.round((Number(tokens) || 0) / Math.max(1, trigger) * 100)))

export const rebirthDue = (tokens, trigger = DEFAULT_TRIGGER_TOKENS) => (Number(tokens) || 0) >= trigger
