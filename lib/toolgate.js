// dsh-persona-kit tool gate: per-session tool groups. Heavy optional tool groups (browser, computer control, image and
// video generation, ...) start hidden in a gated DSH mode and come back for ONE session when asked for (the model calls
// enable_tools, the user's message contains a trigger phrase, or a skill of the group is invoked), then go away again
// after a few idle user turns. Persona does not decide the tools (a switch changes who she is, not what she can use)
// unless config.followPersona is on.
//
// (This is the former dsh-tool-gate plugin, folded in. Mechanism: one ctx.tools.restrict({ deny }) per root agent,
// replaced whenever the decision changes; for a hidden group with a prompt section, a same-named agent-scoped section
// replaces that plugin's global section with a one-line hint.)
import { readFileSync, statSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { trusted } from './http.js'
import { pick } from './lang.js'
import {
  normalizeConfig, roleKeyOf, hiddenGroups, denyList, triggeredGroups, groupsForSkill, userTextOf, enableToolsDescription,
  groupsForTool, expiredGroups,
} from './gate.js'

const SELF_TOOL = 'enable_tools'
const STALE_MS = 90 * 24 * 60 * 60 * 1000

/** Read a JSON file, re-parsing only when its mtime changes. */
function cachedJson(pathOf, fallback) {
  let mtime = -1
  let value = fallback
  return () => {
    const path = typeof pathOf === 'function' ? pathOf() : pathOf
    try {
      const m = statSync(path).mtimeMs
      if (m !== mtime) {
        value = JSON.parse(readFileSync(path, 'utf8'))
        mtime = m
      }
    } catch {
      mtime = -1
      value = fallback
    }
    return value
  }
}

/**
 * @param ctx host context
 * @param opts { kit, configFile (user's groups, optional), defaultsFile, storeFile, legacyStoreFile }
 */
export function installToolGate(ctx, { kit, configFile, defaultsFile, storeFile, legacyStoreFile }) {
  const STORE_FILE = () => storeFile
  const CONFIG_FILE = () => (existsSync(configFile) ? configFile : defaultsFile)
  const log = (msg) => ctx.logger?.info?.(`[persona-kit/gate] ${msg}`)
  const warn = (msg) => ctx.logger?.warn?.(`[persona-kit/gate] ${msg}`)

  const rawConfig = cachedJson(CONFIG_FILE, {})
  let cfgSource
  let cfg = normalizeConfig({})
  const config = () => {
    const raw = rawConfig()
    if (raw !== cfgSource) { cfgSource = raw; cfg = normalizeConfig(raw) }
    return cfg
  }

  // ---- unlock store: { version, sessions: { [sid]: { groups: [], at } } } ----
  let store = { version: 1, sessions: {} }
  try {
    const raw = JSON.parse(readFileSync(existsSync(STORE_FILE()) ? STORE_FILE() : legacyStoreFile, 'utf8'))
    if (raw && typeof raw.sessions === 'object') store = { version: 1, sessions: raw.sessions }
  } catch {}
  // Older records have no usage clock: start every open group's clock now instead of expiring it at once.
  for (const e of Object.values(store.sessions)) {
    if (!e || typeof e !== 'object') continue
    e.groups = Array.isArray(e.groups) ? e.groups : []
    e.turn = Number.isFinite(e.turn) ? e.turn : 0
    e.used = e.used && typeof e.used === 'object' ? e.used : {}
    for (const g of e.groups) if (!Number.isFinite(e.used[g])) e.used[g] = e.turn
  }
  const saveStore = () => {
    try {
      const now = Date.now()
      for (const [sid, e] of Object.entries(store.sessions)) if (!e || now - (e.at ?? 0) > STALE_MS) delete store.sessions[sid]
      mkdirSync(dirname(STORE_FILE()), { recursive: true })
      const tmp = STORE_FILE() + '.tmp'
      writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8')
      renameSync(tmp, STORE_FILE())
    } catch (error) {
      warn(`could not save unlock records: ${String(error)}`)
    }
  }
  const unlockedOf = (sid) => store.sessions[sid]?.groups ?? []
  /**
   * Unlock groups for a session and mark them as just used (this also restarts the idle clock of groups
   * that were already open). @returns {string[]} groups newly unlocked
   */
  const unlock = (sid, groups) => {
    const known = config().groups
    const wanted = groups.filter((g) => g in known)
    if (wanted.length === 0) return []
    const e = (store.sessions[sid] ??= { groups: [], used: {}, turn: 0, at: Date.now() })
    e.used = e.used ?? {}
    e.turn = Number(e.turn ?? 0)
    const before = new Set(e.groups ?? [])
    const added = wanted.filter((g) => !before.has(g))
    let changed = added.length > 0
    for (const g of wanted) if (e.used[g] !== e.turn) { e.used[g] = e.turn; changed = true }
    if (!changed) return []
    e.groups = [...before, ...added]
    e.at = Date.now()
    saveStore()
    if (added.length > 0) log(`${sid}: unlocked ${added.join(', ')}`)
    return added
  }
  /** A user turn began: advance the counter of a session that has something unlocked. */
  const bumpTurn = (sid) => {
    const e = store.sessions[sid]
    if (!e) return 0
    e.turn = Number(e.turn ?? 0) + 1
    return e.turn
  }
  /** A tool of these groups was just called: they count as used this turn. */
  const touch = (sid, ids) => {
    const e = store.sessions[sid]
    if (!e || ids.length === 0) return
    e.used = e.used ?? {}
    let changed = false
    for (const g of ids) if ((e.groups ?? []).includes(g) && e.used[g] !== e.turn) { e.used[g] = e.turn; changed = true }
    if (changed) { e.at = Date.now(); saveStore() }
  }
  /**
   * Hide again what stayed unused for more than `idleTurns` user turns. Only called at the start of a user
   * turn, never between the steps of a running task, so a task in progress never loses its tools.
   * @returns {string[]} groups dropped
   */
  const expire = (sid) => {
    const e = store.sessions[sid]
    if (!e) return []
    const gone = expiredGroups(config(), e, Number(e.turn ?? 0))
    if (gone.length === 0) return []
    e.groups = e.groups.filter((g) => !gone.includes(g))
    for (const g of gone) delete e.used?.[g]
    if (e.groups.length === 0) delete store.sessions[sid]
    else e.at = Date.now()
    saveStore()
    log(`${sid}: idle for too long, hidden again ${gone.join(', ')}`)
    return gone
  }
  /**
   * Drop every group unlocked in this session, so it falls back to the persona's default set.
   * @returns {string[]} groups that were unlocked before the reset
   */
  const lockAll = (sid) => {
    const had = unlockedOf(sid)
    if (had.length === 0) return []
    delete store.sessions[sid]
    saveStore()
    log(`${sid}: reset ${had.join(', ')}`)
    return had
  }

  // ---- per-session facts ----
  const presetBySid = new Map()
  const presetOf = (agent) => {
    const sid = agent?.session?.id
    const switched = presetBySid.get(sid)
    if (typeof switched === 'string' && switched) return switched
    const header = agent?.session?.header?.agentPreset
    return typeof header === 'string' && header ? header : undefined
  }
  const roleOf = (sid) => kit.roleOf(sid) || undefined
  const knownNames = () => {
    try { return new Set(ctx.tools.schemas().map((t) => t.name)) } catch { return new Set() }
  }

  // ---- application: one restrict + section overrides per root agent ----
  const agentBySid = new Map()
  const applied = new Map() // sid -> { agent, key, dispose, sections: Map<groupId, dispose> }
  const isRoot = (agent) => !(typeof agent?.depth === 'number' && agent.depth > 0)
  const serviceOf = (agent, key) => {
    const c = agent?.ctx
    if (!c) return undefined
    try { return typeof c.get === 'function' ? c.get(key) : c[key] } catch { return undefined }
  }
  const release = (st) => {
    try { st.dispose?.() } catch {}
    for (const d of st.sections.values()) { try { d() } catch {} }
    st.dispose = undefined
    st.sections.clear()
    st.key = undefined
  }

  // restrict() notifies tools/change synchronously, which re-enters evaluate(); queue instead of recursing.
  const pending = new Set()
  let draining = false
  const evaluate = (agent) => {
    const sid = agent?.session?.id
    if (typeof sid !== 'string' || !isRoot(agent)) return
    agentBySid.set(sid, agent)
    pending.add(agent)
    if (draining) return
    draining = true
    try {
      while (pending.size > 0) {
        const next = pending.values().next().value
        pending.delete(next)
        evaluateOne(next)
      }
    } finally {
      draining = false
    }
  }
  const evaluateOne = (agent) => {
    const sid = agent.session.id
    try {
      const c = config()
      let st = applied.get(sid)
      if (st !== undefined && st.agent !== agent) { release(st); st = undefined }
      if (st === undefined) { st = { agent, key: undefined, dispose: undefined, sections: new Map() }; applied.set(sid, st) }

      const hidden = hiddenGroups(c, { preset: presetOf(agent), role: roleOf(sid), unlocked: unlockedOf(sid) })
      const deny = denyList(c, hidden, knownNames(), SELF_TOOL)
      const key = deny.join(',')
      if (key !== st.key) {
        try { st.dispose?.() } catch {}
        st.dispose = undefined
        if (deny.length > 0) {
          const tools = serviceOf(agent, 'tools')
          if (tools && typeof tools.restrict === 'function') st.dispose = tools.restrict({ deny })
        }
        st.key = key
      }

      const prompt = serviceOf(agent, 'systemPrompt')
      for (const [id, g] of Object.entries(c.groups)) {
        if (!g.section) continue
        const want = hidden.includes(id)
        const have = st.sections.get(id)
        if (want && have === undefined && prompt && typeof prompt.section === 'function') {
          st.sections.set(id, prompt.section({ name: g.section.name, order: g.section.order, text: g.section.text }))
        } else if (!want && have !== undefined) {
          try { have() } catch {}
          st.sections.delete(id)
        }
      }
    } catch (error) {
      // A creation listener must never throw (it would roll the agent's creation back).
      warn(`evaluate ${sid} failed: ${String(error)}`)
    }
  }
  const evaluateAll = () => { for (const agent of agentBySid.values()) evaluate(agent) }

  // ---- triggers ----
  ctx.on('agent/created', ({ agent }) => evaluate(agent), { global: true })
  ctx.inject(['agents'], (scoped) => {
    for (const agent of scoped.agents.list()) evaluate(agent)
  })

  ctx.on('agent/inbox/inserted', ({ message, agent }) => {
    const sid = agent?.session?.id
    if (typeof sid !== 'string' || !isRoot(agent)) return
    // A persona switch since the last look resets first, so a trigger in this very message still counts.
    try { syncPersona(false) } catch (error) { warn(`persona sync failed: ${String(error)}`) }
    const c = config()
    const text = userTextOf(message)
    if (text) bumpTurn(sid)                                  // a real user turn begins
    const groups = triggeredGroups(c, text)
    if (message?.source?.kind === 'skill-invocation') groups.push(...groupsForSkill(c, message.source.name))
    if (groups.length > 0) unlock(sid, groups)               // a trigger phrase also restarts the idle clock
    if (text) expire(sid)                                    // then hide what has been idle for too long
    evaluate(agent)
  }, { global: true })

  ctx.on('session/event', (session, event) => {
    const sid = session?.id
    if (typeof sid !== 'string' || !event) return
    if (event.type === 'agent-preset/selected') {
      // The host only accepts a preset before the session's first turn, so this is the initial choice,
      // never a mid-session switch; there is nothing unlocked yet to reset.
      presetBySid.set(sid, event.data?.agentPreset ?? undefined)
      const agent = agentBySid.get(sid)
      if (agent) evaluate(agent)
    } else if (event.type === 'tool/call') {
      const toolName = event.data?.name
      if (toolName === 'skill') {
        let skill
        try {
          const args = typeof event.data.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data.arguments
          skill = args?.name
        } catch {}
        const groups = groupsForSkill(config(), skill)
        if (groups.length > 0 && unlock(sid, groups).length > 0) {
          const agent = agentBySid.get(sid)
          if (agent) evaluate(agent)
        }
      } else {
        touch(sid, groupsForTool(config(), toolName))        // using a tool keeps its group open
      }
    }
  })

  // A tool registered later (e.g. browser-skill revealing bsk_* globally) must be masked again.
  ctx.on('tools/change', () => evaluateAll())

  // ---- role pick = "back to this role's default tool set" (only when config.followPersona is on) ----
  const roleStamps = new Map()
  const syncPersona = (initial) => {
    const changed = []
    for (const sid of agentBySid.keys()) {
      const now = kit.roleOf(sid)
      const prev = roleStamps.get(sid)
      roleStamps.set(sid, now)
      if (!initial && prev !== undefined && prev !== now) changed.push(sid)
    }
    if (!config().followPersona) return
    for (const sid of changed) {
      if (lockAll(sid).length === 0) continue
      const agent = agentBySid.get(sid)
      if (agent) evaluate(agent)
    }
  }
  syncPersona(true)

  // ---- HTTP: read the unlocks, or drop them (any UI can call this) ----
  ctx.inject(['webServer'], (httpCtx) => {
    const server = httpCtx.webServer
    if (!server || typeof server.register !== 'function') return
    const ROUTE = '/persona-kit-gate'
    httpCtx.effect(() => server.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://local')
        const send = (status, body) => {
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(body))
        }
        if (!trusted(req)) return send(403, { ok: false, error: 'loopback only' })
        try {
          if (req.method === 'GET' && url.pathname === `${ROUTE}/state`) {
            return send(200, {
              ok: true,
              sessions: Object.entries(store.sessions).map(([sid, e]) => ({ sid, groups: e?.groups ?? [], turn: e?.turn ?? 0, used: e?.used ?? {} })),
            })
          }
          if (req.method === 'POST' && url.pathname === `${ROUTE}/reset`) {
            let body = {}
            try {
              const chunks = []
              for await (const chunk of req) chunks.push(chunk)
              const raw = Buffer.concat(chunks).toString('utf8').trim()
              if (raw) body = JSON.parse(raw)
            } catch {}
            const only = typeof body?.sid === 'string' && body.sid ? body.sid : undefined
            const targets = only ? [only] : Object.keys(store.sessions)
            const dropped = {}
            for (const sid of targets) {
              const had = lockAll(sid)
              if (had.length > 0) dropped[sid] = had
              const agent = agentBySid.get(sid)
              if (agent) evaluate(agent)
            }
            return send(200, { ok: true, dropped })
          }
          return send(404, { ok: false, error: 'not found' })
        } catch (error) {
          return send(500, { ok: false, error: String(error) })
        }
      },
    }))
  })

  // ---- the one model-facing tool ----
  if (Object.keys(config().groups).length === 0) return // nothing to gate: stay out of the way
  ctx.effect(() => ctx.tools.register({
    name: SELF_TOOL,
    description: enableToolsDescription(config()),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        groups: { type: 'array', items: { type: 'string' }, description: pick('要启用的组 id，例如 ["computer"]。', 'Ids of the groups to enable, e.g. ["computer"].') },
      },
      required: ['groups'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ok: { type: 'boolean' }, enabled: { type: 'string' }, note: { type: 'string' } },
        required: ['ok', 'enabled', 'note'],
      },
      render(_args, value) {
        return [{ type: 'text', text: value.ok ? pick(`已启用：${value.enabled}。${value.note}`, `Enabled: ${value.enabled}. ${value.note}`) : value.note }]
      },
    },
    async execute(args, exec) {
      const agent = exec?.agent
      const sid = agent?.session?.id
      const c = config()
      const asked = Array.isArray(args?.groups) ? args.groups.filter((g) => typeof g === 'string') : []
      const valid = asked.filter((g) => g in c.groups)
      if (typeof sid !== 'string' || valid.length === 0) {
        return { ok: false, enabled: '', note: pick(`没有可启用的组。可用：${Object.keys(c.groups).join(', ')}`, `No such group. Available: ${Object.keys(c.groups).join(', ')}`) }
      }
      unlock(sid, valid)
      evaluate(agent)
      return { ok: true, enabled: valid.map((g) => c.groups[g].title).join(pick('、', ', ')), note: pick('这些工具从下一步开始可用。', 'These tools are available from your next step.') }
    },
  }))

  // Unloading the plugin lifts every restriction and section override it made.
  ctx.effect(() => () => {
    for (const st of applied.values()) release(st)
    applied.clear()
  })
}
