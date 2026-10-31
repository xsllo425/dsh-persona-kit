import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseRole } from '../lib/roles.js'
import { normalizeCard } from '../lib/core.js'
import { createLibrary } from '../lib/store.js'
import { collectDefs } from '../lib/achievements.js'

const root = fileURLToPath(new URL('../', import.meta.url))

test('the example role is a valid role with a full card', () => {
  const role = parseRole(readFileSync(join(root, 'examples/roles/example-sage/ROLE.md'), 'utf8'), 'x')
  assert.equal(role.id, 'example-sage')
  const raw = JSON.parse(readFileSync(join(root, 'examples/roles/example-sage/card.json'), 'utf8'))
  const card = normalizeCard(raw, 'example-sage')
  assert.equal(card.levels.length, 5)
  assert.deepEqual(raw.levels.map((l) => l.name), card.levels.map((l) => l.name)) // nothing silently replaced by a default
  assert.deepEqual(card.packs, ['example-faces'])
  assert.equal(card.titles.length, 5)
  assert.ok(existsSync(join(root, 'examples/roles/example-sage', card.image)))
  assert.equal(collectDefs({ global: [], role: [] }, card.achievements).length, 1)
})

test('the example pack lists twelve faces and every file exists', () => {
  const lib = createLibrary(join(root, 'examples/meme-packs'))
  const list = lib.list(['example-faces'])
  assert.equal(list.length, 12)
  for (const m of list) assert.ok(lib.fileOf('example-faces', m.rel), m.rel)
  assert.deepEqual([...new Set(list.map((m) => m.tag))].sort(), ['angry', 'confused', 'daily', 'happy', 'sad', 'shy'])
})

test('the installer copies both and never overwrites', () => {
  const home = mkdtempSync(join(tmpdir(), 'inst-'))
  const run = () => execFileSync(process.execPath, [join(root, 'tools/install-examples.mjs')], { env: { ...process.env, DSH_HOME: home } }).toString()
  assert.match(run(), /installed: .*example-sage/)
  assert.ok(existsSync(join(home, 'meme-packs', 'example-faces', 'index.db')))
  assert.match(run(), /skip \(already there\)/)
  rmSync(home, { recursive: true, force: true })
})

test('every preset role is valid, has a full card and its picture', () => {
  for (const id of readdirSync(join(root, 'presets/roles'))) {
    const dir = join(root, 'presets/roles', id)
    const role = parseRole(readFileSync(join(dir, 'ROLE.md'), 'utf8'), id)
    assert.equal(role.id, id)
    const card = normalizeCard(JSON.parse(readFileSync(join(dir, 'card.json'), 'utf8')), id)
    assert.equal(card.levels.length, 5, id)
    assert.ok(existsSync(join(dir, card.image)), id)
  }
})

test('--presets installs the ready-made roles too', () => {
  const home = mkdtempSync(join(tmpdir(), 'inst-'))
  execFileSync(process.execPath, [join(root, 'tools/install-examples.mjs'), '--presets=whale'], { env: { ...process.env, DSH_HOME: home } })
  assert.ok(existsSync(join(home, 'roles', 'whale', 'ROLE.md')))
  assert.ok(!existsSync(join(home, 'roles', 'doubao')))
  assert.ok(existsSync(join(home, 'meme-packs', 'dafeiyu-redrawn-100', 'index.db'))) // the role's own pack comes with it
  assert.ok(!existsSync(join(home, 'meme-packs', 'doubao-chibi')))
  rmSync(home, { recursive: true, force: true })
})

test('every pack a preset role names ships with the presets and lists real files', () => {
  for (const id of readdirSync(join(root, 'presets/roles'))) {
    const card = normalizeCard(JSON.parse(readFileSync(join(root, 'presets/roles', id, 'card.json'), 'utf8')), id)
    const lib = createLibrary(join(root, 'presets/meme-packs'))
    for (const pack of card.packs) {
      const list = lib.list([pack])
      assert.ok(list.length >= 24, id + ': ' + pack)
      for (const m of list) assert.ok(lib.fileOf(pack, m.rel), pack + ' ' + m.rel)
    }
  }
})
