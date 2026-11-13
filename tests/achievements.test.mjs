import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as A from '../lib/achievements.js'

test('definitions are validated: scope decides which metrics are allowed', () => {
  assert.ok(A.normalizeDef({ id: 'a', name: 'n', metric: 'turnsTotal', gte: 1 }, 'global'))
  assert.equal(A.normalizeDef({ id: 'a', name: 'n', metric: 'turns', gte: 1 }, 'global'), null)
  assert.ok(A.normalizeDef({ id: 'a', name: 'n', metric: 'turns', gte: 5 }, 'role'))
  assert.equal(A.normalizeDef({ id: 'bad id', name: 'n', metric: 'turns', gte: 1 }, 'role'), null)
  assert.equal(A.normalizeDef({ id: 'a', name: 'n', metric: 'turns', gte: 0 }, 'role'), null)
  assert.equal(A.normalizeDef({ id: 'a', name: '', metric: 'turns', gte: 1 }, 'role'), null)
  assert.equal(A.normalizeDef(null, 'role'), null)
})

test('a phrase achievement needs a valid pattern', () => {
  assert.equal(A.normalizeDef({ id: 'p', name: 'n', metric: 'phrase', gte: 3, pattern: '封号' }, 'role').pattern, '封号')
  assert.equal(A.normalizeDef({ id: 'p', name: 'n', metric: 'phrase', gte: 3, pattern: '(' }, 'role'), null)
  assert.equal(A.normalizeDef({ id: 'p', name: 'n', metric: 'phrase', gte: 3 }, 'role'), null)
})

test('card achievements are added after the defaults, and duplicates keep the first', () => {
  const defs = A.collectDefs({ global: [{ id: 'g', name: 'G', metric: 'turnsTotal', gte: 1 }], role: [{ id: 'r', name: 'R', metric: 'turns', gte: 1 }] },
    [{ id: 'r', name: 'dup', metric: 'turns', gte: 9 }, { id: 'mine', name: 'M', metric: 'phrase', gte: 2, pattern: 'x' }, { id: 'junk' }])
  assert.deepEqual(defs.map((d) => `${d.scope}:${d.id}`), ['global:g', 'role:r', 'role:mine'])
  assert.equal(defs.find((d) => d.id === 'r').name, 'R')
})

test('the shipped defaults are all valid and have unique ids', () => {
  const raw = JSON.parse(readFileSync(new URL('../defaults/achievements.json', import.meta.url), 'utf8'))
  const defs = A.collectDefs(raw)
  assert.equal(defs.length, raw.global.length + raw.role.length)
  assert.equal(new Set(defs.map((d) => d.scope + d.id)).size, defs.length)
  assert.equal(defs.length, 34) // the catalog size the panel and the tests agree on
  assert.ok(defs.filter((d) => d.hidden).length > 0)
})

test('series: a known one is kept, anything else falls back by scope', () => {
  assert.equal(A.normalizeDef({ id: 'a', name: 'n', metric: 'turnsTotal', gte: 1, series: 'day' }, 'global').series, 'day')
  assert.equal(A.normalizeDef({ id: 'a', name: 'n', metric: 'turnsTotal', gte: 1, series: 'nope' }, 'global').series, 'misc')
  assert.equal(A.normalizeDef({ id: 'a', name: 'n', metric: 'turnsTotal', gte: 1 }, 'global').series, 'misc')
  assert.equal(A.normalizeDef({ id: 'a', name: 'n', metric: 'turns', gte: 1 }, 'role').series, 'role')
  assert.equal(A.normalizeDef({ id: 'a', name: 'n', metric: 'turns', gte: 1, series: 'chat' }, 'role').series, 'chat')
})

test('hidden is opt-in, and never leaks into the value counting', () => {
  assert.equal(A.normalizeDef({ id: 'h', name: 'n', metric: 'turnsTotal', gte: 1, hidden: true }, 'global').hidden, true)
  assert.equal(A.normalizeDef({ id: 'h', name: 'n', metric: 'turnsTotal', gte: 1 }, 'global').hidden, false)
  assert.equal(A.normalizeDef({ id: 'h', name: 'n', metric: 'turnsTotal', gte: 1, hidden: 'yes' }, 'global').hidden, false)
})

test('the current streak is the run still alive today, not the longest one', () => {
  const d = ['2026-10-01', '2026-10-02', '2026-10-10']
  assert.equal(A.currentStreak(d, '2026-10-10'), 1) // came back today: a new run of one
  assert.equal(A.currentStreak(d, '2026-10-11'), 1) // yesterday still counts until today is missed
  assert.equal(A.currentStreak(d, '2026-10-12'), 0) // a whole day missed
  assert.equal(A.currentStreak(['2026-10-10', '2026-10-11'], '2026-10-11'), 2)
  assert.equal(A.currentStreak([], '2026-10-11'), 0)
  assert.equal(A.currentStreak(['2026-10-10'], ''), 0)
  assert.equal(A.currentStreak(['2026-10-10'], 'not-a-day'), 0)
})

test('groups keep the panel order, drop empty ones, and count what was earned', () => {
  const defs = A.collectDefs({ global: [
    { id: 'b', name: 'B', metric: 'turnsTotal', gte: 1, series: 'day' },
    { id: 'a', name: 'A', metric: 'turnsTotal', gte: 1, series: 'chat' },
    { id: 'c', name: 'C', metric: 'turnsTotal', gte: 1, series: 'day' },
  ] })
  const groups = A.groupDefs(defs)
  assert.deepEqual(groups.map((g) => g.id), ['chat', 'day'])
  assert.deepEqual(groups[1].defs.map((d) => d.id), ['b', 'c'])
  const stats = A.groupStats(defs, (d) => d.id === 'b')
  assert.deepEqual(stats.map((s) => `${s.id}:${s.got}/${s.total}`), ['chat:0/1', 'day:1/2'])
  assert.equal(typeof stats[0].name, 'string')
})

test('streak counts consecutive local days only', () => {
  assert.equal(A.longestStreak([]), 0)
  assert.equal(A.longestStreak(['2026-10-30', '2026-10-31', '2026-11-01']), 3)
  assert.equal(A.longestStreak(['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-04']), 2)
})

test('keys: global ones are plain, role ones carry the role', () => {
  assert.equal(A.keyOf({ scope: 'global', id: 'a' }, 'x'), 'a')
  assert.equal(A.keyOf({ scope: 'role', id: 'a' }, 'x'), 'a@x')
})
