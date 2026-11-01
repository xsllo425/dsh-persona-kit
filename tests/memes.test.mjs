import test from 'node:test'
import assert from 'node:assert/strict'
import * as M from '../lib/memes.js'

const row = (tag, caption, keywords, file_name) => ({ tag, caption, keywords, file_name })

test('the six buckets are the ones the model may name, and fine tags resolve to their bucket', () => {
  assert.deepEqual(M.moodNames(), ['happy', 'angry', 'sad', 'shy', 'confused', 'daily'])
  assert.equal(M.resolveMood('happy'), 'happy')
  assert.equal(M.resolveMood('HAPPY'), 'happy')
  assert.equal(M.resolveMood(' like '), 'happy')       // a fine tag of happy
  assert.equal(M.resolveMood('meow'), 'happy')
  assert.equal(M.resolveMood('sigh'), 'sad')
  assert.equal(M.resolveMood('reply'), 'daily')
  assert.equal(M.resolveMood(''), null)
  assert.equal(M.resolveMood('   '), null)
  assert.equal(M.resolveMood('nonsense'), null)        // no bucket, no query to fall back on
})

test('when the tag names no bucket the query decides, in Chinese or English', () => {
  assert.equal(M.resolveMood('', '今天有点难过'), 'sad')
  assert.equal(M.resolveMood('', '她生气了'), 'angry')
  assert.equal(M.resolveMood('', '早上好呀'), 'daily')
  assert.equal(M.resolveMood('', 'so happy today'), 'happy')
  assert.equal(M.resolveMood('', 'hmm, confused'), 'confused')
  assert.equal(M.resolveMood('', '完全看不懂'), null)     // nothing here names a mood
  assert.equal(M.resolveMood('', 'saddle'), null)        // "sad" inside another word must not fire
  assert.equal(M.resolveMood('nonsense', '好害羞'), 'shy') // an unusable tag hands over to the query
})

test('keywords split on every separator the tool accepts, lowercase and de-duplicated', () => {
  assert.deepEqual(M.keywordTokens('猫'), ['猫'])
  assert.deepEqual(M.keywordTokens('  猫  狗  '), ['猫', '狗'])
  assert.deepEqual(M.keywordTokens('猫,狗，鸟、鱼;虾；蟹/蛙|虫'), ['猫', '狗', '鸟', '鱼', '虾', '蟹', '蛙', '虫'])
  assert.deepEqual(M.keywordTokens('Cat cat CAT'), ['cat'])
  assert.deepEqual(M.keywordTokens(''), [])
  assert.deepEqual(M.keywordTokens(null), [])
  assert.deepEqual(M.keywordTokens(' ,，、 ;  '), [])
})

test('search ranks every-token matches first and shuffles only within one score', () => {
  const rows = [
    row('happy', '开心比心', '比心 喜欢', 'a.webp'),
    row('happy', '开心', '开心', 'b.webp'),
    row('sad', '难过', '', 'c.webp'),
  ]
  const both = M.searchRows(rows, '开心 比心', 8, () => 0)
  assert.equal(both.memes.length, 1)                    // only a.webp has both tokens
  assert.equal(both.memes[0].file_name, 'a.webp')
  assert.deepEqual(both.tokens, ['开心', '比心'])
  assert.equal(both.query, '开心 比心')

  const one = M.searchRows(rows, '开心', 8, () => 0)
  assert.equal(one.memes.length, 2)                     // a and b both score 1
  assert.deepEqual(one.memes.map((m) => m.file_name).sort(), ['a.webp', 'b.webp'])
})

test('a long Chinese word that matches nothing falls back to two-character slices', () => {
  const rows = [row('happy', '今天很开心', '', 'ok.webp')]
  assert.equal(M.searchRows(rows, '很开心啊', 8, () => 0).memes.length, 1)  // 很开 / 开心 both hit
  assert.equal(M.searchRows(rows, '不高兴', 8, () => 0).memes.length, 0)
})

test('an empty gallery or a missing index answers nothing instead of throwing', () => {
  assert.deepEqual(M.searchRows([], '猫').memes, [])
  assert.deepEqual(M.searchRows(null, '猫').memes, [])
  assert.deepEqual(M.searchRows([], '').memes, [])
  assert.deepEqual(M.searchRows([row('happy', 'x', '', 'x.webp')], '').memes, [])
  assert.equal(M.resolveMood(undefined, undefined), null)
})

test('the limit holds even when every row ties', () => {
  const rows = Array.from({ length: 20 }, (_, i) => row('happy', '开心', '开心', `${i}.webp`))
  assert.equal(M.searchRows(rows, '开心', 5).memes.length, 5)
  assert.equal(M.searchRows(rows, '开心').memes.length, 8)   // default
})

test('keywords repeated on half the rows are dropped; small packs are left alone', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ keywords: `大肥鱼 词${i}` }))
  const { drop, cleaned, total } = M.pruneCommonKeywords(rows)
  assert.equal(total, 10)
  assert.deepEqual(drop, ['大肥鱼'])                    // on 10/10 rows, no information
  assert.equal(cleaned[0], '词0')
  assert.equal(cleaned[9], '词9')

  // exactly half is still noise: floor = ceil(10 * 0.5) = 5
  const half = Array.from({ length: 10 }, (_, i) => ({ keywords: i < 5 ? '猫' : '狗' }))
  assert.deepEqual(M.pruneCommonKeywords(half).drop.toSorted(), ['狗', '猫'])

  // a word on fewer than half the rows stays put
  const few = Array.from({ length: 10 }, (_, i) => ({ keywords: i < 4 ? '猫' : `词${i}` }))
  assert.deepEqual(M.pruneCommonKeywords(few).drop, [])

  // and nothing is touched in a pack below minRows
  const small = Array.from({ length: 3 }, () => ({ keywords: '猫' }))
  assert.deepEqual(M.pruneCommonKeywords(small).drop, [])
  assert.deepEqual(M.pruneCommonKeywords([], {}).drop, [])
  assert.deepEqual(M.pruneCommonKeywords(null, {}).drop, [])
})

test('nothing high-frequency means nothing is rewritten', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ keywords: `词${i}` }))
  const { drop, cleaned } = M.pruneCommonKeywords(rows)
  assert.deepEqual(drop, [])
  assert.ok(cleaned.every((c) => c === null))
})

test('a pack survives the zip round trip byte for byte', () => {
  const files = [
    { name: 'manifest.json', data: Buffer.from('{"id":"p1"}', 'utf8') },
    { name: 'index.db', data: Buffer.from([0, 1, 2, 255]) },
    { name: 'images/001.webp', data: Buffer.from('RIFF....WEBP') },
    { name: '中文目录/图 1.webp', data: Buffer.from('x') },   // UTF-8 names, spaces included
  ]
  const back = M.unzipStore(M.zipStore(files))
  assert.equal(back.size, files.length)
  for (const f of files) {
    assert.ok(back.has(f.name), f.name)
    assert.deepEqual(back.get(f.name), f.data, f.name)
  }
})

test('an empty archive round-trips, and sorting garbage out never guesses', () => {
  assert.equal(M.unzipStore(M.zipStore([])).size, 0)
  assert.throws(() => M.unzipStore(Buffer.from('not a zip at all')), /not a zip/)
  assert.throws(() => M.unzipStore(Buffer.alloc(0)), /not a zip/)
  // a deflated entry is refused: this pair only ever writes store-only archives
  const one = M.zipStore([{ name: 'a.txt', data: Buffer.from('x') }])
  const central = one.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  one.writeUInt16LE(8, 8)              // local header: method = deflate
  one.writeUInt16LE(8, central + 10)   // central directory: method = deflate
  assert.throws(() => M.unzipStore(one), /compressed/)
})

test('the mood dictionary is described in both languages', () => {
  const zh = M.moodDict()
  assert.match(zh, /happy/)
  assert.match(zh, /开心/)
  assert.doesNotMatch(zh, /undefined/)
})
