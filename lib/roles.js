// dsh-persona-kit roles: the role library, the per-session role, and the /role command.
//
//   <rolesDir>/<id>/ROLE.md        frontmatter (id, name, description) + the persona text
//   <stateFile>                    { version: 1, sessions: { <sid>: { role: "<id>" | null, at } } }  (null = no role)
//
// Only the model's persona changes: the role's text is registered as one agent-scoped system-prompt section beside the
// deployment's own identity line, so a switch never costs a session its tools, skills or model. A switch writes one
// short user-role notice into the conversation (source.form === 'role-change', with from/to), because the replies
// already in the history keep demonstrating the role that was just dismissed.
//
// The state file keeps the format the earlier switcher used, so the two can be swapped without losing anything.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const PERSONA_SECTION = 'persona-kit:persona'
export const PERSONA_ORDER = 137
export const NOTICE_KIND = 'persona-kit'

const NONE_TEXT = 'No role is active in this session. The deployment persona is what applies now: the base identity supplied by the deployment, with no additional role. Do not adopt a role from earlier replies in this conversation.'
const SAFE_ID = /^[\w.-]{1,60}$/

/** frontmatter + body of one ROLE.md */
export function parseRole(text, fallbackId) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const head = m ? m[1] : ''
  const body = (m ? m[2] : src).trim()
  const field = (k) => { const r = head.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')); return r ? r[1].trim().replace(/^["']|["']$/g, '') : '' }
  const id = field('id') || fallbackId
  if (!SAFE_ID.test(id) || !body) return null
  return { id, name: field('name') || id, description: field('description'), body }
}

/** Every role in the library, in id order. A folder per role, plus old flat <id>.md files. */
export function scanLibrary(dir) {
  const out = new Map()
  let entries = []
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  for (const e of entries) {
    try {
      const file = e.isDirectory() ? join(dir, e.name, 'ROLE.md') : (/\.md$/i.test(e.name) ? join(dir, e.name) : '')
      if (!file || !existsSync(file)) continue
      const role = parseRole(readFileSync(file, 'utf8'), e.isDirectory() ? e.name : e.name.replace(/\.md$/i, ''))
      if (role && !out.has(role.id)) out.set(role.id, role)
    } catch { /* one bad file never hides the others */ }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** The text of the notice: names both sides, so the model can settle the conflict in favour of the current role. */
export function formatNotice(from, to) {
  if (from === to) return ''
  const closing = 'Your next reply already belongs to the persona named here, not to the discarded one.'
  if (to === null) {
    return ['<system-reminder>', `Role change: this session switched from role "${from}" back to the deployment persona; no role is bound to it any more.`, '',
      `The persona, the tone and the verbal habits of role "${from}" are superseded and no longer apply.`, 'Do not keep imitating the earlier replies of this conversation: they were written as that role, and they are not a style guide.', closing, '</system-reminder>'].join('\n')
  }
  if (from === null) {
    return ['<system-reminder>', `Role change: this session was running on the deployment persona and has switched to role "${to}".`, '',
      `From now on you speak as role "${to}", with its persona, tone and habits as described in the role text.`, 'Earlier replies in this conversation were written without that role; do not treat them as a style guide.', closing, '</system-reminder>'].join('\n')
  }
  return ['<system-reminder>', `Role change: this session switched from role "${from}" to role "${to}".`, '',
    `The persona, the tone and the verbal habits of role "${from}" are superseded and no longer apply.`, `From now on you speak as role "${to}", as described in the role text.`,
    'Do not keep imitating the earlier replies of this conversation: they were written as the previous role, and they are not a style guide.', closing, '</system-reminder>'].join('\n')
}

/** Session -> role memory, an atomic JSON file. */
export function createRoleState(file, now = () => new Date().toISOString()) {
  let data = { version: 1, sessions: {} }
  let mtime = '' // mtime:size
  const load = () => {
    try {
      const st = statSync(file)
      const m = `${st.mtimeMs}:${st.size}`
      if (m === mtime) return
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      if (raw && typeof raw.sessions === 'object' && raw.sessions) { data = { version: 1, sessions: raw.sessions }; mtime = m }
    } catch (error) {
      // a file that exists but cannot be read must never be overwritten by our next save: keep it aside
      if (existsSync(file) && error instanceof SyntaxError) { try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch {} mtime = '' }
    }
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2) + '\n')
    renameSync(`${file}.tmp`, file)
    try { const st = statSync(file); mtime = `${st.mtimeMs}:${st.size}` } catch { mtime = '' }
  }
  return {
    /** undefined = never chosen, null = chose "no role", string = role id */
    get(sid) { load(); const e = data.sessions[sid]; return e === undefined ? undefined : (typeof e.role === 'string' ? e.role : null) },
    set(sid, role) { load(); data.sessions[sid] = { role, at: now() }; save() },
    remove(sid) { load(); delete data.sessions[sid]; save() },
  }
}

/**
 * @param ctx host context
 * @param opts { rolesDir, stateFile, defaultRole }
 * @returns { library(), roleOf(sid) } for the rest of the kit
 */
export function installRoles(ctx, { rolesDir, stateFile, defaultRole = '' }) {
  const log = (m) => { try { ctx.logger?.info?.(`[persona-kit/roles] ${m}`) } catch {} }
  const warn = (m) => { try { ctx.logger?.warn?.(`[persona-kit/roles] ${m}`) } catch {} }
  const state = createRoleState(stateFile)
  const isRoot = (agent) => !(typeof agent?.depth === 'number' && agent.depth > 0)
  const promptOf = (agent) => { const c = agent?.ctx; try { return typeof c?.get === 'function' ? c.get('systemPrompt') : c?.systemPrompt } catch { return undefined } }

  let cache = { at: 0, roles: [] }
  const library = () => { if (Date.now() - cache.at > 1500) cache = { at: Date.now(), roles: scanLibrary(rolesDir) }; return cache.roles }
  const find = (id) => library().find((r) => r.id === id)

  // ---- one persona section per live session ----
  const bound = new Map() // sid -> { id: string|null, dispose }
  const bind = (agent, id) => {
    const sid = agent?.session?.id
    if (typeof sid !== 'string') throw new Error('this session has no id')
    const prev = bound.get(sid)
    if (prev && prev.id === id) return { changed: false, from: prev.id }
    const role = id === null ? null : find(id)
    if (id !== null && !role) throw new Error(`unknown role "${id}"`)
    const prompt = promptOf(agent)
    if (!prompt || typeof prompt.section !== 'function') throw new Error('this session exposes no scoped prompt registry')
    // drop the old section first: two live sections of one name must never overlap
    if (prev) { try { prev.dispose?.() } catch {} }
    const text = role ? role.body : NONE_TEXT
    let dispose
    try { dispose = prompt.section({ name: PERSONA_SECTION, order: PERSONA_ORDER, text }) } catch (error) {
      if (prev) { try { prev.dispose = prompt.section({ name: PERSONA_SECTION, order: PERSONA_ORDER, text: prev.text }) } catch {} }
      throw error
    }
    bound.set(sid, { id, dispose, text })
    return { changed: true, from: prev ? prev.id : undefined }
  }

  const pending = new Map() // sid -> notice text, written into the log at the next step
  const announce = (sid, from, to) => { const text = formatNotice(from, to); if (text) pending.set(sid, { from: from ?? '', to: to ?? '', text }) }

  /** Reapply what this session remembers, or the default for one that never chose. */
  const restore = (agent) => {
    if (!isRoot(agent)) return
    const sid = agent.session?.id
    if (typeof sid !== 'string') return
    try {
      const remembered = state.get(sid)
      if (bound.has(sid) && bound.get(sid).agent === agent) return
      let target
      if (remembered === null) target = null
      else if (typeof remembered === 'string' && find(remembered)) target = remembered
      else if (typeof remembered === 'string') {
        // the remembered role left the library: fall back, and tell the model it changed
        target = defaultRole && find(defaultRole) ? defaultRole : null
        state.set(sid, target)
        warn(`remembered role "${remembered}" is gone; ${target ? `"${target}" takes over` : 'back to the deployment persona'}`)
        const r = bind(agent, target)
        bound.get(sid).agent = agent
        if (r.changed) announce(sid, remembered, target)
        return
      } else if (defaultRole && find(defaultRole)) { target = defaultRole; state.set(sid, target) } else target = null
      bind(agent, target)
      bound.get(sid).agent = agent
    } catch (error) { warn(`could not restore the role of ${sid}: ${String(error)}`) }
  }
  // agent/created listeners are awaited before the first step, so the role lands in step one
  ctx.on('agent/created', ({ agent }) => restore(agent), { global: true })
  ctx.inject(['agents'], (scoped) => { for (const agent of scoped.agents.list()) restore(agent) })

  // ---- the notice, as an ordinary durable user message ----
  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    if (isRoot(agent)) restore(agent)
    const decision = await next()
    const sid = agent?.session?.id
    const note = typeof sid === 'string' ? pending.get(sid) : undefined
    if (!note) return decision
    pending.delete(sid)
    if (decision.kind === 'reject') return decision
    if (decision.messages.some((m) => m.source?.kind === NOTICE_KIND)) return decision
    const notice = { role: 'user', content: [{ type: 'text', text: note.text }], source: { kind: NOTICE_KIND, form: 'role-change', from: note.from, to: note.to }, id: randomUUID() }
    const lastClaimed = decision.messages.findLastIndex((m) => messages.includes(m))
    return { ...decision, messages: decision.messages.toSpliced(lastClaimed + 1, 0, notice) }
  }, { global: true })

  // ---- /role ----
  const roster = (current) => library().map((r) => `${r.id === current ? '*' : '-'} ${r.id}: ${r.name}${r.description ? ` — ${r.description}` : ''}`).join('\n')
  const handle = async (invocation) => {
    const agent = invocation?.agent
    if (!agent) return { kind: 'error', text: 'The role command requires a session.' }
    const sid = agent.session?.id
    const raw = typeof invocation.rawInput === 'string' ? invocation.rawInput.trim() : ''
    const [verb, ...rest] = raw.split('\n')[0].split(/\s+/).filter(Boolean)
    const current = () => { const b = bound.get(sid); return b ? b.id : null }
    const overview = () => [`current session role: ${current() ?? '(none: deployment persona)'}`, `default for new sessions: ${defaultRole || '(none)'}`, '', `roles (${library().length}):`, roster(current())].join('\n')
    try {
      if (verb === undefined || verb === '') return { kind: 'success', text: overview() }
      if (verb === 'list') return { kind: 'success', text: `roles (${library().length}):\n${roster(current())}` }
      if (verb === 'none' || verb === 'off') {
        const r = bind(agent, null)
        state.set(sid, null)
        if (r.changed && r.from !== undefined) announce(sid, r.from, null)
        bound.get(sid).agent = agent
        return { kind: 'success', text: (r.changed ? `Role "${r.from}" removed; this session runs on the deployment persona again.` : 'This session already runs on the deployment persona.') + `\n\n${overview()}` }
      }
      if (verb === 'default') {
        const id = rest[0]
        if (id === undefined) return { kind: 'error', text: `Usage: /role default <id>\n\n${roster(defaultRole)}` }
        if (!find(id)) return { kind: 'error', text: `Unknown role "${id}".\n\n${roster(current())}` }
        defaultRole = id // for this run; the config file keeps the long-term default
        return { kind: 'success', text: `Default role for new sessions: "${id}" (until restart; set defaultRole in the kit config to keep it).` }
      }
      const target = find(verb)
      if (!target) return { kind: 'error', text: `Unknown role "${verb}".\n\n${roster(current())}` }
      const r = bind(agent, target.id)
      state.set(sid, target.id)
      bound.get(sid).agent = agent
      if (r.changed) announce(sid, r.from === undefined ? null : r.from, target.id)
      return { kind: 'success', text: (r.changed ? `Switched this session from "${r.from ?? '(none)'}" to "${target.id}" (${target.name}).` : `This session already runs as "${target.id}" (${target.name}).`) + `\n\n${overview()}` }
    } catch (error) { return { kind: 'error', text: `Role switch failed: ${error?.message ?? String(error)}` } }
  }
  ctx.effect(function* () {
    yield ctx.commands.register({ name: 'role', description: 'Switch the model persona for this session (only the persona changes), or set the default for new sessions', input: { hint: '[<id>|list|default <id>|none]' }, handler: handle })
  }, 'persona-kit.role-command')

  ctx.effect(() => () => { for (const b of bound.values()) { try { b.dispose?.() } catch {} } bound.clear() })
  log(`ready (${library().length} roles, default ${defaultRole || 'none'})`)
  return { library, handle, restore }
}
