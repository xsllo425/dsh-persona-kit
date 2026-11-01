// lib/atomic-write.js: the shared replace-in-place writer.
//
// The behaviour that matters on Windows: a reader holding the target open makes
// rename fail with EPERM, and the old code dropped the update on the floor.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { open } from 'node:fs/promises'

const { writeFileAtomic } = await import('../lib/atomic-write.js')

const dirOf = () => mkdtempSync(join(tmpdir(), 'kit-aw-'))
const temporaries = (dir) => readdirSync(dir).filter((n) => n.includes('.tmp'))

test('writes a new file and creates missing directories', () => {
  const dir = dirOf()
  const file = join(dir, 'nested', 'deeper', 'state.json')
  writeFileAtomic(file, '{"ok":true}')
  assert.equal(readFileSync(file, 'utf8'), '{"ok":true}')
  assert.deepEqual(temporaries(join(dir, 'nested', 'deeper')), [])
  rmSync(dir, { recursive: true, force: true })
})

test('replaces an existing file in place', () => {
  const dir = dirOf()
  const file = join(dir, 'state.json')
  writeFileSync(file, 'old')
  writeFileAtomic(file, 'new')
  assert.equal(readFileSync(file, 'utf8'), 'new')
  rmSync(dir, { recursive: true, force: true })
})

test('a stale .tmp from a crashed writer is overwritten, not appended to', () => {
  const dir = dirOf()
  const file = join(dir, 'state.json')
  writeFileSync(file + '.tmp', 'half-written garbage')
  writeFileAtomic(file, 'fresh')
  assert.equal(readFileSync(file, 'utf8'), 'fresh')
  assert.deepEqual(temporaries(dir), [])
  rmSync(dir, { recursive: true, force: true })
})

test('an open reader does not cost us the write', async () => {
  if (process.platform !== 'win32') return // EPERM on replace is Windows behaviour
  const dir = dirOf()
  const file = join(dir, 'state.json')
  writeFileSync(file, 'old')
  const fh = await open(file, 'r')
  writeFileAtomic(file, 'new-while-open')
  await fh.close()
  assert.equal(readFileSync(file, 'utf8'), 'new-while-open')
  assert.deepEqual(temporaries(dir), [])
  rmSync(dir, { recursive: true, force: true })
})

test('repeated writes leave exactly one file and no temporaries', () => {
  const dir = dirOf()
  const file = join(dir, 'state.json')
  for (let i = 0; i < 25; i++) writeFileAtomic(file, 'v' + i)
  assert.equal(readFileSync(file, 'utf8'), 'v24')
  assert.deepEqual(temporaries(dir), [])
  assert.ok(!existsSync(file + '.tmp'))
  rmSync(dir, { recursive: true, force: true })
})
