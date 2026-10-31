import { pick } from './lang.js'
// Pure decision logic for dsh-tool-gate: no host objects, no I/O, so it can be tested offline.

/**
 * Normalize groups.json into a predictable shape; unknown or malformed parts are dropped.
 *
 * Two layers decide which groups start hidden:
 *  - `presets` (by DSH agent preset id) and `noPreset` (sessions without one) — always available, and
 *    a preset that is not listed is never gated;
 *  - `personas` (by persona-switcher role) — only for a session that persona-switcher has a record for.
 * The older `gatedPresets` + `gateWithoutPreset` + `policies` shape is still read: every gated preset
 * then uses `policies.default`, and `policies` become the persona table.
 * @param {unknown} raw - parsed groups.json.
 * @returns {{presets: Record<string, string[]>, noPreset: string[] | null, personas: Record<string, string[]>, groups: Record<string, object>}}
 */
export function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x !== '') : [])
  // idleTurns: how many user turns an unlocked group may go unused before it is hidden again (0 = never).
  const idleOf = (v, fallback) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback)
  const groups = {}
  for (const [id, g] of Object.entries(src.groups && typeof src.groups === 'object' ? src.groups : {})) {
    if (!g || typeof g !== 'object') continue
    const section = g.section && typeof g.section === 'object' && typeof g.section.name === 'string' && typeof g.section.text === 'string'
      ? { name: g.section.name, order: Number.isFinite(g.section.order) ? g.section.order : 500, text: g.section.text }
      : undefined
    groups[id] = {
      title: typeof g.title === 'string' ? g.title : id,
      tools: strings(g.tools),
      skills: strings(g.skills),
      triggers: strings(g.triggers),
      ...(Number.isFinite(g.idleTurns) && g.idleTurns >= 0 ? { idleTurns: Math.floor(g.idleTurns) } : {}),
      ...(section ? { section } : {}),
    }
  }
  const known = (list) => strings(list).filter((id) => id in groups)
  const table = (v) => {
    const out = {}
    for (const [key, list] of Object.entries(v && typeof v === 'object' && !Array.isArray(v) ? v : {})) out[key] = known(list)
    return out
  }
  if (src.presets !== undefined || src.personas !== undefined || src.noPreset !== undefined) {
    return {
      presets: table(src.presets),
      noPreset: Array.isArray(src.noPreset) ? known(src.noPreset) : null,
      personas: table(src.personas),
      // Persona decides who the model is, not which tools it has: tools follow the DSH mode only,
      // unless `followPersona: true` asks for the old per-persona tables.
      followPersona: src.followPersona === true,
      idleTurns: idleOf(src.idleTurns, 2),
      groups,
    }
  }
  // Legacy shape: personas decide, and nothing is hidden again after use (as before).
  const personas = table(src.policies)
  const base = personas.default ?? []
  return {
    presets: Object.fromEntries(strings(src.gatedPresets).map((p) => [p, base])),
    noPreset: src.gateWithoutPreset !== false ? base : null,
    personas,
    followPersona: true,
    idleTurns: 0,
    groups,
  }
}

/**
 * Which persona a session runs as, from persona-switcher's sessions.json entry.
 * @param {unknown} entry - `{ role }` record for the session, or undefined.
 * @returns {string | undefined} role id; 'none' for an explicit `/role none`; 'default' for a record
 *   without a usable role; undefined when persona-switcher has no record (not installed, or never chosen).
 */
export function roleKeyOf(entry) {
  if (!entry || typeof entry !== 'object' || !('role' in entry)) return undefined
  if (entry.role === null) return 'none'
  return typeof entry.role === 'string' && entry.role.trim() !== '' ? entry.role.trim() : 'default'
}

/**
 * Groups to keep hidden for one session.
 * The DSH preset decides whether the session is gated at all and gives the base set; a persona record,
 * when there is one, replaces the base set with that persona's policy.
 * @param {object} cfg - normalized config.
 * @param {{preset?: string, role?: string, unlocked: Iterable<string>}} s - session facts.
 * @returns {string[]} hidden group ids, in config order.
 */
export function hiddenGroups(cfg, s) {
  const base = s.preset === undefined ? cfg.noPreset : cfg.presets[s.preset]
  if (!Array.isArray(base)) return []
  const policy = !cfg.followPersona || s.role === undefined ? base : (cfg.personas[s.role] ?? cfg.personas.default ?? base)
  const unlocked = new Set(s.unlocked)
  return Object.keys(cfg.groups).filter((id) => policy.includes(id) && !unlocked.has(id))
}

/**
 * Expand tool patterns (`name` or `prefix*`) against the tool names the host currently knows.
 * @param {string[]} patterns
 * @param {Iterable<string>} known
 * @returns {string[]} sorted, de-duplicated names that exist.
 */
export function expandTools(patterns, known) {
  const names = [...known]
  const out = new Set()
  for (const p of patterns) {
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1)
      for (const n of names) if (n.startsWith(prefix)) out.add(n)
    } else if (names.includes(p)) out.add(p)
  }
  return [...out].sort()
}

/**
 * Names to deny for a set of hidden groups. `enable_tools` itself is denied when nothing is hidden,
 * so sessions with everything open do not pay for it.
 */
export function denyList(cfg, hidden, known, selfName) {
  const patterns = hidden.flatMap((id) => cfg.groups[id]?.tools ?? [])
  const deny = expandTools(patterns, known)
  if (hidden.length === 0 && [...known].includes(selfName)) deny.push(selfName)
  return deny.sort()
}

/**
 * Groups whose trigger phrase appears in a user's text (case-insensitive substring).
 * @param {object} cfg
 * @param {string} text
 * @returns {string[]}
 */
export function triggeredGroups(cfg, text) {
  if (typeof text !== 'string' || text === '') return []
  const lower = text.toLowerCase()
  return Object.entries(cfg.groups)
    .filter(([, g]) => g.triggers.some((t) => lower.includes(t.toLowerCase())))
    .map(([id]) => id)
}

/** Groups that a skill name unlocks. */
export function groupsForSkill(cfg, skill) {
  if (typeof skill !== 'string' || skill === '') return []
  return Object.entries(cfg.groups).filter(([, g]) => g.skills.includes(skill)).map(([id]) => id)
}

/** User-authored text of one inbox message (ignores plugin/runtime injections). */
export function userTextOf(message) {
  if (!message || typeof message !== 'object') return ''
  const kind = message.source?.kind
  if (message.role !== 'user' || (kind !== undefined && kind !== 'user')) return ''
  const blocks = Array.isArray(message.content) ? message.content : []
  return blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n')
}

/** Idle turns allowed for one group (its own `idleTurns`, else the global one); 0 means never auto-hide. */
export function idleTurnsOf(cfg, id) {
  const own = cfg.groups[id]?.idleTurns
  return Number.isFinite(own) ? own : (cfg.idleTurns ?? 0)
}

/** Which groups a tool name belongs to (patterns are `name` or `prefix*`). */
export function groupsForTool(cfg, name) {
  if (typeof name !== 'string' || name === '') return []
  return Object.entries(cfg.groups)
    .filter(([, g]) => g.tools.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : p === name)))
    .map(([id]) => id)
}

/**
 * Unlocked groups that have gone unused for too many user turns.
 * @param {object} cfg
 * @param {{groups?: string[], used?: Record<string, number>}} entry - one session's unlock record.
 * @param {number} turn - the session's current user-turn counter.
 * @returns {string[]} groups to hide again. A group never used since it was unlocked counts from `turn` of
 *   the moment it was recorded, so a record without `used` starts its clock now instead of expiring at once.
 */
export function expiredGroups(cfg, entry, turn) {
  const used = entry?.used ?? {}
  return (entry?.groups ?? []).filter((id) => {
    const idle = idleTurnsOf(cfg, id)
    return idle > 0 && turn - (Number.isFinite(used[id]) ? used[id] : turn) > idle
  })
}

/** The tool description for enable_tools, listing the groups. */
export function enableToolsDescription(cfg) {
  const list = Object.entries(cfg.groups).map(([id, g]) => `${id} (${g.title})`).join(', ')
  return pick('为当前会话启用额外的工具组，工具从下一步开始可用。只在用户的要求确实需要时调用。' + `可用的组：${list}。`,
    `Enable extra tool groups for this session; the tools appear from your next step. Call it only when the user's request really needs them. Available groups: ${list}.`)
}
