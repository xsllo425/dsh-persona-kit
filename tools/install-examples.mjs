// Copies the example role and sticker pack into your DSH home, without overwriting anything that is already there.
//   node tools/install-examples.mjs [--presets]   (DSH_HOME or ~/.dsh)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const home = process.env.DSH_HOME || join(homedir(), '.dsh')
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const src = here('../examples/')
const jobs = [
  [src, 'roles/example-sage', join(home, 'roles', 'example-sage')],
  [src, 'meme-packs/example-faces', join(home, 'meme-packs', 'example-faces')],
]
// ready-made roles: pass --presets to install them too (or --presets=id,id for some)
const flag = process.argv.find((a) => a.startsWith('--presets'))
if (flag) {
  const pre = here('../presets/')
  const want = flag.includes('=') ? flag.split('=')[1].split(',') : readdirSync(join(pre, 'roles'))
  const packs = new Set()
  for (const id of want) {
    jobs.push([pre, 'roles/' + id, join(home, 'roles', id)])
    try { for (const p of JSON.parse(readFileSync(join(pre, 'roles', id, 'card.json'), 'utf8')).packs || []) packs.add(p) } catch {}
  }
  for (const p of packs) if (existsSync(join(pre, 'meme-packs', p))) jobs.push([pre, 'meme-packs/' + p, join(home, 'meme-packs', p)])
}
for (const [base, from, to] of jobs) {
  if (existsSync(to)) { console.log(`skip (already there): ${to}`); continue }
  mkdirSync(join(to, '..'), { recursive: true })
  cpSync(join(base, from), to, { recursive: true })
  console.log(`installed: ${to}`)
}
console.log('Done. Restart DeepSeek Harness, open a chat, switch role with /role example-sage.')
