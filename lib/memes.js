// dsh-persona-kit meme library: mood buckets, keyword search, store-only zip. Node built-ins only.
//
// A pack is a folder holding an index.db (a `memes` table) plus the image files, which is exactly the
// layout the old dsh-meme plugin used — so an existing library under ~/.dsh/meme-packs needs no
// migration and this module never has to move a byte. Search and mood sampling only read; the only
// writer here is the high-frequency keyword cleanup that an import runs once on the copy it staged.
import { DatabaseSync } from 'node:sqlite'
import { pick } from './lang.js'

/** The six mood buckets the model may ask for. The tags on disk stay as they are; this is a view. */
export const MOODS = {
  happy: ['happy', 'like', 'meow', 'givemoney', 'color'],
  angry: ['angry', 'fool', 'baka'],
  sad: ['sad', 'sigh'],
  shy: ['shy'],
  confused: ['confused', 'surprised', 'see'],
  daily: ['daily', 'sleep', 'morning', 'work', 'cpu', 'reply'],
}

export const moodNames = () => Object.keys(MOODS)

// Colloquial words a mood can be read from when the model sends a query but no bucket. Chinese words are
// matched as substrings (no word spacing), ASCII words on word boundaries so "sad" does not fire inside
// "saddle". These are matching data, never shown to anyone, so they carry no translations.
const MOOD_WORDS = {
  happy: '开心 高兴 兴奋 喜欢 卖萌 可爱 比心 哈哈 欢迎 得意 好耶 满意 happy glad yay cute love',
  angry: '生气 愤怒 暴躁 笨蛋 傻瓜 嫌弃 angry mad annoyed',
  sad: '难过 哭 委屈 叹气 无语 求饶 怂 晕 sad cry sigh',
  shy: '害羞 腼腆 脸红 花痴 shy blush',
  confused: '困惑 疑惑 惊讶 问号 懵 惊吓 震惊 confused puzzled huh',
  daily: '困 睡觉 早上好 打招呼 你好 上班 下班 摸鱼 工作 熬夜 吃饭 干饭 饿 日常 sleepy morning hello work',
}

const CJK = /[\u4e00-\u9fff]/

const wordHit = (hay, word) => (CJK.test(word) ? hay.includes(word) : new RegExp(`\\b${word}\\b`, 'i').test(hay))

/** The description of the mood dictionary used in tool text, localized. */
export const moodDict = () => (pick(
  'happy 开心(卖萌/可爱/喜欢) / angry 生气 / sad 难过(无语/求饶) / shy 害羞 / confused 困惑惊讶 / daily 日常(睡觉/上班/早上好)',
  'happy (cute, liking, pleased) / angry / sad (speechless, pleading) / shy / confused (surprised) / daily (sleepy, working, good morning)',
))

/**
 * Fine tags a bucket covers, or the fine tag itself. An unknown tag is treated as its own fine tag so a
 * hand-labelled pack still narrows the search instead of silently matching nothing.
 * @param {string} tag
 * @returns {string[] | null}
 */
function fineTagsFor(tag) {
  const t = String(tag || '').trim().toLowerCase()
  if (!t) return null
  if (MOODS[t]) return MOODS[t]
  for (const fine of Object.values(MOODS)) if (fine.includes(t)) return [t]
  return [t]
}

function moodsFromQuery(text) {
  const lower = String(text || '').toLowerCase()
  const hit = []
  for (const [mood, words] of Object.entries(MOODS)) {
    if (words.some((w) => wordHit(lower, w))) { hit.push(mood); continue }
    if (MOOD_WORDS[mood].split(/\s+/).some((w) => w && wordHit(lower, w))) hit.push(mood)
  }
  return hit
}

/**
 * The bucket to sample from: the tag wins, and only when it names nothing does the query get a say.
 * @param {string} tag a bucket name or a fine tag
 * @param {string} query free words from the model
 * @returns {string | null} one of {@link MOODS}'s keys
 */
export function resolveMood(tag, query) {
  const t = String(tag || '').trim().toLowerCase()
  if (t) {
    if (MOODS[t]) return t
    for (const [mood, fine] of Object.entries(MOODS)) if (fine.includes(t)) return mood
  }
  const q = String(query || '').trim()
  if (!q) return null
  const lower = q.toLowerCase()
  if (MOODS[lower]) return lower
  return moodsFromQuery(q)[0] || null
}

function pickRandom(rows, n, rnd = Math.random) {
  const copy = rows.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy.slice(0, n)
}

/**
 * Split a query into keywords: space, comma, enumeration comma, slash and bar separate, lowercased and
 * de-duplicated. Chinese is kept whole — no dictionary is involved, so slicing a word would only invent
 * fragments that match nothing.
 * @param {string} query
 * @returns {string[]}
 */
export function keywordTokens(query) {
  const raw = String(query || '').trim().toLowerCase()
  if (!raw) return []
  return [...new Set(raw.split(/[\s,，、;；/|]+/).filter(Boolean))]
}

/** Two-character slices of a long Chinese token, for when the whole word matches nothing. */
function biGrams(tokens) {
  const out = []
  for (const t of tokens) {
    if (t.length < 3 || !CJK.test(t)) continue
    for (let i = 0; i + 2 <= t.length; i++) out.push(t.slice(i, i + 2))
  }
  return [...new Set(out)]
}

const rowHay = (row) => (
  (row.tag || '') + ' ' + (row.caption || '') + ' ' + (row.keywords || '') + ' ' + (row.file_name || '')
).toLowerCase()

/**
 * Keyword search over index rows. Every-token matches come first; otherwise the largest hit count wins.
 * Within one score the order is shuffled, so asking the same thing twice offers a different picture
 * instead of always the same one.
 * @param {Array<object>} rows index rows
 * @param {string} query
 * @param {number} [limit]
 * @param {() => number} [rnd] injectable randomness, for tests
 * @returns {{query: string, tokens: string[], memes: object[]}}
 */
export function searchRows(rows, query, limit = 8, rnd = Math.random) {
  const tokens = keywordTokens(query)
  if (tokens.length === 0) return { query: '', tokens: [], memes: [] }
  const list = Array.isArray(rows) ? rows : []
  const scan = (words) => {
    const hits = []
    for (const row of list) {
      const hay = rowHay(row)
      let score = 0
      for (const w of words) if (hay.includes(w)) score++
      if (score > 0) hits.push({ row, score })
    }
    return hits
  }
  let hits = scan(tokens)
  if (hits.length === 0) {
    const grams = biGrams(tokens)
    if (grams.length) hits = scan(grams)
  }
  if (hits.length === 0) return { query: tokens.join(' '), tokens, memes: [] }
  const best = Math.max(...hits.map((h) => h.score))
  return { query: tokens.join(' '), tokens, memes: pickRandom(hits.filter((h) => h.score === best).map((h) => h.row), limit, rnd) }
}

/** The keywords of a row, split the same way {@link keywordTokens} splits a query but keeping case. */
const keywordWords = (s) => String(s || '').split(/[\s,，、;；/|]+/).filter(Boolean)

/**
 * High-frequency keyword cleanup for an imported pack.
 *
 * Shared packs often repeat a "character tag" on every row, so searching that word hits the whole pack
 * and the index tells you nothing. The rule is frequency, not a blacklist: a word on half the rows (and
 * on at least two) carries no information about which picture to pick. Small packs are left alone —
 * in three cat pictures "cat" is on all of them and is the only way in.
 * @param {Array<{keywords?: string}>} rows
 * @param {{threshold?: number, minRows?: number}} [opts]
 * @returns {{total: number, drop: string[], cleaned: (string|null)[]}} cleaned is null for unchanged rows
 */
export function pruneCommonKeywords(rows, { threshold = 0.5, minRows = 8 } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const total = list.length
  const none = list.map(() => null)
  if (total < minRows) return { total, drop: [], cleaned: none }
  const words = list.map((row) => keywordWords(row && row.keywords))
  const counts = new Map()
  for (const toks of words) for (const w of new Set(toks.map((t) => t.toLowerCase()))) counts.set(w, (counts.get(w) || 0) + 1)
  const floor = Math.max(2, Math.ceil(total * threshold))
  const drop = [...counts].filter(([, n]) => n >= floor).map(([w]) => w)
  if (drop.length === 0) return { total, drop: [], cleaned: none }
  const dropSet = new Set(drop)
  return {
    total,
    drop,
    cleaned: words.map((toks) => {
      const keep = toks.filter((w) => !dropSet.has(w.toLowerCase()))
      return keep.length === toks.length ? null : keep.join(' ')
    }),
  }
}

/**
 * Run the cleanup once on a staged pack. Only the keywords column changes; a failure here must not fail
 * the import, so callers wrap it. The database is opened read-write on purpose — the caller owns this
 * copy, never a pack the user already has.
 * @param {string} indexPath
 * @param {{threshold?: number, minRows?: number}} [opts]
 * @returns {{drop: string[], changed: number}}
 */
export function prunePackKeywords(indexPath, opts) {
  const db = new DatabaseSync(indexPath)
  try {
    const rows = db.prepare("SELECT rowid AS rid, COALESCE(keywords, '') AS keywords FROM memes").all()
    const { drop, cleaned } = pruneCommonKeywords(rows, opts)
    if (drop.length === 0) return { drop: [], changed: 0 }
    let changed = 0
    const update = db.prepare('UPDATE memes SET keywords = ? WHERE rowid = ?')
    for (let i = 0; i < rows.length; i++) {
      if (cleaned[i] === null) continue
      update.run(cleaned[i], rows[i].rid)
      changed++
    }
    return { drop, changed }
  } finally {
    db.close()
  }
}

// ---- store-only zip: export and import in one dependency-free pair ----
// The archive format is deliberately the dumbest one: no compression, so a pack can be inspected and
// repaired with any zip tool and nothing can be lost to a codec surprise.

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/**
 * Pack a file list into a store-only zip.
 * @param {Array<{name: string, data: Buffer}>} files
 * @returns {Buffer}
 */
export function zipStore(files) {
  const list = Array.isArray(files) ? files : []
  const parts = []
  const central = []
  let offset = 0
  for (const f of list) {
    const nameBuf = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)          // file names are UTF-8
    lh.writeUInt16LE(0, 8)               // store: no compression
    lh.writeUInt32LE(0, 10)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(f.data.length, 18)
    lh.writeUInt32LE(f.data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    parts.push(lh, nameBuf, f.data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(0, 10)
    ch.writeUInt32LE(0, 12)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(f.data.length, 20)
    ch.writeUInt32LE(f.data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + f.data.length
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(list.length, 8)
  eocd.writeUInt16LE(list.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...parts, ...central, eocd])
}

/**
 * Read a store-only zip back into name → bytes. Compressed entries are refused rather than guessed at:
 * this pair only ever writes store-only archives, so a deflated entry means the file is not ours.
 * @param {Buffer} buf
 * @returns {Map<string, Buffer>}
 */
export function unzipStore(buf) {
  const out = new Map()
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let pos = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('zip central directory is damaged')
    const method = buf.readUInt16LE(pos + 10)
    const compSize = buf.readUInt32LE(pos + 20)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localOffset = buf.readUInt32LE(pos + 42)
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    if (method !== 0) throw new Error('compressed zip entry (store only): ' + name)
    out.set(name, Buffer.from(buf.subarray(dataStart, dataStart + compSize)))
    pos += 46 + nameLen + extraLen + commentLen
  }
  return out
}
