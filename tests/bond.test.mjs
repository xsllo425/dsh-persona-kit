import test from 'node:test'
import assert from 'node:assert/strict'
import * as bond from '../lib/bond.js'

test('titles climb with affinity', () => {
  const b = bond.emptyBond()
  assert.equal(bond.titleOf(b), '初识')
  b.turns = 40
  assert.equal(bond.titleOf(b), '熟悉')
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

test('heat is context fill, capped', () => {
  assert.equal(bond.heatOf(200_000), 20) // 200k / 1M = 20%
  assert.equal(bond.heatOf(900_000), 90)
  assert.equal(bond.heatOf('x'), 0)
})

test('normalizeBond ignores junk', () => {
  assert.deepEqual(bond.normalizeBond({ turns: 3.9, foo: 1 }), { ...bond.emptyBond(), turns: 3 })
  assert.deepEqual(bond.normalizeBond(null), bond.emptyBond())
})

test('the context reading prefers the pressure projection and never trusts a cumulative meter reading', () => {
  const service = (svc) => svc === 'sessionProjections'
    ? { stateOf: (_s, key) => (key === 'contextPressure' ? { pressureTokens: 90_000, contextWindow: 200_000 } : undefined) }
    : undefined
  const got = bond.contextTokensOf(service, { id: 's1' })
  assert.deepEqual(got, { total: 90_000, via: 'contextPressure', window: 200_000 })

  // only a meter is available: a reading larger than the window it claims is a cumulative total, not fill
  const meterOnly = (total) => (svc) => (svc === 'tokenMeter'
    ? { measure: () => ({ totalTokens: total }) }
    : { stateOf: () => ({ contextWindow: 200_000 }) })
  assert.deepEqual(bond.contextTokensOf(meterOnly(50_000), { id: 's2' }), { total: 50_000, via: 'tokenMeter', window: 200_000 })
  assert.equal(bond.contextTokensOf(meterOnly(50_000_000), { id: 's2' }).total, NaN)
  // nothing at all: NaN, never a guess
  assert.equal(bond.contextTokensOf(() => undefined, { id: 's3' }).total, NaN)
})

test('crediting a context reading stores the window with it, and a failed reading writes nothing', () => {
  const calls = []
  const store = { setTokens: (...a) => calls.push(a) }
  const service = (svc) => (svc === 'sessionProjections'
    ? { stateOf: () => ({ pressureTokens: 12_000, contextWindow: 200_000 }) }
    : undefined)
  bond.creditContext(store, service, { id: 's1' }, 'alice')
  assert.deepEqual(calls, [['s1', 12_000, 'alice', 200_000]])
  bond.creditContext(store, () => undefined, { id: 's1' }, 'alice')
  assert.equal(calls.length, 1) // an unmeasurable session is left exactly as it was
  assert.doesNotThrow(() => bond.creditContext({ setTokens() { throw new Error('disk') } }, service, { id: 's1' }, 'alice'))
})

test('each kind of bond grows in its own way', () => {
  const same = { ...bond.emptyBond(), turns: 10, stickers: 5, tasks: 4, days: 3 }
  assert.equal(bond.affinityOf(same, 'friend'), 10 + 10 + 4 + 9)
  assert.equal(bond.affinityOf(same, 'partner'), 10 + 5 + 12 + 9) // a partnership rewards getting things done
  assert.equal(bond.affinityOf(same, 'younger'), 10 + 10 + 4 + 18) // a family rewards showing up day after day
  assert.equal(bond.affinityOf(same, 'lover'), 10 + 15 + 0 + 15)
  assert.equal(bond.affinityOf(same, 'unknown'), bond.affinityOf(same, 'friend'))
})
