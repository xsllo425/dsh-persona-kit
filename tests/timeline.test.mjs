import test from 'node:test'
import assert from 'node:assert/strict'
import { roleTimeline, mergeTurns } from '../lib/timeline.js'

const user = (seq, text = 'hi') => ({ type: 'user/message', seq, data: { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } } })
const plain = (seq) => ({ type: 'user/message', seq, data: { role: 'user', content: [{ type: 'text', text: 'x' }] } })
const notice = (seq, from, to) => ({ type: 'user/message', seq, data: { role: 'user', content: [{ type: 'text', text: 'switch' }], source: { kind: 'role-notice', form: 'role-change', from, to } } })
const asst = (seq) => ({ type: 'assistant/message', seq, data: {} })

test('a session without any notice is unknown, never "the current role"', () => {
  assert.deepEqual(roleTimeline([user(1), asst(2), user(3), asst(4)]), [null, null])
})

test('switches split the turns, even when events arrive out of order', () => {
  const ev = [notice(5, 'alice', 'bob'), user(1), asst(2), user(3), asst(4), user(6), asst(7), notice(8, 'bob', null), user(9)]
  assert.deepEqual(roleTimeline(ev.reverse(), 'zzz'), ['alice', 'alice', 'bob', ''])
})

test('other kinds of user-role messages are not turns', () => {
  const sys = { type: 'user/message', seq: 2, data: { role: 'user', content: [{ type: 'text', text: 'note' }], source: { kind: 'handoff-notice' } } }
  assert.deepEqual(roleTimeline([user(1), sys, plain(3)]), [null, null])
  assert.deepEqual(roleTimeline([]), [])
})

test('a switch notice written after the user message belongs to the reply that follows it', () => {
  // turn 1 by alice; the user switches to bob, then sends turn 2: the notice lands after turn 2's message, before its reply
  const ev = [user(1), asst(2), user(3), notice(4, 'alice', 'bob'), asst(5), user(6), asst(7)]
  assert.deepEqual(roleTimeline(ev, 'bob'), ['alice', 'bob', 'bob'])
  // a notice between two finished exchanges does not touch the earlier turn
  const ev2 = [user(1), asst(2), notice(3, 'alice', 'bob'), user(4), asst(5)]
  assert.deepEqual(roleTimeline(ev2, 'bob'), ['alice', 'bob'])
})

test('what the plugin saw itself beats the log for the turns it covers (the last ones)', () => {
  assert.deepEqual(mergeTurns([null, null, null, null], ['alice', 'bob']), [null, null, 'alice', 'bob'])
  assert.deepEqual(mergeTurns(['x', 'y'], []), ['x', 'y'])
  // more recorded turns than the log has: they cannot line up, so the log stays
  assert.deepEqual(mergeTurns(['x'], ['a', 'b']), ['x'])
  // switching right now: the old replies keep their roles, only the new turn is the new role
  assert.deepEqual(mergeTurns([null, null, null], ['whale', 'whale', 'qianwen']), ['whale', 'whale', 'qianwen'])
})
