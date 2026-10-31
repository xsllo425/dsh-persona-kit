import test from 'node:test'
import assert from 'node:assert/strict'
import * as bond from '../lib/bond.js'

test('titles climb with affinity and rebirth adds a suffix and a bonus', () => {
  const b = bond.emptyBond()
  assert.equal(bond.titleOf(b), '初识')
  b.turns = 40
  assert.equal(bond.titleOf(b), '熟悉')
  b.turns = 130; b.rebirths = 1 // 130 + 30 = 160
  assert.equal(bond.affinityOf(b), 160)
  assert.equal(bond.titleOf(b), '亲近·一转')
  b.rebirths = 12
  assert.match(bond.titleOf(b), /·12转$/)
})

test('role card titles replace the defaults only when there are five', () => {
  const b = { ...bond.emptyBond(), turns: 500 }
  assert.equal(bond.titleOf(b, ['a', 'b', 'c', 'd', 'e']), 'd')
  assert.equal(bond.titleOf(b, ['a', 'b']), '默契')
})

test('progress to the next title, and the top title is full', () => {
  assert.deepEqual({ ...bond.nextProgress({ ...bond.emptyBond(), turns: 20 }) }, { next: 1, fraction: 0.5, need: 20 })
  assert.equal(bond.nextProgress({ ...bond.emptyBond(), turns: 5000 }).fraction, 1)
})

test('heat is context fill, capped; rebirth is due at the trigger', () => {
  assert.equal(bond.heatOf(150_000), 50)
  assert.equal(bond.heatOf(900_000), 100)
  assert.equal(bond.heatOf('x'), 0)
  assert.equal(bond.rebirthDue(299_999), false)
  assert.equal(bond.rebirthDue(300_000), true)
})

test('normalizeBond ignores junk', () => {
  assert.deepEqual(bond.normalizeBond({ turns: 3.9, rebirths: -1, foo: 1 }), { ...bond.emptyBond(), turns: 3 })
  assert.deepEqual(bond.normalizeBond(null), bond.emptyBond())
})

test('each kind of bond grows in its own way', () => {
  const same = { ...bond.emptyBond(), turns: 10, stickers: 5, tasks: 4, days: 3, rebirths: 1 }
  assert.equal(bond.affinityOf(same, 'friend'), 10 + 10 + 4 + 9 + 30)
  assert.equal(bond.affinityOf(same, 'partner'), 10 + 5 + 12 + 9 + 40) // a partnership rewards getting things done
  assert.equal(bond.affinityOf(same, 'younger'), 10 + 10 + 4 + 18 + 30) // a family rewards showing up day after day
  assert.equal(bond.affinityOf(same, 'lover'), 10 + 15 + 0 + 15 + 30)
  assert.equal(bond.affinityOf(same, 'unknown'), bond.affinityOf(same, 'friend'))
})
