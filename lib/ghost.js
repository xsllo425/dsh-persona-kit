// dsh-persona-kit ghost text: a one-line suggestion for what the user might say next, shown grey in the input box.
//
//   normal   : predict the user's next message from the recent conversation
//   affinity : suggest the line that would bring the user and this role closer (fits the relationship track)
//
// One short model call per finished reply, only when a mode is on. Only the last few messages are sent, with
// obvious keys and tokens masked first. The call follows the session's own model unless config.json pins one.

import { pick } from './lang.js'

export const MODES = ['off', 'normal', 'affinity']

const blocksText = (content) => (Array.isArray(content) ? content : [])
  .filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim()

/** Plain text of one event's message, wherever the host keeps its content blocks. */
export function eventText(ev) {
  return blocksText(ev?.data?.content) || blocksText(ev?.data?.message?.content)
}

const isRealUser = (ev) => {
  if (ev?.type !== 'user/message') return false
  const k = ev.data?.source?.kind
  return k === undefined || k === 'user'
}

/** The user's own messages, newest last. */
export function sentMessages(events) {
  return [...events].filter(Boolean).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).filter(isRealUser).map(eventText).filter(Boolean)
}

/** The last few messages of the conversation as [{ who, text }], oldest first. */
export function recentTurns(events, maxMessages = 6, maxChars = 600) {
  const list = [...events].filter(Boolean).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const out = []
  for (const ev of list) {
    const who = isRealUser(ev) ? 'user' : (ev.type === 'assistant/message' ? 'assistant' : '')
    if (!who) continue
    const text = eventText(ev)
    if (text) out.push({ who, text: text.length > maxChars ? text.slice(0, maxChars) + '…' : text })
  }
  return out.slice(-maxMessages)
}

/** Mask the usual secrets before anything leaves for a model. */
export function redact(text) {
  return String(text)
    .replace(/\b(?:sk|pk|rk|ghp|gho|xox[bp])-?[A-Za-z0-9_-]{16,}\b/g, pick('[已隐藏]', '[hidden]'))
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, pick('Bearer [已隐藏]', 'Bearer [hidden]'))
    .replace(/\b(api[_-]?key|token|secret|password|passwd)\b\s*[:=]\s*\S+/gi, pick('$1=[已隐藏]', '$1=[hidden]'))
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, pick('[已隐藏]', '[hidden]'))
}

export function buildPayload(turns) {
  const lines = turns.map((t) => `${t.who === 'user' ? pick('用户', 'User') : pick('助手', 'Assistant')}${pick('：', ': ')}${redact(t.text)}`)
  return `${pick('最近的对话（从旧到新）：', 'Recent conversation (oldest first):')}\n${lines.join('\n\n')}`
}

/**
 * The affinity-mode line is written FOR the user, to her, and it is literary rather than literal: a line with an
 * afterglow, built from image, tone and what is left unsaid, not from the errands or details of the chat.
 *   you    : who the user is to her (keeps the voice from sliding into the wrong generation)
 *   say    : the voice
 *   image  : what kind of imagery such a line reaches for
 *   avoid  : what would spoil it
 *   sample : two lines to learn the temperature from (never copied)
 * None of them may contain a title or a label of the relationship; the bond is carried by the air of the sentence.
 */
const STYLE = {
  friend: {
    zh: { you: '用户是她的朋友', say: '像多年的好朋友：平等、松弛，带一点点调侃的温柔。', image: '同行的路、并排的影子、共享的天光、一起熬过的夜。', avoid: '不要肉麻，不要说教。',
      sample: ['走了这么远，回头看，影子还是并排的。', '你一笑，今天的风好像也轻了一点。'] },
    en: { you: 'The user is her friend', say: 'Like an old friend: equal, relaxed, with a hint of teasing tenderness.', image: 'a shared road, shadows side by side, the same sky, nights got through together.', avoid: 'Do not gush and do not lecture.',
      sample: ['Looking back down the long road, our shadows are still side by side.', 'When you laugh, even today\'s wind seems lighter.'] },
  },
  partner: {
    zh: { you: '用户是她的搭档', say: '像并肩的同伴：笃定、信任，彼此心照不宣。', image: '同一盏灯、同一张图纸、一起点亮的路、收束的线头。', avoid: '不要空泛地夸，不要写成工作汇报。',
      sample: ['这一程的灯是你点着的，我只是沿着光走。', '再乱的线，有你在，总会找到那个结。'] },
    en: { you: 'The user is her work partner', say: 'Like a comrade at your side: steady, trusting, with an understanding that needs no words.', image: 'one shared lamp, one drawing, a path lit together, a loose thread drawn tight.', avoid: 'Do not praise vaguely and do not sound like a status report.',
      sample: ['You lit the lamp for this stretch; I only followed the light.', 'No matter how tangled the thread, with you it always finds its knot.'] },
  },
  daughter: {
    zh: { you: '用户是她的长辈（爸爸或妈妈），她是用户的女儿', say: '像长辈对晚辈：温厚、护着、替她留一盏灯，话少而稳。纯粹的亲情，不含任何恋爱或性方面的暗示。', image: '留着的灯、渐亮的天、走远了也回得来的路、不必说破的牵挂。', avoid: '不要居高临下，不要训话，不要叮嘱具体的事。',
      sample: ['慢慢来，天总会亮，我就在你一回头就看得见的地方。', '你走多远都好，灯我给你留着。'] },
    en: { you: 'The user is her elder (her father or mother) and she is the user\'s daughter', say: 'Like an elder to someone younger: warm and protective, keeping a lamp lit for her, few words but steady. Purely a family bond, with no romantic or sexual undertones at all.', image: 'a lamp left on, a sky growing light, a road you can always find your way back on, a worry that needs no words.', avoid: 'Do not be condescending, do not lecture, do not instruct about specific tasks.',
      sample: ['Take your time; the sky always brightens, and I am where you can see me when you turn around.', 'Go as far as you like; I will keep the light on.'] },
  },
  younger: {
    zh: { you: '用户是她的哥哥或姐姐，她是用户的妹妹', say: '像年长一点的人护着小一点的：宠溺里带点嫌弃，有力而不张扬。纯粹的亲情，不含任何恋爱或性方面的暗示。', image: '挡风的肩、够不到的星、踮起的脚尖、替她收着的风。', avoid: '不要说教，不要太肉麻。',
      sample: ['风再大也有人替你挡着，你只管往前看。', '你踮脚够的那颗星，其实一直在等你。'] },
    en: { you: 'The user is her older brother or sister and she is the user\'s younger sister', say: 'Like someone a little older looking after someone a little younger: fond with a hint of teasing, strong without showing off. Purely a family bond, with no romantic or sexual undertones at all.', image: 'a shoulder that blocks the wind, a star just out of reach, tiptoes, wind kept off for her.', avoid: 'Do not lecture and do not gush.',
      sample: ['However strong the wind, someone is holding it off; you just look ahead.', 'That star you reach for on tiptoe has been waiting for you all along.'] },
  },
  elder: {
    zh: { you: '用户是她的弟弟或妹妹，她是用户的姐姐', say: '像跟在身后的人：依赖、仰望，带一点藏不住的撒娇。纯粹的亲情，不含任何恋爱或性方面的暗示。', image: '前面的背影、被牵着的手、让人安心的脚步声、走在后面的路。', avoid: '不要太卑微，不要肉麻。',
      sample: ['走在你身后的时候，路总显得格外安稳。', '你一开口，连沉默都像有了方向。'] },
    en: { you: 'The user is her younger brother or sister and she is the user\'s elder sister', say: 'Like someone following behind: dependent, looking up, with a hint of acting spoiled that cannot be hidden. Purely a family bond, with no romantic or sexual undertones at all.', image: 'a back ahead of you, a hand that leads, footsteps that reassure, the road behind.', avoid: 'Do not be servile and do not gush.',
      sample: ['Walking behind you, the road always feels steadier.', 'When you speak, even the silence seems to have a direction.'] },
  },
  mother: {
    zh: { you: '用户是她的孩子，她是用户的妈妈（用户不是长辈，不要用长辈的口气）', say: '像孩子对最亲的人：安心、惦念，带一点想把自己交给对方的柔软。纯粹的亲情，不含任何恋爱或性方面的暗示。', image: '亮着的窗、晚归时的灯、小时候的月亮、回头就在的地方。', avoid: '不要敷衍，不要抬杠，不要写具体的家常琐事。',
      sample: ['不管走到哪一站，心里总有一盏灯亮着。', '今晚的月亮很大，像很久以前哄我入睡的那一盏。'] },
    en: { you: 'The user is her child and she is the user\'s mother (the user is not the elder: do not use an elder\'s tone)', say: 'Like a child to the person closest to them: at ease, thinking of her, soft enough to want to hand oneself over. Purely a family bond, with no romantic or sexual undertones at all.', image: 'a lit window, a lamp for coming home late, the moon of childhood, a place you can turn back to.', avoid: 'Do not be perfunctory, do not argue, do not write about specific household trivia.',
      sample: ['Wherever the journey stops, a lamp is always lit in my heart.', 'Tonight\'s moon is large, like the one that once sang me to sleep.'] },
  },
  lover: {
    zh: { you: '用户是她的恋人', say: '像相爱的人之间：温柔、含蓄、留白，一点点撒娇或小小的在意。表达要含蓄，不涉及性内容，不假设任何人的性别或性取向。', image: '夜色、月光、没有说破的心事、慢下来的呼吸、替彼此记着的小事。', avoid: '不要油腻，不要套路化的情话，不要直白的肉麻。',
      sample: ['夜很长，可一想起你，什么都变得柔软。', '有些心事不必说破，月亮替我记着。'] },
    en: { you: 'The user is her lover', say: 'Like people in love: gentle, subtle, leaving space, with a touch of coyness or the smallest jealousy. Keep it subtle, never sexual, and assume no one\'s gender or orientation.', image: 'night, moonlight, an unspoken feeling, slower breathing, small things remembered for each other.', avoid: 'Do not be cloying, do not use stock love lines, do not be blunt or gushing.',
      sample: ['The night is long, yet thinking of you softens everything.', 'Some feelings need not be said aloud; the moon remembers them for me.'] },
  },
}
/** Each entry reads its fields in the current language every time it is asked. */
export const TRACK_STYLE = Object.fromEntries(Object.keys(STYLE).map((id) => [id, {
  get you() { return pick(STYLE[id].zh.you, STYLE[id].en.you) },
  get say() { return pick(STYLE[id].zh.say, STYLE[id].en.say) },
  get image() { return pick(STYLE[id].zh.image, STYLE[id].en.image) },
  get avoid() { return pick(STYLE[id].zh.avoid, STYLE[id].en.avoid) },
  get sample() { return pick(STYLE[id].zh.sample, STYLE[id].en.sample) },
}]))

/** How freely the user talks at each stage of closeness (0 = just met, 4 = the closest). */
export const stageStyle = () => pick([
  '才刚相识：克制、含蓄，只往前靠一小步，留足余地。',
  '渐渐熟悉：自然、放松，可以带一点点轻松的意味。',
  '已经亲近：更柔软、更随意，话里有只有彼此才懂的意思。',
  '很有默契：话很短，点到为止，余味比字数多。',
  '最为亲近：毫无防备，坦然而温热，像在对自己人说话。',
], [
  'Just met: reserved and subtle, only one small step closer, leaving room.',
  'Getting familiar: natural and relaxed, with a hint of lightness.',
  'Already close: softer and freer, with meanings only the two of you understand.',
  'Deeply in sync: very short, said lightly, more afterglow than words.',
  'Closest: unguarded, frank and warm, like talking to your own people.',
])

/** Words that name the relationship (either language); the line must carry it by mood, never by label. */
export const LABEL_WORDS = /[爸妈爹娘姐哥弟妹]|女儿|儿子|孩子|宝贝|亲爱的|老公|老婆|爱人|恋人|朋友|搭档|闺蜜|兄弟|姐妹|\b(?:dad|daddy|mom|mommy|mum|mummy|father|mother|sis|sister|bro|brother|daughter|son|kid|child|baby|babe|darling|honey|sweetheart|husband|wife|lover|boyfriend|girlfriend|friend|partner|buddy|pal)\b/i

/** @param info { name, track, trackName, title, stage, group } for the affinity mode */
export function buildSystem(mode, info = {}) {
  if (mode === 'affinity') {
    const style = TRACK_STYLE[info.track] || TRACK_STYLE[{ family: 'daughter' }[info.group] || info.group] || TRACK_STYLE.friend
    const stages = stageStyle()
    const stage = stages[Math.min(stages.length - 1, Math.max(0, Number(info.stage) || 0))]
    const she = pick('她', 'her')
    const s = style.sample
    return pick([
      `你在替用户写一句话，说给 AI 角色「${info.name || she}」听。你们的关系是：${info.trackName || '朋友'}。`,
      `身份：${style.you}。这句话是用户对她说的。`,
      '目标：这句话要能增进你们之间的感情。',
      '写法：文学性的、演绎性的，不是现实里的对话。像一句有余味的台词或一行诗：借意象、语气和留白去传达，不要讲具体的事务，不要复述刚才对话里的细节（账号、报错、步骤、金额之类），也不必顺着现实的逻辑。',
      `语气：${style.say}`,
      `可以用的意象：${style.image}`,
      `熟悉程度：${stage}`,
      `避免：${style.avoid}`,
      '硬性规则：话里绝对不要出现任何称谓或关系的字眼（例如爸、妈、姐、哥、弟、妹、女儿、儿子、孩子、宝贝、亲爱的、朋友、搭档、恋人之类），也不要提到对方的名字；关系只通过气息和意境体现。',
      `风格示意（只学它的温度，不要照抄，也不要沿用它的意象）：「${s[0]}」「${s[1]}」`,
      '只输出这一句话本身，用用户的口吻，不超过 30 个字，不加引号、编号或解释。',
    ], [
      `You are writing one sentence for the user to say to the AI character "${info.name || she}". Your relationship: ${info.trackName || 'Friend'}.`,
      `Identity: ${style.you}. The sentence is what the user says to her.`,
      'Goal: the sentence should bring the two of you closer.',
      'Style: literary and evocative, not real-world conversation. Like a line of dialogue with an afterglow, or a line of verse: convey it through imagery, tone and what is left unsaid. Do not talk about errands, do not restate details of the chat (accounts, errors, steps, amounts), and it need not follow real-world logic.',
      `Voice: ${style.say}`,
      `Imagery you may use: ${style.image}`,
      `Closeness: ${stage}`,
      `Avoid: ${style.avoid}`,
      'Hard rule: the sentence must not contain any title or relationship word (for example dad, mom, sis, bro, daughter, son, kid, baby, darling, friend, partner, lover) and must not mention her name; the bond is carried by mood and atmosphere alone.',
      `Style sample (learn its temperature only; do not copy it or reuse its imagery): "${s[0]}" "${s[1]}"`,
      'Write in the language the user has been using in this conversation. Output only the sentence itself, in the user\'s voice, at most 25 words, with no quotes, numbering or explanation.',
    ]).filter(Boolean).join('\n')
  }
  return pick([
    '你在预测用户在这段对话里接下来最可能发出的一句话。',
    '根据最近的对话，用用户的口吻写出这一句：具体、自然，像用户自己会打出来的话，不超过 40 个字，不加引号、编号或解释。',
    // "output nothing when unsure" made the grey line vanish exactly when the conversation had no obvious
    // next step — which is most of the time. Always give the user something to press Tab on instead.
    '即使看不出明确的下一步，也要写一句用户此刻最可能随口说出来的话（追问细节、表示收到、继续推进都算），不要空着。',
  ], [
    'You are predicting the single message the user is most likely to send next in this conversation.',
    'Based on the recent conversation, write it in the user\'s voice, in the language they have been using: specific and natural, the way the user would really type it, at most 25 words, with no quotes, numbering or explanation.',
    'Even when there is no obvious next step, still write the line the user would most plausibly type next (asking for a detail, acknowledging, moving on all count). Never answer with nothing.',
  ]).join('\n')
}

/**
 * Should the grey suggestion be drawn right now?
 *
 * Every field is something the renderer can know at paint time. `text` empty means the model has said
 * nothing useful yet. The three that matter for the overlap bug are `draft`, `typed` and `composing`:
 * the host's draft is a projection that only updates on editor change, so during an IME composition it
 * still reads empty while characters are already on screen — `typed` and `composing` are read straight
 * off the DOM and are what keep a fixed, semi-transparent suggestion from being painted over them.
 * @param {{mode?: string, dismissed?: boolean, running?: boolean, locked?: boolean, removed?: boolean,
 *          text?: string, draft?: string, typed?: boolean, composing?: boolean}} state
 * @returns {boolean}
 */
export function ghostVisible(state) {
  const s = state || {}
  if (s.mode !== 'normal' && s.mode !== 'affinity') return false
  if (!s.text) return false
  if (s.dismissed || s.running || s.locked || s.removed) return false
  if (s.typed || s.composing) return false
  return !s.draft
}

/** One clean line, or '' when the model had nothing useful to say. */
export function cleanSuggestion(raw, max = 60) {
  let t = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').split('\n').map((x) => x.trim()).find(Boolean) || ''
  t = t.replace(/^[\s"'“”‘’「」『』>*\-\d.、：:]+/, '').replace(/[\s"'“”‘’「」『』]+$/, '').trim()
  if (!t || /^(无|没有|无建议|none|nothing|no suggestion|n\/a|null)$/i.test(t)) return ''
  return t.length > max ? t.slice(0, max) : t
}

/** Stream one short completion and return its text (stops reading early once it has a line). */
export async function streamLine(llm, route, { sessionId, system, payload, signal, maxTokens = 80 }, noEffort = false) {
  let text = ''
  for await (const chunk of llm.stream({
    provider: route.provider, model: route.model, sessionId, maxTokens,
    ...(noEffort ? {} : { reasoningEffort: 'off' }),
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: payload }] }],
    signal,
  })) {
    signal.throwIfAborted()
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'finish') {
      const r = chunk.reason
      if (r && (r.kind === 'error' || r.kind === 'aborted')) {
        const e = new Error(r.failure?.message || `model call failed (${r.kind})`)
        if (r.failure?.code) e.code = r.failure.code
        throw e
      }
      break
    }
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      text += chunk.text
      if (text.includes('\n') && text.trim().length > 4) break
    }
  }
  return text
}

/** Ask for the line, retrying once without `reasoningEffort` for routes that refuse it. */
export async function suggestLine(llm, route, args) {
  try { return await streamLine(llm, route, args) } catch (error) {
    if (args.signal.aborted) throw error
    return streamLine(llm, route, args, true)
  }
}
