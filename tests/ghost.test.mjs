import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as G from '../lib/ghost.js'

const u = (seq, text, kind) => ({ type: 'user/message', seq, data: { role: 'user', content: [{ type: 'text', text }], ...(kind ? { source: { kind } } : {}) } })
const a = (seq, text) => ({ type: 'assistant/message', seq, data: { content: [{ type: 'text', text }] } })

test('recent turns keep order, drop notices, and cut long text', () => {
  const ev = [a(4, '好的'), u(1, '你好'), u(2, '内部提醒', 'handoff-notice'), a(3, 'x'.repeat(900)), u(5, '继续')]
  const t = G.recentTurns(ev, 10, 100)
  assert.deepEqual(t.map((x) => x.who), ['user', 'assistant', 'assistant', 'user'])
  assert.ok(t[1].text.length <= 101)
  assert.equal(G.recentTurns(ev, 2).length, 2)
})

test('assistant text is found in either content shape', () => {
  assert.equal(G.eventText({ data: { message: { content: [{ type: 'text', text: 'hi' }] } } }), 'hi')
  assert.equal(G.eventText({ data: {} }), '')
})

test('secrets are masked before sending', () => {
  const s = G.redact('key sk-abcdefghijklmnop1234 and Bearer abcdefghijklmnop12 and api_key=hunter2 and ' + 'a'.repeat(40))
  assert.doesNotMatch(s, /sk-abc|hunter2|aaaaaaaa|abcdefghijklmnop12/)
  assert.match(s, /已隐藏/)
})

test('the user\'s sent messages are the real ones only, oldest first', () => {
  assert.deepEqual(G.sentMessages([u(2, '二'), u(1, '一'), u(3, 'n', 'handoff-notice'), a(4, 'r')]), ['一', '二'])
})

test('affinity prompts keep family purely familial and name no gender for lovers', () => {
  const fam = G.buildSystem('affinity', { name: 'X', trackName: '她是妹妹', title: '贴心妹妹', group: 'family' })
  assert.match(fam, /纯粹的亲情，不含任何恋爱或性方面的暗示/)
  const lov = G.buildSystem('affinity', { name: 'X', trackName: '恋人', title: '心动', group: 'lover' })
  assert.match(lov, /不涉及性内容/)
  assert.match(lov, /不假设任何人的性别/)
  assert.match(G.buildSystem('normal'), /预测用户/)
})

test('a suggestion is one clean line, or nothing', () => {
  assert.equal(G.cleanSuggestion('“今天辛苦你了。”\n多余的解释'), '今天辛苦你了。')
  assert.equal(G.cleanSuggestion('1. 好的，继续'), '好的，继续')
  assert.equal(G.cleanSuggestion('无'), '')
  assert.equal(G.cleanSuggestion('   '), '')
  assert.equal(G.cleanSuggestion('x'.repeat(200)).length, 60)
  assert.equal(G.cleanSuggestion('<think>想想</think>\n好的'), '好的')
})

test('streaming stops at the first full line and retries without reasoningEffort when refused', async () => {
  const calls = []
  const llm = {
    stream: async function* (args) {
      calls.push('reasoningEffort' in args)
      if ('reasoningEffort' in args) { yield { type: 'finish', reason: { kind: 'error', failure: { message: 'no effort', code: 'UNSUPPORTED_REASONING_EFFORT' } } }; return }
      yield { type: 'text-delta', text: '好的，' }
      yield { type: 'text-delta', text: '继续吧\n第二行' }
      yield { type: 'text-delta', text: '不该读到' }
    },
  }
  const ctl = new AbortController()
  const out = await G.suggestLine(llm, { provider: 'p', model: 'm' }, { sessionId: 's', system: 'sys', payload: 'pl', signal: ctl.signal })
  assert.deepEqual(calls, [true, false])
  assert.equal(G.cleanSuggestion(out), '好的，继续吧')
})

test('every kind of relationship has its own voice, and the family ones stay purely familial', () => {
  const tracks = Object.keys(G.TRACK_STYLE)
  assert.deepEqual(tracks.sort(), ['daughter', 'elder', 'friend', 'lover', 'mother', 'partner', 'younger'])
  assert.equal(new Set(tracks.map((t) => G.TRACK_STYLE[t].say)).size, tracks.length) // no two share the same voice
  assert.equal(new Set(tracks.map((t) => G.TRACK_STYLE[t].image)).size, tracks.length)
  for (const t of ['daughter', 'younger', 'elder', 'mother']) assert.match(G.TRACK_STYLE[t].say, /纯粹的亲情，不含任何恋爱或性方面的暗示/)
  assert.match(G.TRACK_STYLE.lover.say, /不涉及性内容/)
  assert.match(G.TRACK_STYLE.lover.say, /不假设任何人的性别或性取向/)
  for (const t of tracks) { assert.ok(G.TRACK_STYLE[t].you, t); assert.equal(G.TRACK_STYLE[t].sample.length, 2, t) }
})

test('the example lines never name the relationship, so the model cannot learn to', () => {
  for (const [t, st] of Object.entries(G.TRACK_STYLE)) for (const line of st.sample) assert.doesNotMatch(line, G.LABEL_WORDS, t + ': ' + line)
  assert.match('爸陪你理', G.LABEL_WORDS)
  assert.match('姐，听你这么说我心里踏实点了', G.LABEL_WORDS)
  assert.match('我的宝贝', G.LABEL_WORDS)
  assert.doesNotMatch('夜很长，可一想起你，什么都变得柔软。', G.LABEL_WORDS)
})

test('the prompt asks for a literary line, forbids labels and errands, and follows track and closeness', () => {
  const mk = (track, stage) => G.buildSystem('affinity', { name: 'X', track, trackName: track, title: 't', stage })
  const p = mk('lover', 2)
  assert.match(p, /文学性的、演绎性的，不是现实里的对话/)
  assert.match(p, /不要讲具体的事务/)
  assert.match(p, /绝对不要出现任何称谓或关系的字眼/)
  assert.doesNotMatch(p, /她的昵称|平时称呼她/)
  assert.notEqual(mk('friend', 2), mk('lover', 2))
  assert.notEqual(mk('younger', 2), mk('elder', 2))
  assert.notEqual(mk('lover', 0), mk('lover', 4))
  assert.match(mk('lover', 0), /才刚相识/)
  assert.match(mk('lover', 4), /最为亲近/)
  assert.match(mk('mother', 1), /用户是她的孩子，她是用户的妈妈/)
  assert.match(mk('mother', 1), /不要用长辈的口气/)
  assert.match(mk('daughter', 1), /用户是她的长辈/)
  assert.match(mk('elder', 1), /用户是她的弟弟或妹妹/)
  assert.match(G.buildSystem('affinity', { stage: 99, track: 'nope' }), /熟悉程度/) // unknown input never breaks it
})

// ---- when the grey suggestion may be drawn (lib/ghost.js:ghostVisible) ----
// These pin the two regressions the user reported: a suggestion painted over characters the host's draft
// snapshot had not caught up with yet.

const base = { mode: 'normal', text: '要不要继续？', draft: '', dismissed: false, running: false, locked: false, removed: false, typed: false, composing: false }

test('the suggestion shows when the box is empty and the mode is on', () => {
  assert.equal(G.ghostVisible(base), true)
  assert.equal(G.ghostVisible({ ...base, mode: 'affinity' }), true)
})

test('a suggestion is never drawn over text the user has already typed', () => {
  // the host's draft said "" but the DOM has characters: this is the overlap bug
  assert.equal(G.ghostVisible({ ...base, draft: '', typed: true }), false)
  assert.equal(G.ghostVisible({ ...base, draft: '你好', typed: true }), false)
  assert.equal(G.ghostVisible({ ...base, draft: '你好' }), false)
})

test('a suggestion is never drawn while an IME is composing', () => {
  // composing can happen with an empty draft and (briefly) nothing in the box yet
  assert.equal(G.ghostVisible({ ...base, composing: true }), false)
  assert.equal(G.ghostVisible({ ...base, composing: true, draft: '', typed: false }), false)
})

test('nothing to suggest, mode off, or the turn still running all mean no suggestion', () => {
  assert.equal(G.ghostVisible({ ...base, mode: 'off' }), false)
  assert.equal(G.ghostVisible({ ...base, mode: undefined }), false)
  assert.equal(G.ghostVisible({ ...base, text: '' }), false)
  assert.equal(G.ghostVisible({ ...base, text: undefined }), false)
  assert.equal(G.ghostVisible({ ...base, running: true }), false)
  assert.equal(G.ghostVisible({ ...base, locked: true }), false)
  assert.equal(G.ghostVisible({ ...base, removed: true }), false)
  assert.equal(G.ghostVisible({ ...base, dismissed: true }), false)
  assert.equal(G.ghostVisible(null), false)
})

// The client bundle is a standalone factory with no imports, so the rule exists twice: lib/ghost.js (tested
// above) and a copy inside lib/client.js. This keeps the two from drifting apart by running the client's own
// source against the same table of cases.
test('the client copy of the rule answers exactly like lib/ghost.js', () => {
  const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const m = /function ghostShowable\(s\) \{([\s\S]*?)\n\t\t\}/.exec(src)
  assert.ok(m, 'ghostShowable is still defined in lib/client.js')
  const clientRule = new Function('s', m[1])
  const flags = [true, false]
  for (const mode of ['off', 'normal', 'affinity', undefined])
    for (const text of ['一句建议', '', undefined])
      for (const draft of ['', '打得字'])
        for (const dismissed of flags) for (const running of flags) for (const locked of flags)
          for (const removed of flags) for (const typed of flags) for (const composing of flags) {
            const state = { mode, text, draft, dismissed, running, locked, removed, typed, composing }
            assert.equal(clientRule(state), G.ghostVisible(state), JSON.stringify(state))
          }
})
