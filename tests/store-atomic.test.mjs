// Regression: Windows refuses to replace a file that another handle holds open (EPERM).
// The old writeJsonAtomic retried nothing and flush() swallowed the error without
// rescheduling, so one transient failure left state.json stale until the next user action.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { open } from 'node:fs/promises'

const { createStore } = await import('../lib/store.js')

const dirOf = () => mkdtempSync(join(tmpdir(), 'kit-atomic-'))

test('a reader holding the file open does not lose the write', async () => {
  if (process.platform !== 'win32') return // the EPERM replace failure is Windows-specific
  const dir = dirOf()
  const file = join(dir, 'state.json')
  writeFileSync(file, JSON.stringify({ version: 1, sessions: {} }))
  const st = createStore(file)

  // Hold a read handle across the flush, the way a concurrent reader would.
  const fh = await open(file, 'r')
  st.setLevel('s', 'alice', 4)
  st.flush()
  await fh.close()

  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.sessions.s.levels.alice, 4, 'the level reached disk despite the open handle')
  assert.ok(!existsSync(file + '.tmp'), 'no temporary file is left behind')
  rmSync(dir, { recursive: true, force: true })
})

test('a leftover temporary file from a crashed write does not block the next save', () => {
  const dir = dirOf()
  const file = join(dir, 'state.json')
  writeFileSync(file, JSON.stringify({ version: 1, sessions: {} }))
  writeFileSync(file + '.tmp', '{ stale partial write') // pretend a crash left this
  const st = createStore(file)
  st.setLevel('s', 'alice', 3)
  st.flush()
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).sessions.s.levels.alice, 3)
  assert.ok(!existsSync(file + '.tmp'), 'the stale temporary is replaced, not appended to')
  rmSync(dir, { recursive: true, force: true })
})

test('the same store can be flushed repeatedly without leaving temporaries', () => {
  const dir = dirOf()
  const file = join(dir, 'state.json')
  const st = createStore(file)
  for (let i = 1; i <= 5; i++) { st.setLevel('s', 'alice', i); st.flush() }
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).sessions.s.levels.alice, 5)
  assert.deepEqual(readdirSync(dir).filter((n) => n.includes('.tmp')), [])
  rmSync(dir, { recursive: true, force: true })
})

// An older build credited the growth of a cumulative token counter, so a real file held 189,797,436 credited tokens
// against a 198,187-token context and the bond meter read as permanently full. Loading must repair that on its own:
// a running host keeps the whole file in memory, so an outside repair script only gets overwritten again.
test('credited context that exceeds the session total is repaired on load', () => {
  const dir = dirOf()
  const file = join(dir, 'state.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    sessions: {
      bad: { tokens: 200_000, roleTokens: { whale: 189_797_436, other: 2_000_000 }, at: Date.now() },
      fine: { tokens: 10_000, roleTokens: { whale: 9_000 }, at: Date.now() },
    },
  }))
  const st = createStore(file)
  const whale = st.roleTokensOf('bad', 'whale')
  const other = st.roleTokensOf('bad', 'other')
  assert.ok(whale > 0 && other > 0, 'the credits are scaled, not deleted')
  assert.ok(whale + other <= 200_000, `the credits now fit the session total (got ${whale + other})`)
  assert.ok(whale > other, 'the proportions between roles are kept')
  assert.equal(st.roleTokensOf('fine', 'whale'), 9_000, 'a plausible reading is left alone')

  st.flush()
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.ok(saved.sessions.bad.roleTokens.whale < 200_000, 'the repaired numbers reach disk without another write')
  rmSync(dir, { recursive: true, force: true })
})

test('a store with nothing to repair does not rewrite the file on load', () => {
  const dir = dirOf()
  const file = join(dir, 'state.json')
  writeFileSync(file, JSON.stringify({ version: 1, sessions: { s: { tokens: 10, roleTokens: { a: 5 }, at: Date.now() } } }))
  const before = readFileSync(file, 'utf8')
  const st = createStore(file)
  st.flush()
  assert.equal(readFileSync(file, 'utf8'), before, 'an untouched file stays byte-for-byte the same')
  rmSync(dir, { recursive: true, force: true })
})
