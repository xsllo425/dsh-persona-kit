import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The user's report was "the grey line keeps failing now and then". One of the causes was on the server:
// an empty answer was cached under the same key as a real one, so the client's own retry — which asks again
// with the same key — was answered from the cache in a millisecond and could never produce a line.
// These pin that: only a real line may be cached.

const home = mkdtempSync(join(tmpdir(), 'ghostcache-'))
process.env.DSH_HOME = home
mkdirSync(join(home, 'roles', 'alice'), { recursive: true })
writeFileSync(join(home, 'roles', 'alice', 'ROLE.md'), '---\nid: alice\nname: Alice\n---\nYou are Alice.')
writeFileSync(join(home, 'roles', 'alice', 'card.json'), JSON.stringify({ packs: [] }))
mkdirSync(join(home, 'persona-kit'), { recursive: true })
writeFileSync(join(home, 'persona-kit', 'config.json'), JSON.stringify({ roles: { enabled: true, defaultRole: 'alice' }, ghost: { defaultMode: 'normal' } }))
test.after(() => { try { rmSync(home, { recursive: true, force: true }) } catch { /* throw-away folder */ } })

const mod = await import('../lib/index.js')

const user = (seq, text) => ({ type: 'user/message', seq, data: { role: 'user', content: [{ type: 'text', text }] } })
const assistant = (seq, text) => ({ type: 'assistant/message', seq, data: { content: [{ type: 'text', text }] } })

/** A host stub whose session already has one finished exchange, and whose model answers whatever `reply` says. */
function harness(reply) {
  const events = [user(1, '帮我看看这个'), assistant(2, '看好了，没问题。')]
  const session = { surface: { nodes: [1, 2] }, eventAt: (seq) => events.find((e) => e.seq === seq) }
  const calls = []
  const ctx = {
    logger: { info() {}, warn() {} },
    on() {},
    effect() {},
    get: (key) => {
      if (key === 'sessions') return { get: (sid) => (sid === 's1' ? session : undefined) }
      if (key === 'llm') {
        return {
          stream: async function* (args) {
            calls.push(args)
            const text = reply(calls.length)
            if (text) yield { type: 'text-delta', text }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      }
      if (key === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) }
      return undefined
    },
    inject: (_keys, cb) => cb({
      webServer: { register: (r) => { routes.push(r); return () => {} } },
      effect: (fn) => fn(),
      agents: { list: () => [] },
    }),
    tools: { register: () => () => {}, schemas: () => [] },
    commands: { register: () => () => {} },
  }
  const routes = []
  mod.apply(ctx)
  const route = routes.find((r) => r.path === '/persona-kit')
  const ask = async () => {
    let out = ''
    const req = Object.assign((async function* () { yield Buffer.from(JSON.stringify({ session: 's1', mode: 'normal' })) })(), {
      url: '/persona-kit/suggest', method: 'POST', headers: { host: '127.0.0.1:1', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' },
    })
    await route.handler(req, { writeHead() {}, end: (t) => { out = t || '' } })
    return JSON.parse(String(out))
  }
  return { ask, calls }
}

test('an empty answer is not cached, so the next request really asks the model again', async () => {
  const h = harness((n) => (n === 1 ? '' : '要不要我顺手把日志也一起看了？'))
  const first = await h.ask()
  assert.equal(first.ok, true)
  assert.equal(first.text, '')
  assert.notEqual(first.why, 'cached')
  assert.equal(h.calls.length, 1)

  const second = await h.ask()
  assert.equal(second.ok, true)
  assert.equal(second.text, '要不要我顺手把日志也一起看了？')
  assert.notEqual(second.why, 'cached', 'the empty answer must not have been cached')
  assert.equal(h.calls.length, 2, 'a second request after an empty answer must reach the model')
})

test('a real line is cached, so a repeat request costs nothing', async () => {
  const h = harness(() => '那我们把这一版先发出去吧。')
  const first = await h.ask()
  assert.equal(first.why, 'fresh')
  assert.equal(h.calls.length, 1)
  const second = await h.ask()
  assert.equal(second.why, 'cached')
  assert.equal(second.text, first.text)
  assert.equal(h.calls.length, 1, 'a cached line must not cost another model call')
})
