// dsh-persona-kit avatars: user-editable settings and picture overrides, stored under <kitHome>/.
//
//   settings.json          { ai, user, name, size }   show her avatar / show mine / show her name / size in px
//   avatars/<roleId>.<ext> a picture the user chose for one role (wins over the role card's picture)
//   user-avatar.<ext>      the user's own picture
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MIN_SIZE = 20
export const MAX_SIZE = 64
export const DEFAULT_SIZE = 30
export const MAX_BYTES = 2 * 1024 * 1024
const EXTS = ['png', 'jpg', 'webp', 'gif']

export const LAYOUTS = ['top', 'side']
export const METAS = ['relation', 'affinity', 'both', 'none']

export function cleanSettings(raw, defaults = {}) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const flag = (v, d) => (typeof v === 'boolean' ? v : d)
  const size = Math.round(Number(o.size))
  return {
    ai: flag(o.ai, defaults.ai ?? true),
    user: flag(o.user, defaults.user ?? true),
    name: flag(o.name, defaults.name ?? true),
    size: Number.isFinite(size) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)) : (defaults.size ?? DEFAULT_SIZE),
    // replace the account name and picture in the sidebar's bottom-left account button with my name and my picture
    account: flag(o.account, defaults.account ?? false),
    accountName: typeof o.accountName === 'string' && !o.accountName.includes('�') ? o.accountName.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) : (typeof defaults.accountName === 'string' ? defaults.accountName : ''),
    layout: LAYOUTS.includes(o.layout) ? o.layout : (LAYOUTS.includes(defaults.layout) ? defaults.layout : 'top'),
    meta: METAS.includes(o.meta) ? o.meta : (METAS.includes(defaults.meta) ? defaults.meta : 'relation'),
  }
}

/** The image type from its first bytes, or '' when it is not a picture we accept. */
export function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return ''
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif'
  return ''
}

export function createAvatars(home, defaults = {}) {
  const settingsFile = join(home, 'settings.json')
  const dir = join(home, 'avatars')
  const read = () => {
    let o = {}
    try { o = JSON.parse(readFileSync(settingsFile, 'utf8').replace(/^﻿/, '')) } catch {}
    return cleanSettings(o, defaults)
  }
  const find = (base) => EXTS.map((e) => `${base}.${e}`).find((f) => existsSync(f)) || null
  const baseOf = (target) => (target === 'user' ? join(home, 'user-avatar') : join(dir, target.slice(5)))
  const validTarget = (t) => t === 'user' || /^role:[\w.-]{1,80}$/.test(t)
  return {
    settings: read,
    setSettings(patch) {
      const p = patch && typeof patch === 'object' ? { ...patch } : {}
      // text that arrived in the wrong encoding is refused outright; the saved value stays
      if (typeof p.accountName === 'string' && p.accountName.includes('�')) delete p.accountName
      const next = cleanSettings({ ...read(), ...p }, defaults)
      mkdirSync(home, { recursive: true })
      writeFileSync(`${settingsFile}.tmp`, JSON.stringify(next, null, 2) + '\n')
      renameSync(`${settingsFile}.tmp`, settingsFile)
      return next
    },
    validTarget,
    /** The user's chosen picture for a target ('user' or 'role:<id>'), or null. */
    fileOf: (target) => (validTarget(target) ? find(baseOf(target)) : null),
    save(target, buf) {
      if (!validTarget(target)) return { ok: false, error: 'bad target' }
      if (!Buffer.isBuffer(buf) || buf.length === 0) return { ok: false, error: 'empty' }
      if (buf.length > MAX_BYTES) return { ok: false, error: 'too large (max 2 MB)' }
      const ext = sniff(buf)
      if (!ext) return { ok: false, error: 'not a png/jpeg/webp/gif picture' }
      const base = baseOf(target)
      mkdirSync(join(base, '..'), { recursive: true })
      for (const e of EXTS) { try { unlinkSync(`${base}.${e}`) } catch {} }
      writeFileSync(`${base}.${ext}.tmp`, buf)
      renameSync(`${base}.${ext}.tmp`, `${base}.${ext}`)
      return { ok: true, ext }
    },
    reset(target) {
      if (!validTarget(target)) return false
      const base = baseOf(target)
      for (const e of EXTS) { try { unlinkSync(`${base}.${e}`) } catch {} }
      return true
    },
  }
}
