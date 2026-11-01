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
