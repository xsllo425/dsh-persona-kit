import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAvatars, cleanSettings, sniff, MAX_BYTES } from '../lib/avatars.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)])
const home = mkdtempSync(join(tmpdir(), 'av-'))
test.after(() => rmSync(home, { recursive: true, force: true }))

test('settings are clamped and fall back to defaults', () => {
  assert.deepEqual(cleanSettings({}), { ai: true, user: true, name: true, size: 30, account: false, accountName: '', layout: 'top', meta: 'relation' })
  assert.equal(cleanSettings({ accountName: '  <b>我</b>\n的名字  ' }).accountName, 'b我/b的名字')
  assert.equal(cleanSettings({ accountName: 'x'.repeat(100) }).accountName.length, 40)
  assert.equal(cleanSettings({ account: true }).account, true)
  assert.equal(cleanSettings({ account: 'yes' }).account, false)
  assert.equal(cleanSettings({ layout: 'side' }).layout, 'side')
  assert.equal(cleanSettings({ layout: 'diagonal' }).layout, 'top')
  assert.equal(cleanSettings({ meta: 'both' }).meta, 'both')
  assert.equal(cleanSettings({ meta: 'x' }).meta, 'relation')
  assert.equal(cleanSettings({ size: 5 }).size, 20)
  assert.equal(cleanSettings({ size: 999 }).size, 64)
  assert.equal(cleanSettings({ size: 'x' }).size, 30)
  assert.equal(cleanSettings({ name: 'no' }).name, true)
  assert.equal(cleanSettings({ ai: false }).ai, false)
})

test('only real pictures are accepted, by their first bytes', () => {
  assert.equal(sniff(PNG), 'png')
  assert.equal(sniff(JPG), 'jpg')
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), '')
  assert.equal(sniff(Buffer.from('GIF89a' + 'x'.repeat(20))), 'gif')
  assert.equal(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])), 'webp')
  assert.equal(sniff(Buffer.alloc(3)), '')
})

test('save, replace, and reset a picture; extensions never pile up', () => {
  const a = createAvatars(home)
  assert.equal(a.fileOf('role:alice'), null)
  assert.equal(a.save('role:alice', PNG).ok, true)
  assert.match(a.fileOf('role:alice'), /alice\.png$/)
  assert.equal(a.save('role:alice', JPG).ok, true)
  assert.match(a.fileOf('role:alice'), /alice\.jpg$/)
  assert.deepEqual(readdirSync(join(home, 'avatars')).filter((f) => f.startsWith('alice')), ['alice.jpg'])
  assert.equal(a.reset('role:alice'), true)
  assert.equal(a.fileOf('role:alice'), null)
})

test('the user picture lives at user-avatar.*', () => {
  const a = createAvatars(home)
  assert.equal(a.save('user', PNG).ok, true)
  assert.ok(existsSync(join(home, 'user-avatar.png')))
})

test('bad targets, non-pictures and oversize files are refused', () => {
  const a = createAvatars(home)
  for (const t of ['role:../evil', 'role:', '../x', 'roles:a', '']) assert.equal(a.save(t, PNG).ok, false, t)
  assert.equal(a.fileOf('role:../../x'), null)
  assert.equal(a.save('user', Buffer.from('not a picture, just text....')).ok, false)
  assert.equal(a.save('user', Buffer.concat([PNG, Buffer.alloc(MAX_BYTES)])).ok, false)
  assert.equal(a.reset('role:../x'), false)
})

test('settings persist', () => {
  const a = createAvatars(home)
  a.setSettings({ size: 44, name: false })
  assert.deepEqual(createAvatars(home).settings(), { ai: true, user: true, name: false, size: 44, account: false, accountName: '', layout: 'top', meta: 'relation' })
})

test('a name that arrived in the wrong encoding never replaces the saved one', () => {
  const a = createAvatars(home)
  a.setSettings({ accountName: '小明' })
  a.setSettings({ accountName: '��色�' })
  assert.equal(a.settings().accountName, '小明')
  a.setSettings({ accountName: '新名字' })
  assert.equal(a.settings().accountName, '新名字')
})
