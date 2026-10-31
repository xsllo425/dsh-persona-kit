import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const CJK = /[㐀-鿿]/

const dictionary = () => {
  const m = src.match(/var EN = (\{[\s\S]*?\});\r?\n\s*function L\(/)
  assert.ok(m, 'the dictionary is in the file')
  return JSON.parse(m[1])
}
const usedKeys = () => new Set([...src.matchAll(/\bL\("((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse('"' + x[1] + '"')))

test('every Chinese UI text has an English one', () => {
  const EN = dictionary()
  const missing = [...usedKeys()].filter((k) => EN[k] === undefined)
  assert.deepEqual(missing, [])
})

test('no English entry is left over after its text was removed', () => {
  const used = usedKeys()
  const stale = Object.keys(dictionary()).filter((k) => !used.has(k))
  assert.deepEqual(stale, [])
})

test('placeholders agree on both sides', () => {
  const ph = (t) => [...t.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',')
  for (const [zh, en] of Object.entries(dictionary())) assert.equal(ph(en), ph(zh), `placeholders of "${zh}"`)
})

test('no visible Chinese is left outside L(...)', () => {
  const stripped = src
    .replace(/var EN = \{[\s\S]*?\};\r?\n/, '')
    .replace(/\bL\("(?:[^"\\]|\\.)*"/g, 'L(""')
    .split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  const left = [...stripped.matchAll(/["'`][^"'`\n]*[㐀-鿿][^"'`\n]*["'`]/g)].map((x) => x[0])
    // allowed: the sticker marker dsh-meme uses, paren()'s own full-width brackets, and the two bilingual slot labels
    .filter((t) => !t.includes('表情[') && !t.includes('（') && !t.includes(' / '))
  assert.deepEqual(left, [])
})

test('the English side does not carry Chinese text', () => {
  for (const [zh, en] of Object.entries(dictionary())) assert.doesNotMatch(en, CJK, zh)
})
