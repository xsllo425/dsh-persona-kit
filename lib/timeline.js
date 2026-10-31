// dsh-persona-kit timeline: which role was speaking at each user turn of a session, rebuilt from the session's own
// events. dsh-persona-switcher writes a user-role notice (source.form === 'role-change', with from/to) whenever the
// role changes, so replaying the events gives the role at every turn, including turns written before this plugin
// existed.
//
// The notice is written when the next model step starts, i.e. AFTER the user message that follows the switch and
// BEFORE the reply to it. That reply is already spoken by the new role, so a notice that arrives before the reply
// of the latest user turn also re-labels that turn.

const noticeOf = (ev) => {
  const src = ev?.data?.source
  return src && src.form === 'role-change' ? src : null
}
const isRealUserTurn = (ev) => {
  if (ev?.type !== 'user/message') return false
  const src = ev.data?.source
  if (src?.kind !== undefined && src.kind !== 'user') return false
  return (Array.isArray(ev.data?.content) ? ev.data.content : []).some((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '')
}

/**
 * @param events session events (any order; sorted by seq here)
 * @returns {(string|null)[]} role for user turn 1, 2, 3, ...; null = the log does not know
 */
export function roleTimeline(events) {
  const list = [...events].filter(Boolean).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const firstNotice = list.map(noticeOf).find(Boolean)
  // before the first notice the role was that notice's "from"
  // no notice at all means the log cannot say who spoke: unknown (null), never "the current role" - a switch made
  // since would otherwise repaint every earlier reply
  let role = firstNotice ? (firstNotice.from || '') : null
  const turns = []
  let unanswered = false // the latest user turn has no model reply yet
  for (const ev of list) {
    const n = noticeOf(ev)
    if (n) {
      role = n.to || ''
      if (unanswered && turns.length) turns[turns.length - 1] = role
      continue
    }
    if (isRealUserTurn(ev)) { turns.push(role); unanswered = true; continue }
    if (ev.type === 'assistant/message') unanswered = false
  }
  return turns
}

/**
 * What the log implies, overridden by what this plugin saw itself (exact for the turns it was running for; those
 * line up with the LAST turns of the session).
 */
export function mergeTurns(fromLog, mine) {
  const offset = fromLog.length - mine.length
  return fromLog.map((r, i) => (offset >= 0 && i >= offset ? mine[i - offset] : r))
}
