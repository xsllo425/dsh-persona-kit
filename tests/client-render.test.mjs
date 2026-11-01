import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// The bundle is one factory body: a ported component can reference a helper that never came along and
// nothing catches it until the host renders that slot (that is how the sticker picker crashed the web
// boot). So load the module and actually render every registered slot, with data, once.
const el = () => ({ remove() {}, appendChild() {}, setAttribute() {}, getAttribute: () => '', querySelector: () => null, querySelectorAll: () => [], style: {}, classList: { contains: () => false, add() {}, remove() {} } })
const memes = [
  { url: 'claude-chibi/memes/angry/claude-13.png', path: 'memes/angry/claude-13.png', tag: 'angry', caption: '哈——!', keywords: '生气', file_name: 'claude-13.png', pack: 'claude-chibi' },
  { url: 'dafeiyu-redrawn-100/memes/happy/dafeiyu-1.webp', path: 'memes/happy/dafeiyu-1.webp', tag: 'happy', caption: '开心', keywords: '开心', file_name: 'dafeiyu-1.webp', pack: 'dafeiyu-redrawn-100' },
]

function load() {
  let mod
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (m) => { mod = m } },
      localStorage: { getItem: () => null, setItem() {} },
      setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0,
      getComputedStyle: () => ({}), location: { origin: 'http://127.0.0.1:1' },
      innerWidth: 1200, innerHeight: 900, __forceOpen: true,
    },
    document: {
      addEventListener() {}, removeEventListener() {}, getElementById: () => null, createElement: el,
      head: { appendChild() {} }, body: {}, documentElement: { style: { setProperty() {} }, getAttribute: () => '', setAttribute() {} },
      visibilityState: 'visible', querySelectorAll: () => [], querySelector: () => null,
    },
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: (u) => Promise.resolve({
      json: () => Promise.resolve(String(u).includes('/memes-api')
        ? { ok: true, total: memes.length, tags: [], packs: [{ id: 'claude-chibi', name: 'Claude', count: 1 }, { id: 'dafeiyu-redrawn-100', name: '大肥鱼', count: 1 }], memes }
        : { ok: false }),
    }),
    URL, Promise, console, setTimeout, clearTimeout, setInterval, clearInterval,
  }
  sandbox.window.window = sandbox.window
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox)
  return { mod, sandbox }
}

test('every registered slot renders, with data', () => {
  const { mod, sandbox } = load()
  const fakeReact = {
    createElement: (...a) => a,
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useRef: (v) => ({ current: v }),
    useEffect() {},
    useLayoutEffect() {},
    useMemo: (f) => f(),
    useCallback: (f) => f,
    // the picker keeps its open flag in an external store: force it open so the board body runs
    useSyncExternalStore: (_sub, get) => (sandbox.window.__forceOpen ? true : get()),
  }
  const m = mod.factory((name) => { assert.equal(name, 'react'); return fakeReact })
  const captured = []
  m.apply({ effect() {}, slots: { inject: (_n, cb) => cb(), register: (def, fn) => { captured.push({ def, fn }); return () => {} } } })
  assert.equal(captured.length, 4)
  for (const c of captured) {
    assert.doesNotThrow(() => c.fn({ sessionId: 's1', useInput: () => ({ draft: '' }), inputActions: { setDraft() {}, submit() {} } }), c.def.id)
  }
})
