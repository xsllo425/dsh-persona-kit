import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const home = mkdtempSync(join(tmpdir(), 'kit-'))
process.env.DSH_HOME = home
const { createKit, readConfig } = await import('../lib/index.js')
const core = await import('../lib/core.js')

// ---- fixture: two roles, two packs with deliberately identical captions ----
const rolesDir = join(home, 'roles')
const packsDir = join(home, 'meme-packs')
for (const [role, pack] of [['alice', 'alice-pack'], ['bob', 'bob-pack']]) {
  mkdirSync(join(rolesDir, role), { recursive: true })
  writeFileSync(join(rolesDir, role, 'ROLE.md'), `---\nid: ${role}\nname: ${role.toUpperCase()}\n---\nbody`)
  writeFileSync(join(rolesDir, role, 'card.json'), JSON.stringify({ packs: [pack], levels: [{ name: 'L1' }] }))
  mkdirSync(join(packsDir, pack, 'memes', 'happy'), { recursive: true })
  mkdirSync(join(packsDir, pack, 'memes', 'sad'), { recursive: true })
  const db = new DatabaseSync(join(packsDir, pack, 'index.db'))
  db.exec('CREATE TABLE memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
  for (const [rel, tag, kw] of [['memes/happy/1.png', 'happy', '开心 完成'], ['memes/sad/1.png', 'sad', '抱歉 失败']]) {
    writeFileSync(join(packsDir, pack, rel), 'png')
    db.prepare('INSERT INTO memes VALUES (?,?,?,?,?,?,?)').run(rel, tag, '1.png', 'same caption', kw, 0, 0)
  }
  db.close()
}
mkdirSync(join(home, 'persona-switcher'), { recursive: true })
writeFileSync(join(home, 'persona-switcher', 'sessions.json'), JSON.stringify({ sessions: { s1: { role: 'alice' }, s2: { role: 'bob' }, s3: {} } }))

const mk = (extra = {}) => createKit({ config: { ...readConfig(), language: 'zh', countSessions: '.', ...extra }, rnd: () => 0 })

test('level text: role-specific name, default fill, clamp', () => {
  const kit = mk()
  assert.match(kit.promptFor('s1'), /说话强度：日常（3\/5）/)
  kit.setLevel('s1', 1)
  assert.match(kit.promptFor('s1'), /说话强度：L1（1\/5）/)
  assert.match(kit.promptFor('s1'), /不玩梗/)
  kit.setLevel('s1', 99)
  assert.match(kit.promptFor('s1'), /满格（5\/5）/)
  assert.equal(kit.promptFor('s3'), '') // no role: no section
  assert.equal(kit.promptFor('unknown'), '')
})

test('new session starts at the role\'s last chosen level', () => {
  const kit = mk()
  kit.setLevel('s1', 4)
  assert.equal(kit.session('s1').level, 4)
  assert.equal(kit.store.levelOf('fresh-session', 'alice'), 4)
  assert.equal(kit.store.levelOf('fresh-session', 'bob'), 3)
})

test('level 1 never shows a sticker, level 5 shows one for every plain reply', () => {
  const kit = mk()
  kit.setLevel('s1', 1)
  for (let i = 0; i < 6; i++) assert.equal(kit.pick('s1', { text: '好的，完成了' }).url, '')
  kit.setLevel('s1', 5)
  for (let i = 0; i < 4; i++) assert.match(kit.pick('s1', { text: '好的，完成了！' }).url, /sticker\/alice-pack\//)
})

test('code/table replies and long replies are skipped', () => {
  const kit = mk()
  kit.setLevel('s1', 5)
  assert.equal(kit.pick('s1', { text: 'x', plain: true }).why, 'code-or-table')
  assert.equal(kit.pick('s1', { text: 'x'.repeat(2000) }).why, 'long')
  assert.equal(kit.pick('s1', { text: '   ' }).why, 'empty')
})

test('middle level follows its cadence (every 4th)', () => {
  const kit = mk()
  kit.setLevel('s1', 3)
  const shown = []
  for (let i = 0; i < 8; i++) shown.push(kit.pick('s1', { text: '好的' }).url !== '')
  assert.deepEqual(shown, [false, false, false, true, false, false, false, true])
})

test('a role only ever gets its own pack, even when captions are identical', () => {
  const kit = mk()
  kit.setLevel('s1', 5); kit.setLevel('s2', 5)
  for (let i = 0; i < 6; i++) {
    assert.match(kit.pick('s1', { text: '完成！' + i }).url, /alice-pack/)
    assert.match(kit.pick('s2', { text: '完成！' + i }).url, /bob-pack/)
  }
})

test('model-queued sticker wins once, and not at level 1', () => {
  const kit = mk()
  kit.setLevel('s1', 2)
  const q = kit.queue('s1', { mood: 'sad' })
  assert.equal(q.ok, true)
  const r = kit.pick('s1', { text: '随便说点什么' })
  assert.equal(r.why, 'model')
  assert.match(r.url, /memes\/sad\/1\.png/)
  assert.notEqual(kit.pick('s1', { text: '随便' }).why, 'model') // consumed
  kit.setLevel('s1', 1)
  assert.equal(kit.queue('s1', {}).ok, false)
})

test('no role / no pack', () => {
  const kit = mk()
  assert.equal(kit.pick('s3', { text: 'hi' }).why, 'no-role')
  assert.equal(kit.queue('s3', {}).ok, false)
})

test('previewing candidates never disturbs a sticker the model already queued', () => {
  const kit = mk()
  kit.setLevel('s1', 2)
  // queue one for real, then look around three times
  assert.equal(kit.queue('s1', { mood: 'sad' }).ok, true)
  for (let i = 0; i < 3; i++) {
    const p = kit.preview('s1', { mood: 'sad' })
    assert.equal(p.ok, true)
    assert.ok(Array.isArray(p.memes))
    assert.ok(p.memes.length > 0)
    // a preview offers candidates and carries no absolute path
    assert.equal(p.memes[0].path, undefined)
    assert.ok(p.memes.every((m) => typeof m.id === 'string' && m.id.includes('/')))
  }
  // the queued sticker is still the one the turn draws, and it is drawn exactly once
  const r = kit.pick('s1', { text: '随便说点什么' })
  assert.equal(r.why, 'model')
  assert.match(r.url, /memes\/sad\/1\.png/)
  assert.notEqual(kit.pick('s1', { text: '随便' }).why, 'model')
})

test('a preview without a queued sticker leaves nothing behind for the next turn', () => {
  const kit = mk()
  kit.setLevel('s1', 2)
  const p = kit.preview('s1', { query: '开心' })
  assert.equal(p.ok, true)
  // previewing is not sending: the turn's own decision stands, unforced by the preview
  assert.notEqual(kit.pick('s1', { text: '完成任务了' }).why, 'model')
})

test('preview can be limited and can name one pack', () => {
  const kit = mk()
  kit.setLevel('s1', 2)
  assert.equal(kit.preview('s1', { limit: 1 }).memes.length, 1)
  assert.equal(kit.preview('s1', { limit: 0 }).memes.length, 2)      // not a positive number: the default, and there are only two
  assert.equal(kit.preview('s1', { limit: 999 }).memes.length, 2)     // clamped down; there are only two
  const named = kit.preview('s1', { packId: 'bob-pack' })
  assert.ok(named.memes.every((m) => String(m.id).startsWith('bob-pack/')))
  // an unknown pack falls back to the role's own packs instead of returning nothing
  assert.ok(kit.preview('s1', { packId: 'no-such-pack' }).memes.length > 0)
})

test('a preview on a session without a role says why, and sends nothing', () => {
  const kit = mk()
  const p = kit.preview('s3', {})
  assert.equal(p.ok, false)
  assert.deepEqual(p.memes, [])
})

test('send_sticker can draw from one named pack', () => {
  const kit = mk()
  kit.setLevel('s2', 2)
  const q = kit.queue('s2', { packId: 'alice-pack' })
  assert.equal(q.ok, true)
  assert.match(kit.pick('s2', { text: 'x' }).url, /alice-pack\//)
})

test('sticker files are served only from the pack index', () => {
  const kit = mk()
  assert.ok(kit.library.fileOf('alice-pack', 'memes/happy/1.png'))
  assert.equal(kit.library.fileOf('alice-pack', '../bob-pack/memes/happy/1.png'), null)
  assert.equal(kit.library.fileOf('..', 'index.db'), null)
  assert.equal(kit.library.fileOf('alice-pack', 'index.db'), null)
})

test('core: emotion and pick', () => {
  assert.equal(core.emotionOf('对不起，失败了'), 'sad')
  const set = [{ id: 'a', tag: 'happy', keywords: '开心' }, { id: 'b', tag: 'sad', keywords: '抱歉' }]
  assert.equal(core.pickSticker(set, '抱歉', [], () => 0).id, 'b')
  assert.equal(core.pickSticker([], 'x'), null)
})

test.after(() => rmSync(home, { recursive: true, force: true }))

test('role list: only roles with a card, in card order', () => {
  const kit = mk()
  assert.deepEqual(kit.cards.list().map((c) => c.id), ['alice', 'bob'])
})

test('bond: user turns, stickers and rebirth accumulate per role, not per session', () => {
  const kit = mk()
  const before = kit.store.roleStatsOf('alice').turns
  kit.userTurn('s1'); kit.userTurn('s1')
  assert.equal(kit.store.roleStatsOf('alice').turns, before + 2)
  assert.equal(kit.userTurn('s3'), '') // no role: nothing counted
  const sess = kit.store.roleStatsOf('alice').sessions
  kit.userTurn('s1')
  assert.equal(kit.store.roleStatsOf('alice').sessions, sess) // same session is counted once
  assert.equal(kit.rebirth('s1'), 'alice')
  assert.equal(kit.store.roleStatsOf('alice').rebirths, 1)
  assert.equal(kit.store.roleStatsOf('bob').rebirths, 0)
})

test('bond: the session view carries title, heat and the rebirth flag; the prompt carries only the title', () => {
  const kit = mk({ triggerTokens: 1000 })
  kit.store.setTokens('s1', 1200, 'alice')
  const v = kit.session('s1')
  assert.equal(v.bond.heat, 100)
  assert.equal(v.bond.rebirthDue, true)
  assert.ok(v.bond.title)
  const text = kit.promptFor('s1')
  assert.match(text, /目前的关系：/)
  assert.doesNotMatch(text, /\d+\s*点|affinity|好感值/)
  assert.equal(kit.stats().length, 2)
})

test('track and nickname: saved per role, change the prompt, reject unknown tracks', () => {
  const kit = mk()
  assert.equal(kit.session('s1').bond.track, 'friend')
  kit.setBond('s1', { track: 'younger', nickname: '哥哥' })
  const text = kit.promptFor('s1')
  assert.match(text, /她是妹妹/)
  assert.match(text, /称呼对方为“哥哥”/)
  assert.equal(kit.session('s1').bond.track, 'younger')
  assert.equal(kit.session('s2').bond.track, 'friend') // another role is untouched
  kit.setBond('s1', { track: 'not-a-track' })
  assert.equal(kit.session('s1').bond.track, 'younger')
  assert.equal(kit.setBond('s3', { track: 'lover' }), null) // no role, nothing to set
})

test('carry: a reborn session remembers which role to start as, once', () => {
  const kit = mk()
  kit.store.setCarry('child1', 'bob')
  assert.equal(kit.session('child1').carryRole, 'bob')
  kit.store.clearCarry('child1')
  assert.equal(kit.session('child1').carryRole, '')
})

test('switching role inside one session keeps level, track, nickname and bond apart', () => {
  const kit = mk()
  const sid = 'swap'
  // she is "alice" first
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions[sid] = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.setLevel(sid, 5)
  kit.setBond(sid, { track: 'lover', nickname: '宝贝' })
  kit.userTurn(sid); kit.userTurn(sid)
  const aliceTurns = kit.store.roleStatsOf('alice').turns
  // now the same session switches to "bob"
  sessions.sessions[sid] = { role: 'bob' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  const v = kit.session(sid)
  assert.equal(v.roleId, 'bob')
  assert.notEqual(v.level, 5)
  assert.equal(v.bond.track, 'friend')
  assert.equal(v.bond.nickname, '')
  const bobBefore = kit.store.roleStatsOf('bob').turns
  kit.userTurn(sid)
  assert.equal(kit.store.roleStatsOf('bob').turns, bobBefore + 1)
  assert.equal(kit.store.roleStatsOf('alice').turns, aliceTurns)
  assert.doesNotMatch(kit.promptFor(sid), /恋人|宝贝/)
  // and back again: alice's own settings are still there
  sessions.sessions[sid] = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  assert.equal(kit.session(sid).level, 5)
  assert.equal(kit.session(sid).bond.track, 'lover')
})

test('a sticker queued under one role is never shown under another', () => {
  const kit = mk()
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.q = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.setLevel('q', 3)
  assert.equal(kit.queue('q', { mood: 'sad' }).ok, true)
  sessions.sessions.q = { role: 'bob' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  const r = kit.pick('q', { text: '随便' })
  assert.notEqual(r.why, 'model')
  if (r.url) assert.match(r.url, /bob-pack/)
})

test('a picture the user chose for a role beats the card picture, and the session reports the settings', () => {
  const kit = mk()
  assert.equal(kit.roleAvatarFile('alice'), null) // fixture cards have no picture
  kit.avatars.save('role:alice', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(40)]))
  assert.match(kit.roleAvatarFile('alice'), /alice\.png$/)
  const v = kit.session('s1')
  assert.match(v.avatar, /kind=avatar/)
  assert.equal(v.avatarSettings.size, 30)
  kit.avatars.reset('role:alice')
  assert.equal(kit.session('s1').avatar, '')
})

test('heat is credited to the role that was speaking; the session total still drives the rebirth', () => {
  const kit = mk({ triggerTokens: 1000 })
  kit.store.setTokens('h1', 300, 'alice')
  kit.store.setTokens('h1', 700, 'bob') // 400 more, while bob spoke
  kit.store.setTokens('h1', 800, 'alice') // 100 more
  assert.equal(kit.store.roleTokensOf('h1', 'alice'), 400)
  assert.equal(kit.store.roleTokensOf('h1', 'bob'), 400)
  assert.equal(kit.store.tokensOf('h1'), 800)
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.h1 = { role: 'bob' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  const b = kit.session('h1').bond
  assert.equal(b.heat, 40) // bob's own share
  assert.equal(b.sessionHeat, 80) // the whole context
  assert.equal(b.rebirthDue, false)
  kit.store.setTokens('h1', 200, 'bob') // compaction: the total can shrink, nothing is credited
  assert.equal(kit.store.roleTokensOf('h1', 'bob'), 400)
})

test('each relationship track keeps its own history; switching never erases or mixes', () => {
  const kit = mk()
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.tr = { role: 'bob' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  const base = kit.session('tr').bond.affinity
  for (let i = 0; i < 20; i++) kit.userTurn('tr') // 20 turns as friends
  const friendAff = kit.session('tr').bond.affinity
  assert.equal(friendAff, base + 20 + 3) // 20 turns plus the first day (3 for a friendship)
  kit.setBond('tr', { track: 'lover' })
  const lover = kit.session('tr').bond
  assert.equal(lover.affinity, 0) // a new relationship starts from nothing
  assert.equal(lover.metric, '心意')
  assert.equal(lover.title, '初见')
  assert.equal(lover.others.length, 1)
  assert.equal(lover.others[0].id, 'friend')
  assert.equal(lover.others[0].affinity, friendAff)
  kit.userTurn('tr')
  assert.ok(kit.session('tr').bond.affinity > 0)
  kit.setBond('tr', { track: 'friend' })
  assert.equal(kit.session('tr').bond.affinity, friendAff) // friend progress untouched by the lover turns
  assert.equal(kit.session('tr').bond.metric, '友情')
})

test('days count once per local day, per track; tasks follow the track weights', () => {
  let t = new Date('2026-11-01T10:00:00').getTime()
  const kit = createKit({ config: { ...readConfig(), language: 'zh', countSessions: '.' }, now: () => t, rnd: () => 0 })
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.dy = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.setBond('dy', { track: 'partner' })
  kit.userTurn('dy'); kit.userTurn('dy')
  assert.equal(kit.store.bondOf('alice', 'partner').days, 1)
  t += 24 * 3600 * 1000
  kit.userTurn('dy')
  assert.equal(kit.store.bondOf('alice', 'partner').days, 2)
  kit.store.recordTask('alice')
  assert.equal(kit.session('dy').bond.tasks, 1)
  assert.ok(kit.session('dy').bond.affinity >= 3 + 3 * 2 + 3) // 3 turns + 2 days*3 + a task*3
})

test('numbers from before tracks existed go to the track the role was on', () => {
  const kit = mk()
  // a role that already had old-style totals and a non-default track
  const snap = kit.store.snapshot()
  snap.roles.legacy = { turns: 50, stickers: 5, rebirths: 1, sessions: 3 }
  snap.roleSettings.legacy = { track: 'younger', nickname: '' }
  const b = kit.store.bondOf('legacy')
  assert.equal(b.turns, 50)
  assert.equal(b.rebirths, 1)
  assert.equal(kit.store.bondOf('legacy', 'friend').turns, 0)
})

test('achievements: real events unlock them once, the panel lists progress, and "seen" clears the news', () => {
  const kit = mk()
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.ac = { role: 'bob' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  const had = new Set(Object.keys(kit.store.unlocked()))
  kit.userTurn('ac')
  const fresh = kit.freshAchievements().map((a) => a.id)
  assert.ok(fresh.includes('first-words'))
  assert.ok(!kit.checkAchievements('bob').includes('first-words')) // never unlocked twice
  const list = kit.achievementList('bob')
  const g = list.find((x) => x.id === 'chat-50')
  assert.equal(g.unlocked, false)
  assert.ok(g.value >= 1 && g.gte === 50)
  kit.store.markSeen(kit.freshAchievements().map((a) => a.key))
  assert.equal(kit.freshAchievements().length, 0)
  assert.ok(had.size <= Object.keys(kit.store.unlocked()).length)
})

test('achievements: a turn that used tools counts as a thing done, credited to the role that did it', () => {
  const kit = mk()
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.tk = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  const before = kit.store.roleStatsOf('alice').tasks
  const calls = kit.store.statsOf().toolCalls
  kit.userTurn('tk')
  kit.toolCalled('tk', 'read_file'); kit.toolCalled('tk', 'edit_file')
  kit.userTurn('tk') // the next message closes the previous turn
  assert.equal(kit.store.roleStatsOf('alice').tasks, before + 1) // two tool calls, one thing done
  assert.equal(kit.store.statsOf().toolCalls, calls + 2)
  kit.userTurn('tk') // no tools in that turn
  assert.equal(kit.store.roleStatsOf('alice').tasks, before + 1)
})

test('achievements: a role card can count a phrase in her replies', () => {
  const kit = mk()
  const fs = { writeFileSync }
  const cardFile = join(kit.config.rolesDir, 'alice', 'card.json')
  const card = JSON.parse(readFileSync(cardFile, 'utf8'))
  card.achievements = [{ id: 'say-hi', name: '打招呼', desc: '她说了三次你好', metric: 'phrase', gte: 3, pattern: '你好' }]
  fs.writeFileSync(cardFile, JSON.stringify(card))
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.ph = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.setLevel('ph', 1)
  kit.pick('ph', { text: '你好呀' }); kit.pick('ph', { text: '你好，再见' })
  assert.equal(kit.store.unlocked()['say-hi@alice'], undefined)
  kit.pick('ph', { text: '又是你好' })
  assert.ok(kit.store.unlocked()['say-hi@alice'])
  assert.equal(kit.achievementList('alice').find((x) => x.id === 'say-hi').unlocked, true)
  assert.equal(kit.achievementList('bob').find((x) => x.id === 'say-hi'), undefined) // role achievements stay with their role
})

test('achievements: a hidden badge never sends its condition before it is earned', () => {
  const kit = mk()
  const hidden = kit.achievementList('').find((x) => x.id === 'secret-night')
  assert.ok(hidden)
  assert.equal(hidden.hidden, true)
  assert.equal(hidden.unlocked, false)
  assert.equal(hidden.desc, '') // masked on the server: the network answer carries nothing either
  assert.equal(hidden.gte, 0)
  assert.equal(hidden.value, 0)
  const open = kit.achievementList('').find((x) => x.id === 'chat-1000')
  assert.ok(open.desc && open.gte === 1000) // an ordinary locked badge still says what it takes
  kit.store.bump('nightTurns', 100)
  kit.checkAchievements('')
  const got = kit.achievementList('').find((x) => x.id === 'secret-night')
  assert.equal(got.unlocked, true)
  assert.equal(got.gte, 100)
  assert.ok(got.desc && got.at > 0)
})

test('achievements: the panel summary counts days and both streaks, and every series adds up', () => {
  const kit = mk()
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.sm = { role: 'bob' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.userTurn('sm')
  const view = kit.achievementView('bob')
  assert.equal(view.summary.total, view.list.length)
  assert.equal(view.summary.badges, view.list.filter((x) => x.unlocked).length)
  assert.equal(view.summary.days, kit.store.statsOf().days.length)
  assert.ok(view.summary.turns > 0)
  assert.ok(view.summary.streakNow >= 1 && view.summary.streakBest >= view.summary.streakNow)
  assert.deepEqual(view.series.map((s) => s.id), ['chat', 'day', 'meet', 'bond', 'work', 'role', 'secret'])
  assert.equal(view.series.reduce((n, s) => n + s.total, 0), view.list.length)
  assert.ok(view.series.every((s) => s.got <= s.total))
  assert.ok(view.series.every((s) => typeof s.name === 'string' && s.name))
})

test('achievements: an unknown series falls back instead of dropping the badge', () => {
  const kit = mk()
  const fs = { writeFileSync }
  const cardFile = join(kit.config.rolesDir, 'bob', 'card.json')
  const card = JSON.parse(readFileSync(cardFile, 'utf8'))
  card.achievements = [{ id: 'odd', name: 'Odd', desc: 'x', metric: 'turns', gte: 1, series: 'not-a-series' }]
  fs.writeFileSync(cardFile, JSON.stringify(card))
  const item = kit.achievementView('bob').list.find((x) => x.id === 'odd')
  assert.equal(item.series, 'role')
  assert.ok(kit.achievementView('bob').series.some((s) => s.id === 'role'))
})

test('the own role switcher is off unless the config asks for it', () => {
  assert.equal(readConfig().roles.enabled, false)
  assert.equal(readConfig().roles.defaultRole, '')
})

test('every user turn records who was speaking, so a later switch cannot repaint it', () => {
  const kit = mk()
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions.tt = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.userTurn('tt'); kit.userTurn('tt')
  sessions.sessions.tt = { role: 'bob' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.userTurn('tt')
  assert.deepEqual(kit.store.turnRolesOf('tt'), ['alice', 'alice', 'bob'])
  sessions.sessions.tt = { role: null }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  kit.userTurn('tt')
  assert.equal(kit.store.turnRolesOf('tt')[3], '') // chose "no role": recorded as known-none
})

test('workers, automations and imports are not chats: they never raise affinity or unlock anything', () => {
  const kit = createKit({ config: { ...readConfig(), language: 'zh' }, rnd: () => 0 }) // default rule: only "session-..." ids count
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  for (const sid of ['agent-team-ab12cd', 'botharness-x1', 'dsh-automation-session-9', 'session-realchat']) sessions.sessions[sid] = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  const before = kit.store.roleStatsOf('alice').turns
  const callsBefore = kit.store.statsOf().toolCalls
  kit.userTurn('agent-team-ab12cd'); kit.userTurn('botharness-x1'); kit.userTurn('dsh-automation-session-9')
  kit.toolCalled('agent-team-ab12cd', 'read_file')
  assert.equal(kit.store.roleStatsOf('alice').turns, before)
  kit.toolCalled('botharness-x1', 'read_file')
  assert.equal(kit.store.statsOf().toolCalls, callsBefore) // workers' tool calls are not "things done together"
  assert.deepEqual(kit.store.turnRolesOf('agent-team-ab12cd'), [])
  kit.userTurn('session-realchat')
  assert.equal(kit.store.roleStatsOf('alice').turns, before + 1)
})

test('workers get no chat flavour in their prompt', () => {
  const kit = createKit({ config: { ...readConfig(), language: 'zh' }, rnd: () => 0 }) // default rule: only "session-..." ids are chats
  const sessions = JSON.parse(readFileSync(kit.config.roleSessionsFile, 'utf8'))
  sessions.sessions['agent-team-zz'] = { role: 'alice' }
  sessions.sessions['session-chat'] = { role: 'alice' }
  writeFileSync(kit.config.roleSessionsFile, JSON.stringify(sessions))
  assert.equal(kit.promptFor('agent-team-zz'), '')
  assert.match(kit.promptFor('session-chat'), /说话强度/)
})

test('a state file that cannot be read is moved aside, not overwritten', async () => {
  const { createStore } = await import('../lib/store.js')
  const { readdirSync } = await import('node:fs')
  const dir = join(tmpdir(), 'kit-corrupt-' + Date.now())
  mkdirSync(dir, { recursive: true })
  const f = join(dir, 'state.json')
  writeFileSync(f, '{ "sessions": { broken')
  const st = createStore(f)
  st.setLevel('s', 'alice', 4); st.flush()
  const names = readdirSync(dir)
  assert.ok(names.some((n) => n.startsWith('state.json.corrupt-')), 'the unreadable file is kept')
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).sessions.s.levels.alice, 4)
  rmSync(dir, { recursive: true, force: true })
})
