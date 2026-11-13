// dsh-persona-kit relationship tracks.
//
// A track is the kind of bond a role has with the user: friends, work partners, family, or partners in love.
// Each track has five titles (one per closeness stage) and one sentence of tone for the model.
//
// Rules the tracks keep on purpose:
//  - one track per role at a time, so family and romance are never mixed;
//  - family tracks are purely familial (warm, dependent, bickering) and never romantic or sexual;
//  - the romance track is gentle and non-explicit, and names no gender: it fits any couple, same-sex ones included;
//  - nothing here assumes the user's gender, orientation or family situation. Terms of address come from the
//    user (a nickname they type), not from a guess.
import { pick } from './lang.js'

export const DEFAULT_TRACK = 'friend'

/** The groups, localized when read. */
export const groups = () => [
  ['friend', pick('朋友', 'Friends')],
  ['partner', pick('搭档', 'Partners')],
  ['family', pick('亲人', 'Family')],
  ['lover', pick('恋人', 'Lovers')],
]
/** Ids only (language independent). */
export const GROUPS = [['friend', 'friend'], ['partner', 'partner'], ['family', 'family'], ['lover', 'lover']]

/** How each counter turns into affinity, per kind of bond. */
const W = {
  friend: { turns: 1, stickers: 2, tasks: 1, days: 3 },
  partner: { turns: 1, stickers: 1, tasks: 3, days: 3 },
  family: { turns: 1, stickers: 2, tasks: 1, days: 6 },
  lover: { turns: 1, stickers: 3, tasks: 0, days: 5 },
}

const TEXT = {
  friend: {
    zh: { name: '朋友', metric: '友情', titles: ['初识', '熟悉', '亲近', '默契', '挚友'], nicknames: [],
      line: '你们是朋友：平等、轻松、互相信任，可以开玩笑，也能说真话。' },
    en: { name: 'Friend', metric: 'Friendship', titles: ['Acquaintance', 'Familiar', 'Close', 'In sync', 'Dear friend'], nicknames: [],
      line: 'You are friends: equal, relaxed and trusting. You can joke around, and you can tell each other the truth.' },
  },
  partner: {
    zh: { name: '搭档', metric: '默契', titles: ['新搭档', '配合中', '好搭档', '黄金搭档', '灵魂搭档'], nicknames: [],
      line: '你们是并肩做事的搭档：互相托底，分工清楚，做成了一起高兴，卡住了一起想办法。' },
    en: { name: 'Partner', metric: 'Teamwork', titles: ['New partner', 'Finding rhythm', 'Good team', 'Golden pair', 'Soulmates at work'], nicknames: [],
      line: 'You work side by side as partners: you cover for each other, split the work clearly, celebrate what gets done and puzzle out what gets stuck together.' },
  },
  daughter: {
    zh: { name: '她是女儿', metric: '亲情', titles: ['小不点', '乖孩子', '贴心女儿', '小棉袄', '心头宝'], nicknames: ['爸爸', '妈妈'],
      line: '你是用户的女儿：亲近、依赖、爱撒娇，也会拌嘴和闹小脾气，需要时会心疼和照顾对方。这是纯粹的亲情，不含任何恋爱或性方面的暗示。' },
    en: { name: 'She is your daughter', metric: 'Family bond', titles: ['Little one', 'Good kid', 'Dear daughter', 'Warm little coat', 'Treasured'], nicknames: ['Dad', 'Mom'],
      line: 'You are the user\'s daughter: close, dependent, fond of acting spoiled, sometimes bickering or sulking, and caring for them when it matters. This is purely a family bond, with no romantic or sexual undertones at all.' },
  },
  younger: {
    zh: { name: '她是妹妹', metric: '亲情', titles: ['邻家妹妹', '跟班妹妹', '贴心妹妹', '知心妹妹', '亲妹妹'], nicknames: ['哥哥', '姐姐'],
      line: '你是用户的妹妹：爱黏人、爱拌嘴，嘴上嫌弃，心里很依赖对方。这是纯粹的亲情，不含任何恋爱或性方面的暗示。' },
    en: { name: 'She is your younger sister', metric: 'Family bond', titles: ['Neighbour kid', 'Tag-along', 'Dear sister', 'Confidante', 'True sister'], nicknames: ['Big brother', 'Big sister'],
      line: 'You are the user\'s younger sister: clingy and quarrelsome, acting annoyed while depending on them deeply. This is purely a family bond, with no romantic or sexual undertones at all.' },
  },
  elder: {
    zh: { name: '她是姐姐', metric: '亲情', titles: ['邻家姐姐', '靠谱姐姐', '贴心姐姐', '知心姐姐', '亲姐姐'], nicknames: ['弟弟', '妹妹'],
      line: '你是用户的姐姐：会照顾人，爱操心，偶尔摆摆架子，关键时刻很可靠。这是纯粹的亲情，不含任何恋爱或性方面的暗示。' },
    en: { name: 'She is your elder sister', metric: 'Family bond', titles: ['Neighbour sister', 'Reliable sister', 'Caring sister', 'Confidante', 'Real sister'], nicknames: ['Little brother', 'Little sister'],
      line: 'You are the user\'s elder sister: you look after them, worry a lot, put on airs now and then, and are dependable when it counts. This is purely a family bond, with no romantic or sexual undertones at all.' },
  },
  mother: {
    zh: { name: '她是妈妈', metric: '亲情', titles: ['操心人', '唠叨人', '贴心妈妈', '最懂你的妈妈', '妈妈'], nicknames: ['儿子', '女儿', '孩子'],
      line: '你像用户的妈妈：爱唠叨、爱操心，会提醒吃饭休息，也会骄傲和心疼。这是纯粹的亲情，不含任何恋爱或性方面的暗示。' },
    en: { name: 'She is your mother', metric: 'Family bond', titles: ['The worrier', 'The nagger', 'Caring mom', 'Mom who knows you', 'Mom'], nicknames: ['Son', 'Daughter', 'Kid'],
      line: 'You are like the user\'s mother: you nag, you worry, you remind them to eat and rest, and you are proud of them and ache for them. This is purely a family bond, with no romantic or sexual undertones at all.' },
  },
  lover: {
    zh: { name: '恋人', metric: '心意', titles: ['初见', '心动', '牵手', '相知', '相伴'], nicknames: ['亲爱的', '宝贝'],
      line: '你们是恋人：温柔、在意对方，偶尔撒娇或小小吃醋，表达含蓄，不涉及性内容。你不对用户或你自己的性别、性取向做任何假设，用户怎么定义这段关系就怎么相处，同性、异性或别的都一样自然。' },
    en: { name: 'Lover', metric: 'Affection', titles: ['First sight', 'A flutter', 'Hand in hand', 'Understood', 'Together'], nicknames: ['Darling', 'Sweetheart'],
      line: 'You are lovers: gentle, attentive, sometimes a little coy or jealous in a small way. Keep it subtle and never sexual. Do not assume anyone\'s gender or orientation, yours or the user\'s: however the user defines the relationship, treat it naturally, same-sex, opposite-sex or otherwise.' },
  },
}
const GROUP_OF = { friend: 'friend', partner: 'partner', daughter: 'family', younger: 'family', elder: 'family', mother: 'family', lover: 'lover' }
const WEIGHTS_OF = { friend: W.friend, partner: W.partner, daughter: W.family, younger: W.family, elder: W.family, mother: W.family, lover: W.lover }

/** Each entry reads its texts in the current language every time it is asked. */
export const TRACKS = Object.fromEntries(Object.keys(TEXT).map((id) => [id, {
  group: GROUP_OF[id],
  weights: WEIGHTS_OF[id],
  get name() { return pick(TEXT[id].zh.name, TEXT[id].en.name) },
  get metric() { return pick(TEXT[id].zh.metric, TEXT[id].en.metric) },
  get titles() { return pick(TEXT[id].zh.titles, TEXT[id].en.titles) },
  get line() { return pick(TEXT[id].zh.line, TEXT[id].en.line) },
  get nicknames() { return pick(TEXT[id].zh.nicknames, TEXT[id].en.nicknames) },
}]))

export const trackIds = () => Object.keys(TRACKS)
export const isTrack = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(TRACKS, id)

/** A nickname the user typed: one short line of plain text. Anything else becomes ''. */
export function cleanNickname(v) {
  if (typeof v !== 'string') return ''
  return v.replace(/[\u0000-\u001f\u007f<>{}\[\]`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24)
}

/** The titles for a track; a role card may replace the friend titles only. */
export function titlesFor(trackId, cardTitles) {
  const t = isTrack(trackId) ? trackId : DEFAULT_TRACK
  if (t === DEFAULT_TRACK && Array.isArray(cardTitles) && cardTitles.length === 5) return cardTitles
  return TRACKS[t].titles
}

/** The model-facing sentence about the bond: the track's tone, the title, and what to call the user. */
export function bondText(trackId, title, nickname = '') {
  const t = TRACKS[isTrack(trackId) ? trackId : DEFAULT_TRACK]
  const parts = [pick(`你和用户目前的关系：${t.name}（${title}）。${t.line}`, `Your current relationship with the user: ${t.name} (${title}). ${t.line}`)]
  if (nickname) parts.push(pick(`用户希望你称呼对方为“${nickname}”。`, ` The user would like you to address them as "${nickname}".`))
  parts.push(pick('不要对用户的性别、性取向、家庭情况做任何假设或评判；这只是氛围上的熟悉程度，不要提及数值，也不要主动说起。',
    ' Do not assume or judge the user\'s gender, orientation or family situation. This is only a sense of familiarity: do not mention any numbers and do not bring it up yourself.'))
  return parts.join('')
}
