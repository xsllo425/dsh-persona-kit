// dsh-persona-kit core: pure logic, no host services. Everything here is unit-tested.
//
// Three small pieces:
//   1. intensity levels (1-5) and the prompt text each level adds for the active role
//   2. role cards (card.json next to a role's ROLE.md) merged over built-in defaults
//   3. sticker choice: which reply gets a sticker (by level) and which sticker (by tone)

import { pick } from './lang.js'

export const MIN_LEVEL = 1
export const MAX_LEVEL = 5
export const DEFAULT_LEVEL = 3

/** How often a level gives a sticker: every `gap` eligible replies; gap 0 = never. `tool` = model may call send_sticker. */
export const STICKER_PLAN = {
  1: { gap: 0, tool: false },
  2: { gap: 8, tool: true },
  3: { gap: 4, tool: true },
  4: { gap: 2, tool: true },
  5: { gap: 1, tool: true },
}

/** Role-neutral wording, in the current language. A role card replaces any of these per level. */
const LEVELS_ZH = [
  { name: '正经', line: '用平实、克制的语气回答，像一位可靠的同事。不玩梗、不卖萌、不演角色，也不主动提角色设定；只保留称呼和基本礼貌。不发表情包。' },
  { name: '稳重', line: '以正经为主，偶尔带一句符合角色的口头禅或一个轻微的语气词。不刻意演戏，重点永远是把事情说清楚。表情包很少用。' },
  { name: '日常', line: '按角色设定自然地说话，口吻、称呼和小习惯都保留，偶尔玩一个梗。说正事时认真，闲聊时放松。表情包偶尔用。' },
  { name: '活泼', line: '多一些角色味：更爱接梗、吐槽、撒娇或逗趣，反应更丰富，回复可以带一点情绪起伏。仍然要把事情说对、说完整。可以常用表情包。' },
  { name: '满格', line: '角色扮演拉满：口吻、小动作、口头禅、梗都用足，情绪外露，像在和熟人闹着玩。涉及正事时事实和步骤依旧要准确，不能因为玩梗而含糊。系统会给每条回复自动配表情包，你不用自己发。' },
]
const LEVELS_EN = [
  { name: 'Plain', line: 'Answer in a plain, even tone, like a dependable colleague. No jokes, no cuteness, no acting, and do not bring up who you are; keep only the usual way of addressing the user and basic courtesy. Never send stickers.' },
  { name: 'Reserved', line: 'Mostly plain, with now and then a catchphrase or a light interjection that fits the role. No deliberate acting; the point is always to be clear. Stickers are rare.' },
  { name: 'Everyday', line: 'Speak as the role naturally would: keep the voice, the way of addressing the user and the small habits, and play with a running joke now and then. Serious about serious things, relaxed in small talk. A sticker now and then.' },
  { name: 'Lively', line: 'More of the role: quicker to play along, tease, act spoiled or joke, with a richer range of reactions and some emotional ups and downs. Still get things right and complete. Stickers are welcome.' },
  { name: 'Full', line: 'Role-play at full volume: voice, gestures, catchphrases and jokes all used freely, feelings on show, like messing around with someone you know well. When the topic is serious, facts and steps stay exact; never get vague for the sake of a joke. The system adds a sticker to every reply, so do not send one yourself.' },
]
export const defaultLevels = () => pick(LEVELS_ZH, LEVELS_EN)

export function clampLevel(n) {
  const k = Math.round(Number(n))
  if (!Number.isFinite(k)) return DEFAULT_LEVEL
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, k))
}

/** Merge a role card over the defaults. Missing or malformed fields fall back; nothing throws. */
export function normalizeCard(raw, roleId = '') {
  const o = raw && typeof raw === 'object' ? raw : {}
  const text = (v, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : d)
  const ids = (v) => (Array.isArray(v) ? [...new Set(v.map(String).filter((p) => /^[\w.-]{1,60}$/.test(p)))].slice(0, 12) : [])
  const levels = defaultLevels().map((d, i) => {
    const r = Array.isArray(o.levels) && o.levels[i] && typeof o.levels[i] === 'object' ? o.levels[i] : {}
    return { name: text(r.name, d.name).slice(0, 16), line: text(r.line, d.line).slice(0, 600) }
  })
  return {
    id: roleId,
    name: text(o.name, roleId),
    accent: /^#[0-9a-fA-F]{6}$/.test(o.accent || '') ? o.accent : '#d9a514',
    image: text(o.image),
    avatar: text(o.avatar),
    order: Number.isFinite(o.order) ? o.order : 100,
    achievements: Array.isArray(o.achievements) ? o.achievements.slice(0, 12) : [],
    titles: Array.isArray(o.titles) && o.titles.length === 5 ? o.titles.map((x) => text(x).slice(0, 18)) : null,
    packs: ids(o.packs),
    levels,
  }
}

/** The text added to the system prompt for one role at one level. */
export function sectionText(card, level, bondText = '') {
  const k = clampLevel(level)
  const l = card.levels[k - 1]
  return [
    pick(`【说话强度：${l.name}（${k}/${MAX_LEVEL}）】`, `[Speaking intensity: ${l.name} (${k}/${MAX_LEVEL})]`),
    l.line,
    ...(bondText ? [bondText] : []),
    pick('这是用户此刻设定的档位，覆盖此前出现过的任何档位说明。它只影响说话的风味：不改变你的身份、能力和安全边界；用户交代的任务要求、格式和限制永远优先于风味。',
      'This is the level the user has set right now; it overrides any level notice that appeared earlier. It only changes the flavour of how you speak: it does not change who you are, what you can do or your safety limits, and the user\'s task, format and constraints always come before flavour.'),
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------------------
// stickers

const EMOTIONS = [
  ['angry', /生气|气死|可恶|讨厌|过分|混蛋|不可以|不行|哼|angry|annoyed|furious|hate|unfair|hmph/gi],
  ['sad', /抱歉|对不起|失败|出错|遗憾|可惜|难过|委屈|没能|没成功|报错|不好意思|sorry|apolog|failed|error|unfortunately|sadly|oops/gi],
  ['happy', /完成|成功|搞定|太好|好耶|开心|哈哈|恭喜|不错|很棒|✅|✓|!|！|done|success|great|awesome|congrat|nice|haha|yay/gi],
  ['shy', /谢谢|感谢|害羞|喜欢|可爱|夸|thanks|thank you|shy|cute|aww|love/gi],
  ['confused', /不确定|不清楚|奇怪|不知道|不太懂|看不懂|为什么|怎么回事|not sure|unclear|weird|don't know|confus|what happened/gi],
  ['warm', /在的|在呀|在呢|来啦|宝宝|想你|抱抱|摸摸|贴贴|喜欢你|陪你|黏着|嘿嘿|💙|I'm here|miss you|hug|cuddle|hey you|here with you/gi, 2],
]
const BUCKET_TAGS = { warm: ['happy', 'shy'] }

export function emotionOf(text) {
  let best = 'daily'
  let top = 0
  for (const [name, re, weight] of EMOTIONS) {
    const m = String(text).match(re)
    const n = m ? m.length * (weight || 1) : 0
    if (n > top) { top = n; best = name }
  }
  return best
}
const inBucket = (m, bucket) => (BUCKET_TAGS[bucket] ? BUCKET_TAGS[bucket].includes(m.tag) : m.tag === bucket)

/**
 * Pick one sticker for a reply text.
 * @param stickers [{ id, tag, keywords }]
 * @param recent ids shown lately (avoided unless nothing else is left)
 * @param rnd () => [0,1)
 */
export function pickSticker(stickers, text, recent = [], rnd = Math.random) {
  if (!Array.isArray(stickers) || stickers.length === 0) return null
  const bucket = emotionOf(text)
  let pool = stickers.filter((m) => !recent.includes(m.id))
  if (pool.length === 0) pool = stickers
  const scored = pool.map((m) => {
    const kws = String(m.keywords || '').split(/[\s,、，]+/).filter((k) => k.length >= 2)
    let s = 0
    for (const k of kws) if (text.includes(k)) s += 1
    return { m, s: s + (inBucket(m, bucket) ? 0.5 : 0) }
  })
  const top = Math.max(0, ...scored.map((x) => x.s))
  let set = top >= 1 ? scored.filter((x) => x.s === top) : null
  if (!set) {
    set = scored.filter((x) => inBucket(x.m, bucket))
    if (set.length === 0) set = scored.filter((x) => x.m.tag === 'daily')
    if (set.length === 0) set = scored
  }
  return set[Math.floor(rnd() * set.length) % set.length].m
}

/**
 * Should this reply get a sticker? Mutates `st` ({ sinceLast }) the way the server persists it.
 * @returns {{ show: boolean, why: string }}
 */
export function decideSticker({ level, text, plain, maxChars = 700 }, st) {
  const plan = STICKER_PLAN[clampLevel(level)]
  if (!plan.gap) return { show: false, why: 'level-off' }
  const t = String(text || '').trim()
  if (!t) return { show: false, why: 'empty' }
  if (plain) return { show: false, why: 'code-or-table' }
  if (t.length > maxChars) return { show: false, why: 'long' }
  st.sinceLast = (st.sinceLast || 0) + 1
  if (st.sinceLast < plan.gap) return { show: false, why: `gap ${st.sinceLast}/${plan.gap}` }
  st.sinceLast = 0
  return { show: true, why: 'due' }
}
