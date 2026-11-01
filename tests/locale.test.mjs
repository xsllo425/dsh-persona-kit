import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// locale/*.json is the package's own name and description, read by tools that list plugins.
const read = (name) => JSON.parse(readFileSync(new URL(`../locale/${name}.json`, import.meta.url), 'utf8'))
const zh = read('zh')
const en = read('en')

test('both locale files parse and carry the same top-level keys', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
})

test('meta.title and meta.description are non-empty strings in both languages', () => {
  for (const [lang, doc] of [['zh', zh], ['en', en]]) {
    assert.equal(typeof doc.meta?.title, 'string', `${lang}: title missing`)
    assert.ok(doc.meta.title.trim().length > 0, `${lang}: title is empty`)
    assert.equal(typeof doc.meta?.description, 'string', `${lang}: description missing`)
    assert.ok(doc.meta.description.trim().length > 0, `${lang}: description is empty`)
  }
})

test('the two languages actually differ', () => {
  assert.notEqual(zh.meta.title, en.meta.title)
  assert.notEqual(zh.meta.description, en.meta.description)
})

test('the published package ships the locale folder', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes('locale'), 'files[] must list "locale", or npm pack drops it')
  assert.ok(pkg.exports?.['./locale/*.json'], 'the locale files must stay importable through exports')
})
