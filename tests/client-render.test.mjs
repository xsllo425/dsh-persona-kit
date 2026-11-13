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

// `rows` lets a test decide how many stickers the library reports, which is what the grid pages over.
// `opts.stored` pre-fills localStorage, `opts.sizes` collects every --pk-av-size write, and `opts.timers`
// runs scheduled work at once so a test can see what the first paint (scan -> applyAvatars) writes.
function load(rows = memes, opts = {}) {
  let mod
  const stored = opts.stored || {}
  const sizes = opts.sizes || []
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (m) => { mod = m } },
      localStorage: { getItem: (k) => (k in stored ? stored[k] : null), setItem: (k, v) => { stored[k] = String(v) } },
      setTimeout: opts.timers ? (fn) => { try { fn() } catch (e) {} return 0 } : () => 0,
      clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0,
      getComputedStyle: () => ({}), location: { origin: 'http://127.0.0.1:1' },
      innerWidth: 1200, innerHeight: 900, __forceOpen: true,
    },
    document: {
      addEventListener() {}, removeEventListener() {}, getElementById: () => null, createElement: el,
      head: { appendChild() {} }, body: {}, documentElement: { style: { setProperty: (k, v) => { if (k === '--pk-av-size') sizes.push(String(v)) } }, getAttribute: () => '', setAttribute() {} },
      visibilityState: 'visible', querySelectorAll: () => [], querySelector: () => null,
      // the board re-scans the page for sticker text after the library loads; without a walker that
      // throw is swallowed by the fetch chain's .catch and setData never runs, which looks like "no data"
      createTreeWalker: () => ({ nextNode: () => null }),
    },
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: (u) => Promise.resolve({
      json: () => Promise.resolve(String(u).includes('/memes-api')
        ? { ok: true, total: rows.length, tags: [], packs: [{ id: 'claude-chibi', name: 'Claude', count: 1 }, { id: 'dafeiyu-redrawn-100', name: '大肥鱼', count: 1 }], memes: rows }
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
  assert.equal(captured.length, 3)
  for (const c of captured) {
    assert.doesNotThrow(() => c.fn({ sessionId: 's1', useInput: () => ({ draft: '' }), inputActions: { setDraft() {}, submit() {} } }), c.def.id)
  }
})

// Opening or switching a session drops its /session answer to null until the request lands. The picture must
// keep the size the user chose: the old fallback wrote the 30px default for that moment and jumped back to
// 50px when the answer arrived, which users see as "the picture shrinks, then grows".
test('opening a session does not reset the picture to the default size', () => {
  const sizes = []
  const stored = { 'dsh-persona-kit/avatar-settings': JSON.stringify({ ai: true, user: true, name: true, size: 50, layout: 'top', meta: 'both' }) }
  const { mod } = load(memes, { stored, sizes, timers: true })
  const fakeReact = {
    createElement: (type, props, ...kids) => (typeof type === 'function' ? type({ ...(props || {}), children: kids.length ? kids : undefined }) : [type, props || null, ...kids]),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useRef: (v) => ({ current: v === undefined ? null : v }),
    useEffect: (fn) => { try { fn() } catch (e) {} },
    useLayoutEffect() { }, useMemo: (f) => f(), useCallback: (f) => f,
    useSyncExternalStore: () => false,
  }
  const m = mod.factory(() => fakeReact)
  const captured = []
  m.apply({ effect() { }, slots: { inject: (_n, cb) => cb(), register: (def, fn) => { captured.push({ def, fn }); return () => { } } } })
  for (const c of captured) {
    try { c.fn({ sessionId: 's1', useInput: () => ({ draft: '' }), inputActions: { setDraft() { }, submit() { } } }) } catch (e) { }
  }
  assert.ok(sizes.length > 0, 'the picture size is written at least once')
  assert.deepEqual(sizes.filter((s) => s !== '50px'), [], 'the size stays at the remembered 50px while /session is in flight')
})

// so paging is asserted as behaviour: one page first, the rest on demand, and the count tells the truth.
test('the sticker board pages instead of dropping the tail', async () => {
  const many = Array.from({ length: 300 }, (_, i) => ({
    url: `pack-a/memes/happy/a-${i}.png`, path: `memes/happy/a-${i}.png`, tag: 'happy',
    caption: `笑 ${i}`, keywords: '开心', file_name: `a-${i}.png`, pack: 'pack-a',
  }))
  const { mod, sandbox } = load(many)

  // Hooks with real state and dependency checks: without deps the "reset to one page when the filters
  // change" effect would fire on every render and wipe the page the test just advanced.
  let slots = [], effects = [], i = 0, dirty = true
  const same = (a, b) => !!a && a.length === b.length && b.every((v, k) => Object.is(v, a[k]))
  const fakeReact = {
    // real React calls function components, so this must too — otherwise the board body never runs
    createElement: (type, props, ...kids) => {
      if (typeof type === 'function') return type({ ...(props || {}), children: kids.length ? kids : undefined })
      const node = [type, props || null, ...kids]
      return node
    },
    useState: (init) => {
      const at = i++
      if (!slots[at]) slots[at] = [typeof init === 'function' ? init() : init]
      const s = slots[at]
      if (s.length < 2) s[1] = (next) => { s[0] = typeof next === 'function' ? next(s[0]) : next; dirty = true }
      return s
    },
    useRef: (v) => { const at = i++; if (!slots[at]) slots[at] = [{ current: v === undefined ? null : v }]; return slots[at][0] },
    useEffect: (fn, deps) => { const at = i++; const s = slots[at] || (slots[at] = [null]); if (!same(s[0], deps)) { s[0] = deps; effects.push(fn) } },
    useLayoutEffect: () => {},
    useMemo: (f) => f(),
    useCallback: (f) => f,
    useSyncExternalStore: (_sub, get) => (sandbox.window.__forceOpen ? true : get()),
  }
  const m = mod.factory(() => fakeReact)
  const captured = []
  m.apply({ effect() {}, slots: { inject: (_n, cb) => cb(), register: (def, fn) => { captured.push({ def, fn }); return () => {} } } })
  const board = captured.find((c) => c.def.id === 'persona-kit-memes' && c.def.name === 'conversation.input.overlay')
  assert.ok(board, 'the board slot is registered')

  const render = async () => {
    let tree
    for (let pass = 0; pass < 12; pass++) {
      dirty = false; i = 0
      tree = board.fn({ sessionId: 's1' })
      const pending = effects; effects = []
      for (const run of pending) { try { run() } catch (e) {} }
      // the library arrives through a fetch, so always give the microtasks a turn before deciding
      await new Promise((r) => setImmediate(r))
      if (!dirty && pass > 1) break
    }
    return tree
  }

  // the fake createElement returns [type, props, ...children]; walk the tail, and treat text nodes as strings
  const isNode = (n) => Array.isArray(n) && n.length >= 2 && (typeof n[0] === 'string' || typeof n[0] === 'function') && (n[1] == null || typeof n[1] === 'object')
  const walk = (n, visit) => {
    if (n === null || n === undefined || typeof n === 'boolean') return
    if (isNode(n)) { visit(n); for (let k = 2; k < n.length; k++) walk(n[k], visit); return }
    if (Array.isArray(n)) { n.forEach((k) => walk(k, visit)); return }
    if (typeof n === 'string' || typeof n === 'number') visit(String(n))
  }
  const findAll = (root, cls) => {
    const hits = []
    walk(root, (n) => { if (typeof n !== 'string' && String(n[1] && n[1].className || '').split(' ').includes(cls)) hits.push(n) })
    return hits
  }
  const text = (node) => { let out = ''; walk(node, (n) => { if (typeof n === 'string') out += n }); return out }

  let tree = await render()
  assert.equal(findAll(tree, 'mp-cell').length, 240, 'the first page draws 240 cells')
  const more = findAll(tree, 'mp-more')[0]
  assert.ok(more, 'a "show the rest" control appears while pages remain')
  assert.match(text(more), /240/)
  assert.match(text(more), /300/)

  // scrolling to the bottom must page too, not just the button
  const grid = findAll(tree, 'mp-cell')[0]
  const gridNode = findAll(tree, 'mp-grid')[0]
  assert.ok(gridNode[1].onScroll, 'the grid itself keeps a scroll handler')
  gridNode[1].onScroll({ currentTarget: { scrollTop: 900, clientHeight: 400, scrollHeight: 1320 } })
  tree = await render()
  assert.equal(findAll(tree, 'mp-cell').length, 300, 'reaching the bottom draws the whole board')
  assert.equal(findAll(tree, 'mp-more').length, 0, 'with nothing left to page, the hint goes away')
})
