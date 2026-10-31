import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('client module loads and apply() registers a dock + slot without throwing', () => {
  let mod
  const el = () => ({ remove() {}, appendChild() {}, setAttribute() {}, getAttribute: () => '', querySelector: () => null, style: {} })
  const injected = []
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => { mod = m } }, localStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout, setInterval, clearInterval },
    document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null, createElement: el, head: { appendChild() {} }, body: {}, visibilityState: 'visible', querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: false }) }),
    console,
  }
  sandbox.window.window = sandbox.window
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox)
  const react = { createElement: (...a) => a, useState: (v) => [v, () => {}], useEffect() {}, useRef: () => ({ current: null }) }
  const m = mod.factory((n) => { assert.equal(n, 'react'); return react })
  const ctx = { effect() {}, slots: { inject: (name, f) => injected.push(name) } }
  m.apply(ctx)
  assert.deepEqual(injected, ['conversation.input.right', 'conversation.input.overlay'])
  assert.equal(sandbox.window.__dshComposerDockQueue.length, 1)
  assert.equal(sandbox.window.__dshComposerDockQueue[0].id, 'persona-kit')
})
