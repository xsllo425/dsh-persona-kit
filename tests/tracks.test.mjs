import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../lib/tracks.js'

test('every track has five short titles and a tone line', () => {
  for (const [id, t] of Object.entries(T.TRACKS)) {
    assert.equal(t.titles.length, 5, id)
    for (const x of t.titles) assert.ok(x.length >= 1 && x.length <= 8, `${id}:${x}`)
    assert.ok(t.line.length > 10)
    assert.ok(T.GROUPS.some(([g]) => g === t.group), id)
  }
})

test('family tracks are purely familial; romance never mixes in and assumes no gender', () => {
  for (const t of Object.values(T.TRACKS).filter((x) => x.group === 'family')) {
    assert.match(t.line, /纯粹的亲情，不含任何恋爱或性方面的暗示/)
    assert.doesNotMatch(t.titles.join(''), /恋|爱人|情人|老公|老婆/)
  }
  const lover = T.TRACKS.lover
  assert.match(lover.line, /不涉及性内容/)
  assert.match(lover.line, /同性/)
  assert.doesNotMatch(lover.titles.join(''), /男友|女友|老公|老婆|丈夫|妻子/)
  assert.equal(Object.values(T.TRACKS).filter((x) => x.group === 'lover').length, 1)
})

test('the bond sentence carries track, title, nickname, and the no-assumption rule', () => {
  const s = T.bondText('younger', '贴心妹妹', '哥哥')
  assert.match(s, /她是妹妹（贴心妹妹）/)
  assert.match(s, /称呼对方为“哥哥”/)
  assert.match(s, /不要对用户的性别、性取向、家庭情况做任何假设/)
  assert.doesNotMatch(T.bondText('nope', 'x'), /undefined/)
})

test('nicknames are plain one-line text', () => {
  assert.equal(T.cleanNickname('  哥\n哥 <script>{}[]`  '), '哥哥 script')
  assert.equal(T.cleanNickname('一二三四五六七八九十一二三四五六七八九十一二三四五六七'), '一二三四五六七八九十一二三四五六七八九十一二三四')
  assert.equal(T.cleanNickname(5), '')
})

test('card titles only replace the friend titles', () => {
  const five = ['a', 'b', 'c', 'd', 'e']
  assert.deepEqual(T.titlesFor('friend', five), five)
  assert.deepEqual(T.titlesFor('lover', five), T.TRACKS.lover.titles)
  assert.deepEqual(T.titlesFor('bogus', null), T.TRACKS.friend.titles)
})
