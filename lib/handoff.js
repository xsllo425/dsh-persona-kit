// dsh-persona-kit rebirth: when a session's context is nearly full, nudge the model once to ask the user whether
// to continue in a fresh session; on a yes the model writes a hand-over note and calls `handoff_new_session`,
// which opens the new session in the same workspace, passes the note, and records the rebirth for the role so
// affinity, title and the role itself carry over.
//
// (This is the former dsh-handoff plugin, folded in. Nothing here talks to the network or to a model.)
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { pick } from './lang.js'
import { DEFAULT_TRIGGER_TOKENS, DEFAULT_SECOND_TRIGGER_TOKENS } from './bond.js'

export const TOOL_NAME = 'handoff_new_session'
const MAX_ASKED = 500
const MEASURE_EVERY = 4 // measuring walks the whole session
const MAX_SUMMARY = 12_000
/** How many notices a session may receive: the first at the trigger, a firmer one at the second. */
export const MAX_NOTICES = 2

/**
 * The nudge to the model when the context reaches a threshold (role sessions offer a rebirth).
 * `round` is 1 for the first notice, 2 for the firmer one after the first was ignored.
 */
export const notice = (round = 1) => round >= 2
  ? pick(`（上下文提醒·第二次）这个会话已经用了约 {k} 万 token，比上次提醒时更满了。请在这一回合结束时，用你当前角色自己的口吻、一句话再问用户一次：要不要现在“转生”——开一个新会话接着聊，关系和称号都会带过去。
- 上一次提过、用户没有回应，所以这次再提醒一回；这是最后一次提醒，之后不再提。
- 用户没有明确同意之前，不要交接，不要新建会话，继续当前工作即可。
- 用户同意后：调用工具 ${TOOL_NAME}，summary 里写清楚：①目标 ②已完成并验证的 ③没做完的和下一步 ④关键文件/命令/路径 ⑤用户的约束和偏好 ⑥未决问题。新会话看不到这里的历史，只能读这份 summary。`,
  `(Context reminder, second notice) This session has used about {k} thousand tokens — fuller than at the first reminder. At the end of this turn, ask the user once more, in your current role's own voice and in one sentence, whether they would like to "rebirth" now: continuing in a fresh session, with your relationship and titles carried over.
- The first notice was not answered, so this is a second and final reminder; do not bring it up again after this one.
- Until the user clearly agrees, do not hand over and do not open a new session; just keep working.
- If the user agrees: call the tool ${TOOL_NAME} and write in the summary: (1) the goal (2) what is done and verified (3) what is left and the next step (4) key files, commands and paths (5) the user's constraints and preferences (6) open questions. The new session cannot see this history; it only reads the summary.`)
  : pick(`（上下文提醒）这个会话已经用了约 {k} 万 token，快满了。请在这一回合结束时，用你当前角色自己的口吻、一句话问用户：要不要“转生”——开一个新会话接着聊，我们的关系和称号都会带过去？
- 用户没有明确同意之前，不要交接，不要新建会话，继续当前工作即可。
- 用户拒绝或没回应，就继续；真到了更满的时候还会再提一次。
- 用户同意后：调用工具 ${TOOL_NAME}，summary 里写清楚：①目标 ②已完成并验证的 ③没做完的和下一步 ④关键文件/命令/路径 ⑤用户的约束和偏好 ⑥未决问题。新会话看不到这里的历史，只能读这份 summary。`,
  `(Context reminder) This session has used about {k} thousand tokens and is nearly full. At the end of this turn, ask the user in one sentence, in your current role's own voice, whether they would like a "rebirth": continuing in a fresh session, with your relationship and titles carried over.
- Until the user clearly agrees, do not hand over and do not open a new session; just keep working.
- If the user declines or does not answer, carry on; one more notice comes if the context grows fuller.
- If the user agrees: call the tool ${TOOL_NAME} and write in the summary: (1) the goal (2) what is done and verified (3) what is left and the next step (4) key files, commands and paths (5) the user's constraints and preferences (6) open questions. The new session cannot see this history; it only reads the summary.`)

/** Sessions with no role get the plain wording (no bond to carry). */
export const noticePlain = (round = 1) => round >= 2
  ? pick(`（上下文提醒·第二次）这个会话已经用了约 {k} 万 token，比上次提醒时更满了。请在这一回合结束时，用一句话再问用户一次：要不要现在开一个新会话接着做？
- 上一次提过、用户没有回应，所以这次再提醒一回；这是最后一次提醒，之后不再提。
- 用户没有明确同意之前，不要交接，不要新建会话，继续当前工作即可。
- 用户同意后：调用工具 ${TOOL_NAME}，summary 里写清楚：①目标 ②已完成并验证的 ③没做完的和下一步 ④关键文件/命令/路径 ⑤用户的约束和偏好 ⑥未决问题。新会话看不到这里的历史，只能读这份 summary。`,
  `(Context reminder, second notice) This session has used about {k} thousand tokens — fuller than at the first reminder. At the end of this turn, ask the user once more, in one sentence, whether they would like to continue in a new session now.
- The first notice was not answered, so this is a second and final reminder; do not bring it up again after this one.
- Until the user clearly agrees, do not hand over and do not open a new session; just keep working.
- If the user agrees: call the tool ${TOOL_NAME} and write in the summary: (1) the goal (2) what is done and verified (3) what is left and the next step (4) key files, commands and paths (5) the user's constraints and preferences (6) open questions. The new session cannot see this history; it only reads the summary.`)
  : pick(`（上下文提醒）这个会话已经用了约 {k} 万 token。请在这一回合结束时，用一句话问用户：要不要开一个新会话接着做？
- 用户没有明确同意之前，不要交接，不要新建会话，继续当前工作即可。
- 用户拒绝或没回应，就继续；真到了更满的时候还会再提一次。
- 用户同意后：调用工具 ${TOOL_NAME}，summary 里写清楚：①目标 ②已完成并验证的 ③没做完的和下一步 ④关键文件/命令/路径 ⑤用户的约束和偏好 ⑥未决问题。新会话看不到这里的历史，只能读这份 summary。`,
  `(Context reminder) This session has used about {k} thousand tokens. At the end of this turn, ask the user in one sentence whether they would like to continue in a new session.
- Until the user clearly agrees, do not hand over and do not open a new session; just keep working.
- If the user declines or does not answer, carry on; one more notice comes if the context grows fuller.
- If the user agrees: call the tool ${TOOL_NAME} and write in the summary: (1) the goal (2) what is done and verified (3) what is left and the next step (4) key files, commands and paths (5) the user's constraints and preferences (6) open questions. The new session cannot see this history; it only reads the summary.`)

export const continuePrefix = () => pick('（接续前情）上一个会话上下文太长，用户同意转生到这个新会话继续。下面是上一个会话写的交接说明。先读完，再用一两句话告诉用户你接到了什么、打算从哪一步开始，然后继续工作。\n\n',
  '(Continuing) The previous session grew too long and the user agreed to a rebirth into this new session. Below is the hand-over note written there. Read it first, then tell the user in a sentence or two what you picked up and where you will start, and carry on.\n\n')

/** session id -> how many notices it has already had (0/1/2). Older files were a plain list of ids. */
function readAsked(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(raw)) return new Map(raw.filter((x) => typeof x === 'string').map((x) => [x, 1]))
    if (raw && typeof raw === 'object') {
      const out = new Map()
      for (const [sid, n] of Object.entries(raw)) {
        if (typeof sid === 'string' && Number.isFinite(n) && n > 0) out.set(sid, Math.floor(n))
      }
      return out
    }
    return new Map()
  } catch { return new Map() }
}
function writeAsked(file, asked) {
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    const entries = [...asked].slice(-MAX_ASKED)
    writeFileSync(`${file}.tmp`, JSON.stringify(Object.fromEntries(entries), null, 2), 'utf8')
    renameSync(`${file}.tmp`, file)
  } catch { /* a missed write only means one extra reminder after a restart */ }
}

function pathSpellings(cwd) {
  const trimmed = cwd.length > 1 ? cwd.replace(/[\\/]+$/, '') : cwd
  const out = new Set([cwd, trimmed])
  if (isAbsolute(cwd)) for (const p of [cwd, trimmed]) { try { out.add(realpathSync(p)) } catch { /* ignore */ } }
  return out
}

/**
 * @param ctx host context
 * @param opts { kit, triggerTokens, secondTriggerTokens, dir, onRebirth(sid, childId) }
 */
export function installHandoff(ctx, { kit, triggerTokens, secondTriggerTokens, dir, onRebirth }) {
  const askedFile = join(dir, 'asked.json')
  const asked = readAsked(askedFile) // sid -> notices already sent (0/1/2)
  const stepsBySession = new WeakMap()
  let meterWarned = false
  let meterLogged = false
  const log = (level, msg) => { try { ctx.logger?.[level]?.(`[persona-kit] ${msg}`) } catch { /* ignore */ } }
  const service = (key) => { try { return ctx.get?.(key) } catch { return undefined } }
  const meter = () => { try { return ctx.tokenMeter ?? service('tokenMeter') } catch { return undefined } }
  // the second threshold can never sit below the first one
  const firstAt = Number.isFinite(triggerTokens) && triggerTokens > 0 ? triggerTokens : DEFAULT_TRIGGER_TOKENS
  const secondAt = Number.isFinite(secondTriggerTokens) && secondTriggerTokens > firstAt ? secondTriggerTokens : Math.max(firstAt, DEFAULT_SECOND_TRIGGER_TOKENS)

  // Where the number comes from, in order of preference. The thresholds are about how full the context is
  // *right now*, so the context-pressure projection is the honest source; the tokenUsage totals are
  // cumulative over every step and can reach hundreds of millions for a long session (that is how a 12 %
  // session once reported 189 million tokens). Anything larger than the window is therefore rejected.
  // A missing source must never read as "below threshold" — that is how this went unnoticed for a month.
  const measureTokens = (session) => {
    const cp = projection(session, 'contextPressure')
    const pressure = typeof cp === 'number'
      ? cp
      : (cp?.pressureTokens ?? cp?.val?.pressureTokens ?? cp?.surfaceTokens ?? cp?.val?.surfaceTokens)
    const window = cp?.contextWindow ?? cp?.val?.contextWindow
    const sane = (n) => Number.isFinite(n) && n > 0 && (!Number.isFinite(window) || n <= window * 1.5)
    if (sane(pressure)) return { total: pressure, via: 'contextPressure', window }
    try {
      const m = meter()
      const got = typeof m?.measure === 'function' ? m.measure(session)?.totalTokens : undefined
      if (sane(got)) return { total: got, via: 'tokenMeter', window }
    } catch { /* fall through */ }
    const usage = projection(session, 'tokenUsage')
    const totals = usage?.totals || usage?.val?.totals
    if (totals) {
      const sum = (totals.uncachedInputTokens || 0) + (totals.cacheReadTokens || 0) + (totals.outputTokens || 0)
      if (sane(sum)) return { total: sum, via: 'tokenUsage', window }
    }
    return { total: NaN, via: '', window }
  }

  // ---- at most two quiet user-role notices per session: one at the first threshold, a firmer one at the second ----
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal?.aborted) return decision
    const session = agent?.session
    const sid = session?.id
    if (!session || typeof sid !== 'string') return decision
    const sent = asked.get(sid) ?? 0
    if (sent >= MAX_NOTICES) return decision
    const steps = stepsBySession.get(session) ?? 0
    stepsBySession.set(session, steps + 1)
    if (steps % MEASURE_EVERY !== 0) return decision
    const measured = measureTokens(session)
    if (!Number.isFinite(measured.total)) {
      if (!meterWarned) { meterWarned = true; log('warn', 'cannot measure context tokens (no tokenMeter, no tokenUsage projection); rebirth notices stay off') }
      return decision
    }
    const total = measured.total
    if (!meterLogged) { meterLogged = true; log('info', `context tokens measured via ${measured.via} (${total})`) }
    kit.store.setTokens(sid, total, kit.roleOf(sid))
    // Which notice is due: the first threshold gets the soft one, the second the firm one. A session that
    // blew past the second threshold before any notice went out gets the firm one straight away instead of
    // two reminders back to back.
    const round = total >= secondAt ? 2 : 1
    if (sent >= round) return decision
    if (round === 1 && total < firstAt) return decision
    asked.set(sid, round)
    writeAsked(askedFile, asked)
    log('info', `session ${sid} at ~${total} tokens (notices ${round}/${MAX_NOTICES}, thresholds ${firstAt}/${secondAt}); rebirth notice injected`)
    const message = {
      id: randomUUID(), role: 'user',
      content: [{ type: 'text', text: (kit.roleOf(sid) ? notice(round) : noticePlain(round)).replaceAll('{k}', String(Math.round(total / (pick(10_000, 1_000))))) }],
      source: { kind: 'handoff-notice', form: 'notice', summary: '上下文接近阈值' },
    }
    return { ...decision, messages: [...decision.messages, message] }
  }, { prepend: true })

  // ---- the one model-facing tool ----
  const workspaceRequest = (cwd) => {
    if (typeof cwd !== 'string' || cwd === '') return {}
    try {
      const all = service('workspaceRegistry')?.list?.()
      if (Array.isArray(all)) {
        const spell = pathSpellings(cwd)
        const hit = all.find((w) => typeof w?.id === 'string' && spell.has(w?.path))
        if (hit) return { workspaceId: hit.id }
      }
    } catch { /* fall back to cwd */ }
    return { cwd }
  }
  const projection = (session, key) => { try { return service('sessionProjections')?.stateOf?.(session, key) } catch { return undefined } }

  ctx.effect(() => ctx.tools.register({
    name: TOOL_NAME,
    description: pick('转生：把当前工作交接到一个新会话并在那里继续。只在用户明确同意换新会话之后调用；旧会话保持原样。', 'Rebirth: hand the current work over to a new session and continue there. Call it only after the user has clearly agreed to a new session; the old session stays as it is.'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { summary: { type: 'string', description: pick('交接说明：目标、已完成、没做完与下一步、关键文件命令、用户约束、未决问题。新会话只能看到这段。', 'Hand-over note: the goal, what is done, what is left and the next step, key files and commands, the user\'s constraints, open questions. The new session sees only this.') } },
      required: ['summary'],
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, sessionId: { type: 'string' }, note: { type: 'string' } }, required: ['ok', 'sessionId', 'note'] },
      render(_args, value) { return [{ type: 'text', text: value.ok ? pick(`已开新会话 ${value.sessionId}。${value.note}`, `New session opened: ${value.sessionId}. ${value.note}`) : value.note }] },
    },
    async execute(args, exec) {
      const agent = exec?.agent
      const summary = typeof args?.summary === 'string' ? args.summary.trim() : ''
      if (summary.length < 20) return { ok: false, sessionId: '', note: pick('summary 太短，新会话没法接续。请写清目标、进度和下一步。', 'The summary is too short for a new session to continue from. Write the goal, the progress and the next step.') }
      const controller = service('sessionController')
      if (!controller?.create || !controller?.prompt) return { ok: false, sessionId: '', note: pick('当前环境没有会话控制服务，没有新建会话；请让用户手动开新会话并粘贴交接说明。', 'This environment has no session controller, so no session was created; ask the user to open one by hand and paste the note.') }
      let childId = ''
      try {
        const preset = projection(agent?.session, 'agentPreset')
        const created = await controller.create({
          ...workspaceRequest(agent?.session?.header?.cwd),
          ...(typeof preset === 'string' && preset ? { agentPreset: preset } : {}),
        })
        childId = created.sessionId
        try {
          const sel = projection(agent?.session, 'modelSelection')
          const picked = sel?.pending ?? sel?.lastUsed
          if (picked?.provider && picked?.model && controller.selectModel) {
            await controller.selectModel({ sessionId: childId, provider: picked.provider, model: picked.model, ...(picked.reasoningEffort ? { reasoningEffort: picked.reasoningEffort } : {}) })
          }
        } catch (error) { log('warn', `model not inherited: ${error?.message ?? error}`) }
        try {
          const presets = service('permissionPresets')
          const child = service('sessions')?.get?.(childId)
          const cur = presets?.current?.(agent?.session)
          if (child && typeof cur === 'string' && cur && cur !== 'custom') presets.set(child, cur)
        } catch (error) { log('warn', `permission preset not inherited: ${error?.message ?? error}`) }
        await controller.prompt({
          sessionId: childId,
          requestId: `handoff-${randomUUID()}`,
          mode: 'queue',
          content: [{ type: 'text', text: continuePrefix() + summary.slice(0, MAX_SUMMARY) }],
        }, new AbortController().signal)
        try { mkdirSync(join(dir, 'notes'), { recursive: true }); writeFileSync(join(dir, 'notes', `${childId}.md`), summary, 'utf8') } catch { /* record only */ }
        log('info', `rebirth ${agent?.session?.id ?? '?'} -> ${childId}`)
        try { onRebirth?.(agent?.session?.id, childId) } catch (error) { log('warn', `rebirth bookkeeping failed: ${error?.message ?? error}`) }
        return { ok: true, sessionId: childId, note: pick('交接说明已发给新会话，请告诉用户去新会话继续。本会话保持原样，没有被冻结。', 'The note was sent to the new session; tell the user to continue there. This session is unchanged and not frozen.') }
      } catch (error) {
        log('error', `rebirth failed: ${error?.message ?? error}`)
        try { if (childId) await controller.cancel?.({ sessionId: childId }) } catch { /* ignore */ }
        return { ok: false, sessionId: '', note: pick(`新建会话失败：${error?.message ?? error}。本会话未受影响，可让用户手动开新会话。`, `Could not create the session: ${error?.message ?? error}. This session is unaffected; the user can open a new one by hand.`) }
      }
    },
  }), 'persona-kit.handoff-tool')
}
