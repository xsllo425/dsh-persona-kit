import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setLang, getLang, resolveLang } from '../lib/lang.js'
import * as T from '../lib/tracks.js'
import { defaultLevels, normalizeCard, sectionText, emotionOf } from '../lib/core.js'
import { buildSystem, buildPayload, TRACK_STYLE, stageStyle, LABEL_WORDS } from '../lib/ghost.js'
import { titleOf, emptyBond } from '../lib/bond.js'
import { collectDefs } from '../lib/achievements.js'
import { notice, noticePlain, continuePrefix } from '../lib/handoff.js'
import { enableToolsDescription } from '../lib/gate.js'

const CJK = /[㐀-鿿]/
const ACH = JSON.parse(readFileSync(new URL('../defaults/achievements.json', import.meta.url), 'utf8'))
test.afterEach(() => setLang('zh'))

test('the language follows the setting, or the machine\'s locale when it says auto', () => {
  assert.equal(resolveLang('en', 'zh-CN'), 'en')
  assert.equal(resolveLang('zh', 'en-US'), 'zh')
  assert.equal(resolveLang('auto', 'zh-CN'), 'zh')
  assert.equal(resolveLang('auto', 'zh_TW.UTF-8'), 'zh')
  assert.equal(resolveLang('auto', 'en-GB'), 'en')
  assert.equal(resolveLang(undefined, 'ja-JP'), 'en')
  setLang('fr'); assert.equal(getLang(), 'zh') // anything unknown is Chinese, the original language
})

test('in English nothing the model or the user reads still contains Chinese', () => {
  setLang('en')
  for (const [id, t] of Object.entries(T.TRACKS)) {
    for (const f of [t.name, t.metric, t.line, ...t.titles, ...t.nicknames]) assert.doesNotMatch(f, CJK, `${id}: ${f}`)
    assert.equal(t.titles.length, 5, id)
  }
  assert.ok(T.groups().every(([, n]) => !CJK.test(n)))
  for (const l of defaultLevels()) { assert.doesNotMatch(l.name + l.line, CJK) }
  const card = normalizeCard({}, 'x')
  assert.doesNotMatch(sectionText(card, 3, T.bondText('lover', 'A flutter', 'Darling')), CJK)
  for (const track of Object.keys(T.TRACKS)) for (let stage = 0; stage < 5; stage++) {
    const p = buildSystem('affinity', { name: 'Sage', track, trackName: T.TRACKS[track].name, title: 't', stage })
    assert.doesNotMatch(p, CJK, `${track}/${stage}`)
  }
  assert.doesNotMatch(buildSystem('normal'), CJK)
  assert.doesNotMatch(buildPayload([{ who: 'user', text: 'hello sk-abcdefghijklmnop1234' }, { who: 'assistant', text: 'hi' }]), CJK)
  assert.match(buildPayload([{ who: 'user', text: 'key sk-abcdefghijklmnop1234' }]), /\[hidden\]/)
  assert.doesNotMatch(notice() + noticePlain() + continuePrefix(), CJK)
  assert.doesNotMatch(enableToolsDescription({ groups: { computer: { title: 'Computer control' } } }), CJK)
  assert.doesNotMatch(titleOf({ ...emptyBond(), turns: 40, rebirths: 2 }, null), CJK)
  assert.match(titleOf({ ...emptyBond(), rebirths: 2 }, null), /Rebirth 2/)
  for (const d of collectDefs(ACH)) assert.doesNotMatch(d.name + d.desc, CJK, d.id)
})

test('in Chinese the same texts are Chinese, and a card\'s own texts are shown as written in both', () => {
  assert.match(T.TRACKS.lover.name, CJK)
  assert.match(sectionText(normalizeCard({}, 'x'), 1), /说话强度/)
  assert.match(buildSystem('affinity', { track: 'lover', stage: 0 }), CJK)
  assert.equal(collectDefs(ACH).find((d) => d.id === 'first-words').name, '初次见面')
  const own = { levels: [{ name: 'Mine', line: 'my own text' }] }
  for (const lang of ['zh', 'en']) { setLang(lang); const c = normalizeCard(own, 'x'); assert.equal(c.levels[0].name, 'Mine'); assert.equal(c.levels[0].line, 'my own text') }
  setLang('en')
  const c = normalizeCard(own, 'x') // the four levels the card did not write fall back to the English defaults
  assert.equal(c.levels[1].name, 'Reserved')
})

test('the model\'s own words are caught in either language when it names the relationship', () => {
  for (const bad of ['爸陪你理', 'Come here, my darling', 'Thanks, sis', 'my friend']) assert.match(bad, LABEL_WORDS, bad)
  for (const ok of ['夜很长，可一想起你，什么都变得柔软。', 'The night is long, yet thinking of you softens everything.']) assert.doesNotMatch(ok, LABEL_WORDS, ok)
  for (const t of Object.values(TRACK_STYLE)) for (const lang of ['zh', 'en']) { setLang(lang); for (const line of t.sample) assert.doesNotMatch(line, LABEL_WORDS, line) }
})

test('every kind of relationship keeps the same safety wording in both languages', () => {
  for (const lang of ['zh', 'en']) {
    setLang(lang)
    for (const id of ['daughter', 'younger', 'elder', 'mother']) {
      assert.match(T.TRACKS[id].line, lang === 'zh' ? /纯粹的亲情，不含任何恋爱或性方面的暗示/ : /purely a family bond, with no romantic or sexual undertones at all/i, `${lang}/${id}`)
      assert.match(TRACK_STYLE[id].say, lang === 'zh' ? /纯粹的亲情/ : /Purely a family bond/, `${lang}/${id} style`)
    }
    assert.match(T.TRACKS.lover.line, lang === 'zh' ? /不涉及性内容/ : /never sexual/)
    assert.match(T.TRACKS.lover.line, lang === 'zh' ? /同性、异性或别的/ : /same-sex, opposite-sex or otherwise/)
    assert.match(TRACK_STYLE.lover.say, lang === 'zh' ? /不假设任何人的性别或性取向/ : /assume no one's gender or orientation/)
    assert.match(T.bondText('friend', 't'), lang === 'zh' ? /性别、性取向、家庭情况做任何假设/ : /gender, orientation or family situation/)
  }
})

test('the emotion detector understands English replies too', () => {
  assert.equal(emotionOf('Sorry, that failed with an error'), 'sad')
  assert.equal(emotionOf('All done, great success!'), 'happy')
  assert.equal(emotionOf('Thanks, that is so cute'), 'shy')
  assert.equal(stageStyle().length, 5)
})
