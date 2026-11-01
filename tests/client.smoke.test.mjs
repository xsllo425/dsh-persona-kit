import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('client module loads and apply() registers a dock + slot without throwing', () => {
  let mod
  const el = () => ({ remove() {}, appendChild() {}, setAttribute() {}, getAttribute: () => '', querySelector: () => null, style: {} })
  const injected = []
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => { mod = m } }, localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null, createElement: el, head: { appendChild() {} }, body: {}, visibilityState: 'visible', querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: false }) }),
    console,
  }
  sandbox.window.window = sandbox.window
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox)
  const react = { createElement: (...a) => a, useState: (v) => [v, () => {}], useEffect() {}, useRef: () => ({ current: null }) }
  const m = mod.factory((n) => { assert.equal(n, 'react'); return react })
  const registered = []
  const slots = {
    inject: (name, f) => { injected.push(name); if (typeof f === 'function') f() },
    register: (def, component) => { registered.push({ ...def, component }); return () => {} },
  }
  const ctx = { effect() {}, slots }
  m.apply(ctx)
  // the pill and the ghost line were there first; the meme picker adds its button on the left and its board
  // in the overlay, so the list is no longer just the two originals
  assert.deepEqual(injected, [
    'conversation.input.right',
    'conversation.input.overlay',
    'conversation.input.left',
    'conversation.input.overlay',
  ])
  assert.equal(sandbox.window.__dshComposerDockQueue.length, 1)
  assert.equal(sandbox.window.__dshComposerDockQueue[0].id, 'persona-kit')
  // the meme slots carry their own ids and orders, so they sit beside the ghost line instead of on top of it
  const memeSlots = registered.filter((r) => r.id === 'persona-kit-memes')
  assert.equal(memeSlots.length, 2)
  assert.equal(memeSlots[0].name, 'conversation.input.left')
  assert.equal(memeSlots[1].name, 'conversation.input.overlay')
  assert.equal(memeSlots[1].order, 42)
  assert.ok(memeSlots[1].order > 41, 'the board must sit above the ghost line')
})

test('a session switch draws the role /sessions already knows instead of falling back to the bare label', async () => {
  let mod
  const el = () => ({ remove() {}, appendChild() {}, setAttribute() {}, getAttribute: () => '', querySelector: () => null, style: {} })
  const sessions = { s1: { role: 'alice', name: 'Alice', accent: '#123456', level: 4, levelName: '活泼' } }
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => { mod = m } }, localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null, createElement: el, head: { appendChild() {} }, body: {}, visibilityState: 'visible', querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: (url) => Promise.resolve({ json: () => Promise.resolve(String(url).includes('/sessions') ? { ok: true, sessions } : { ok: false }) }),
    console,
  }
  sandbox.window.window = sandbox.window
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox)
  const react = { createElement: (...a) => a, useState: (v) => [v, () => {}], useEffect() {}, useRef: () => ({ current: null }) }
  const m = mod.factory((n) => { assert.equal(n, 'react'); return react })
  m.apply({ effect() {}, slots: { inject() {} } })
  await new Promise((r) => setTimeout(r, 0))
  const kit = sandbox.window.__dshPersonaKit
  const lab = kit.pillLabel('s1') // the role and level the pill should already be drawing, no /session needed
  assert.equal(lab.name, 'Alice')
  assert.equal(lab.level, '活泼')
  assert.equal(lab.accent, '#123456')
  assert.equal(kit.pillLabel('session-' + 's1').name, 'Alice') // the prefixed id shape answers too
  const plain = kit.pillLabel('never-seen')
  assert.equal(plain.name, '人设') // a session the server knows nothing about keeps the old label
  assert.equal(plain.level, '')
})
