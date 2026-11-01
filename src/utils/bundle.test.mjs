// Self-check for the export file checks:
//   node --experimental-strip-types src/utils/bundle.test.mjs
// No test framework — bundle.ts has only type imports, so Node can load it
// with the types stripped.
import { readFileSync } from 'node:fs'
import { readBundle, normalizeCombo, isReservedCombo, freeName, cleanSession, riskyPattern, globalHotkeyOk, cleanWorkspaceName, LIMITS, normalizeNoteKey, inspectWorkspace, comboOf, presentSections } from './bundle.ts'

let bad = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : `-> ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

const ctx = {
  actionIds: new Set(['nav.up', 'nav.down', 'edit.copy', 'cmd.palette']),
  advKeys: ['hidden', 'confirmDelete'],
  themeKeys: new Set(['flex-light', 'flex-dark']),
  parseTheme: json => {
    const t = JSON.parse(json)
    return t && typeof t.key === 'string' ? { ok: true, theme: t } : { ok: false, errors: ['key がありません'] }
  },
  existingWorkspaces: ['仕事'],
  drives: ['C:', 'D:'],
}
const file = sections => JSON.stringify({ kind: 'flexexplorer-export', v: 1, app: '0.1.16', exportedAt: '', sections })
// one workspace holding one tab at these path segments
const ws = (...segs) => ({ v: 2, layouts: [{ name: 'g', panes: [{ active: 0, tabs: [{ path: segs }] }] }] })

// whole-file errors
eq('broken JSON', readBundle('{', ctx).ok, false)
eq('wrong kind', readBundle(JSON.stringify({ kind: 'x', v: 1 }), ctx).ok, false)
eq('newer v', readBundle(JSON.stringify({ kind: 'flexexplorer-export', v: 2, app: '9.0.0' }), ctx).error.includes('9.0.0'), true)

// combos
eq('combo order', normalizeCombo('shift+ctrl+p'), 'Ctrl+Shift+P')
eq('combo alias', normalizeCombo('Alt+ArrowUp'), 'Alt+↑')
eq('combo plus key', normalizeCombo('Ctrl++'), 'Ctrl++')
eq('combo F key', normalizeCombo('f2'), 'F2')
eq('combo named key kept', normalizeCombo('PageUp'), 'PageUp')
eq('combo modifier only', normalizeCombo('Ctrl+Shift'), null)
eq('combo unknown modifier', normalizeCombo('Hyper+K'), null)
eq('reserved Ctrl+3', isReservedCombo('Ctrl+3'), true)
eq('reserved Esc', isReservedCombo('Esc'), true)
eq('not reserved Ctrl+0', isReservedCombo('Ctrl+0'), false)

// shortcuts: unknown id, reserved key, duplicate, bad hotkey
{
  const r = readBundle(file({ shortcuts: { binds: { 'nav.up': '↑', 'nav.down': 'ctrl+3', 'edit.copy': 'Ctrl+C', 'cmd.palette': 'ctrl+c', 'gone.action': 'F9' }, quickOpenHotkey: 'O' } }), ctx)
  eq('shortcuts kept', r.clean.shortcuts.binds, { 'nav.up': '↑', 'edit.copy': 'Ctrl+C' })
  eq('shortcuts hotkey without modifier dropped', r.clean.shortcuts.quickOpenHotkey, undefined)
  eq('shortcuts issue count', r.issues.shortcuts.length, 4)
}

// appearance: bad values dropped, unknown theme kept out, theme from the file accepted
{
  const r = readBundle(file({ appearance: { theme: 'custom:mine', opt: { fontSize: 40, zebra: true, accent: 'red' } }, themes: [{ key: 'custom:mine' }, { nokey: 1 }] }), ctx)
  eq('appearance opt', r.clean.appearance.opt, { zebra: true })
  eq('appearance theme from file', r.clean.appearance.theme, 'custom:mine')
  eq('themes parsed', r.clean.themes.length, 1)
  eq('themes issue', r.issues.themes.length, 1)
  const r2 = readBundle(file({ appearance: { theme: 'custom:nowhere', opt: {} } }), ctx)
  eq('appearance unknown theme dropped', r2.clean.appearance.theme, undefined)
}

// behavior: unknown adv keys ignored, bad regex dropped
{
  const r = readBundle(file({ behavior: { adv: { hidden: true, gpu: true, confirmDelete: 'yes' }, genRules: [{ pattern: '(' }, { label: 'A', pattern: '^A' }] } }), ctx)
  eq('behavior adv', r.clean.behavior.adv, { hidden: true })
  eq('behavior rules', r.clean.behavior.genRules.map(x => x.pattern), ['^A'])
}

// workspaces: clash → renamed by default, UNC and missing drives found
{
  const r = readBundle(file({
    workspaces: { '仕事': ws('C:', 'Users'), '共有': ws('\\\\nas01', 'share'), '外付け': ws('E:', 'data'), 'bad': { layouts: [] } },
    defaultWorkspace: '共有',
  }), ctx)
  const w = Object.fromEntries(r.clean.workspaces.map(x => [x.name, x]))
  eq('ws clash renamed', [w['仕事'].exists, w['仕事'].choice, w['仕事'].altName], [true, 'rename', '仕事 (2)'])
  eq('ws new added', [w['共有'].exists, w['共有'].choice], [false, 'add'])
  eq('ws unc', r.unc, ['\\\\nas01'])
  eq('ws unc per item', w['共有'].unc, ['\\\\nas01'])
  eq('ws missing drive', r.missingDrives, ['E:'])
  eq('ws empty one dropped', r.clean.workspaces.length, 3)
  eq('ws default kept', r.clean.defaultWorkspace, '共有')
  eq('no drives known → none missing', readBundle(file({ workspaces: { a: ws('E:') } }), { ...ctx, drives: [] }).missingDrives, [])
}

// workspace shape: legacy single group, junk fields dropped, bad path rejected
eq('session legacy', cleanSession({ panes: [{ tabs: [{ path: ['C:'] }] }], gridCols: 2 }).layouts[0].gridCols, 2)
eq('session junk dropped', 'evil' in cleanSession({ layouts: [{ panes: [{ tabs: [{ path: ['C:'] }] }] }], evil: 1 }), false)
eq('session bad path', cleanSession({ layouts: [{ panes: [{ tabs: [{ path: 'C:\\' }] }] }] }), null)
eq('freeName', freeName('a', ['A', 'a (2)']), 'a (3)')

// notes: wrong shape dropped, keys lowercased
{
  // JSON.parse, as a real file is read: an object literal would make "__proto__" the prototype
  const notes = JSON.parse('{"C:\\\\Work": {"text": "memo", "h": 200}, "D:\\\\x": {"h": 1}, "__proto__": {"text": "p"}}')
  const r = readBundle(file({ notes }), ctx)
  eq('notes kept', Object.keys(r.clean.notes), ['c:\\work'])
  eq('notes issues (shape, not a path)', r.issues.notes.length, 2)
}

// review fixes: runaway regex, oversized grids, note height, keys taken from other actions
{
  const r = readBundle(file({ behavior: { adv: {}, genRules: [{ label: 'x', pattern: '^(a+)+$' }, { label: 'ok', pattern: '^(A)_\\d{8}' }] } }), ctx)
  eq('risky rule comes in off', r.clean.behavior.genRules.map(x => x.on), [false, true])
  eq('risky rule noted', r.issues.behavior.length, 1)
  const big = cleanSession({ layouts: [{ gridCols: 1e9, panes: Array.from({ length: 20 }, () => ({ tabs: [{ path: ['C:'] }] })) }], colFracs: Array(1e4).fill(1) })
  eq('grid clamped', [big.layouts[0].gridCols, big.layouts[0].panes.length, big.colFracs], [4, 9, undefined])
  const n = readBundle(file({ notes: { 'C:\\a': { text: '', h: 4294967296 }, 'C:\\b': { text: '', h: -1 } } }), ctx).clean.notes
  eq('note height clamped', [n['c:\\a'].h, n['c:\\b'].h], [520, 64])
  const k = readBundle(file({ shortcuts: { binds: { 'edit.copy': 'Ctrl+V' } } }), { ...ctx, binds: { 'edit.copy': 'Ctrl+C', 'cmd.palette': 'Ctrl+V' } })
  eq('unbind current holder', k.clean.shortcuts.unbind, ['cmd.palette'])
}

for (const [pat, want] of [['^((a+))+$', true], ['(a|aa)*', true], ['(x+)+', true], ['^(A)_\\d{8}', false], ['^(\\d+)_', false], ['[(a+)]+', false], ['\\(a+\\)+', false], ['^a*a*a*a*a*b$', true], ['^(A)_\\d{8}_\\d+', false]]) eq(`riskyPattern ${pat}`, riskyPattern(pat), want)

// ---- second review: boundaries ----

// `?`, `|` and `{n}` count too (each of these took seconds on one file name)
for (const [pat, want] of [
  ['.?'.repeat(20) + '\\u0000', true],
  ['(.|.)'.repeat(20) + '\\u0000', true],
  ['[ab]?'.repeat(20) + '$', true],
  ['^(.+?)_(\\d{8})(?:_v(\\d+))?\\.(\\w+)$', false],
  ['^(?<base>.+)_\\d{8}', false],
]) eq(`riskyPattern ${pat.slice(0, 24)}`, riskyPattern(pat), want)
{
  // and one that is let through really is quick
  const t = Date.now()
  new RegExp('^(.+?)_(\\d{8})(?:_v(\\d+))?\\.(\\w+)$').test('あ'.repeat(38))
  eq('accepted rule is quick', Date.now() - t < 50, true)
}

// global hotkey needs two modifiers
{
  const hk = v => readBundle(file({ shortcuts: { quickOpenHotkey: v } }), ctx).clean.shortcuts.quickOpenHotkey
  eq('hotkey Ctrl+C refused', hk('Ctrl+C'), undefined)
  eq('hotkey Alt+F refused', hk('Alt+F'), undefined)
  eq('hotkey Ctrl+Alt+O kept', hk('ctrl+alt+o'), 'Ctrl+Alt+O')
  eq('hotkey Alt+Shift+Q kept', hk('Alt+Shift+Q'), 'Alt+Shift+Q')
  eq('globalHotkeyOk', [globalHotkeyOk('Ctrl+Shift+K'), globalHotkeyOk('Ctrl+K'), globalHotkeyOk('F9')], [true, false, false])
}

// workspace names: the same cases as safe_name's test in workspaces.rs
for (const [raw, want] of [
  ['仕事', '仕事'], ['a/b:c', 'abc'], ['CON', '_CON'], ['nul.txt', '_nul.txt'], ['com1', '_com1'], ['CONOUT$', '_CONOUT$'],
  ['CONSOLE', 'CONSOLE'], ['x. . ', 'x'], ['あ'.repeat(300), 'あ'.repeat(120)], ['...', ''],
]) eq(`cleanWorkspaceName ${raw.slice(0, 12)}`, cleanWorkspaceName(raw), want)
// Name rules: the device check sees the final name; ASCII case only; U+FEFF kept (as Rust's trim does)
eq('cleanWorkspaceName CON+spaces+x', cleanWorkspaceName('CON' + ' '.repeat(117) + 'x'), '_CON')
eq('cleanWorkspaceName dotless i', cleanWorkspaceName('CONıN$'), 'CONıN$')
eq('cleanWorkspaceName FEFF kept', cleanWorkspaceName('﻿a　'), '﻿a')
for (const n of ['CON' + ' '.repeat(117) + 'x', 'aux' + 'y'.repeat(130)]) eq(`cleanWorkspaceName idempotent ${n.slice(0, 6)}`, cleanWorkspaceName(cleanWorkspaceName(n)), cleanWorkspaceName(n))
{
  // a 120-character name still gets a suffix the file name keeps
  const long = 'あ'.repeat(120)
  const f = freeName(long, [long])
  eq('freeName keeps the suffix within 120', [[...f].length, f.endsWith(' (2)'), cleanWorkspaceName(f) === f], [120, true, true])
  eq('freeName long, next one', freeName(long, [long, f]).endsWith(' (3)'), true)
}
{
  // restoring a backup takes sections that are there but empty
  const b = readBundle(JSON.stringify({ kind: 'flexexplorer-export', v: 1, autoBackup: true, sections: { notes: {}, themes: [], places: { bookmarks: [], pins: [] }, workspaces: {}, defaultWorkspace: null } }), ctx)
  eq('restore: empty sections present', presentSections(b.clean, b.restore), ['places', 'themes', 'workspaces', 'notes'])
  eq('not restore: empty sections absent', presentSections(b.clean), [])
}
for (const n of ['CON', 'a. ', 'x'.repeat(200)]) eq(`cleanWorkspaceName idempotent ${n.slice(0, 6)}`, cleanWorkspaceName(cleanWorkspaceName(n)), cleanWorkspaceName(n))

// counts are capped, and so are the reasons shown
{
  const many = Object.fromEntries(Array.from({ length: LIMITS.workspaces + 50 }, (_, i) => ['w' + i, ws('C:')]))
  const r = readBundle(file({ workspaces: many }), ctx)
  eq('workspaces capped', r.clean.workspaces.length, LIMITS.workspaces)
  eq('workspaces cap said', r.issues.workspaces.length, 1)
  const notes = Object.fromEntries(Array.from({ length: LIMITS.notes + 500 }, (_, i) => ['C:\\n' + i, { text: '' }]))
  eq('notes capped', Object.keys(readBundle(file({ notes }), ctx).clean.notes).length, LIMITS.notes)
  const junk = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['x' + i + 'y'.repeat(5000), { text: '' }]))
  const iss = readBundle(file({ notes: junk }), ctx).issues.notes
  eq('issues capped at 50 + rest', [iss.length, iss[50]], [51, 'ほか 950件'])
  eq('issue text cut', iss.every(m => [...m].length <= 100), true)
}

// notes: keys in noteKey's form, case-only duplicates reported
{
  const r = readBundle(file({ notes: JSON.parse('{"C:/Work/": {"text": "a"}, "c:\\\\work": {"text": "b"}, "\\\\\\\\?\\\\C:\\\\x": {"text": "c"}, "\\\\\\\\nas\\\\s\\\\": {"text": "d"}}') }), ctx)
  eq('note keys normalized', Object.keys(r.clean.notes), ['c:\\work', '\\\\nas\\s'])
  eq('note first one kept', r.clean.notes['c:\\work'].text, 'a')
  eq('note dup + device reported', r.issues.notes.length, 2)
  eq('normalizeNoteKey drive root', normalizeNoteKey('C:\\'), 'c:')
}

// session sizes stay within what the app's own drags allow
{
  const tab = { path: ['C:'] }
  const s = cleanSession({
    layouts: [{ gridCols: 1, panes: Array.from({ length: 9 }, () => ({ tabs: [{ path: ['C:'], columns: [{ id: 'name', w: 1e9 }, { id: 'size', w: 0 }, { id: 'size', w: 90 }] }] })) }],
    sidebarW: 1e7, inspectorW: -5, colFracs: [1, 1e-300], rowFracs: [1e308, 1e308, 1e308],
  })
  eq('sidebar/inspector clamped', [s.sidebarW, s.inspectorW], [420, 300])
  eq('columns clamped and deduped', s.layouts[0].panes[0].tabs[0].columns, [{ id: 'name', w: 2000 }, { id: 'size', w: 40 }])
  eq('fracs floored and scaled', [s.colFracs, s.rowFracs], [[1, 0.12], [1, 1, 1]])
  eq('9 panes in 1 column → 3 columns', [s.layouts[0].gridCols, s.layouts[0].panes.length], [3, 9])
  eq('columns without name dropped', cleanSession({ layouts: [{ panes: [{ tabs: [{ path: ['C:'], columns: [{ id: 'size', w: 80 }] }] }] }] }).layouts[0].panes[0].tabs[0].columns, undefined)
  const big = cleanSession({ layouts: Array.from({ length: 40 }, () => ({ panes: Array.from({ length: 9 }, () => ({ tabs: Array(200).fill(tab) })) })) })
  eq('tabs per workspace capped', big.layouts.flatMap(g => g.panes.flatMap(p => p.tabs)).length, 500)
  eq('device path tab dropped', cleanSession({ layouts: [{ panes: [{ tabs: [{ path: ['\\\\.\\pipe', 'x'] }] }] }] }), null)
}

// \\?\ and \\.\ prefixes
{
  const r = readBundle(file({ workspaces: { a: ws('\\\\?\\UNC\\nas02\\s'), b: ws('\\\\?\\C:\\x'), c: ws('\\\\?\\E:\\y') } }), ctx)
  eq('\\\\?\\UNC is the server', r.unc, ['\\\\nas02'])
  eq('\\\\?\\E: is drive E:', r.missingDrives, ['E:'])
}

// sections with nothing usable keep their reasons; default name case-insensitive; theme clash; backups
{
  const r = readBundle(file({ notes: { x: { text: '' } }, workspaces: { 'Work': ws('C:') }, defaultWorkspace: 'work' }), ctx)
  eq('empty section keeps its reasons', [Object.keys(r.clean.notes).length, r.issues.notes.length], [0, 1])
  eq('default workspace case-insensitive', r.clean.defaultWorkspace, 'Work')
  const t = readBundle(file({ themes: [{ key: 'flex-dark', label: 'ダーク' }, { key: 'custom:new' }] }), ctx)
  eq('theme clash named', t.themeClash, ['ダーク'])
  const b = readBundle(JSON.stringify({ kind: 'flexexplorer-export', v: 1, autoBackup: true, sections: { workspaces: { '仕事': ws('C:') } } }), ctx)
  eq('backup replaces by default', [b.restore, b.clean.workspaces[0].choice], [true, 'overwrite'])
  eq('backup by file name', readBundle(file({}), { ...ctx, asBackup: true }).restore, true)
}

// a saved workspace file, as the workspace screen checks it
{
  eq('inspect: not JSON', inspectWorkspace('{', []).ok, false)
  eq('inspect: an export file', inspectWorkspace(file({}), []).reason.includes('読み込む'), true)
  const i = inspectWorkspace(JSON.stringify(ws('E:', 'x')), ['C:'])
  eq('inspect: ok, drive missing', [i.ok, i.missingDrives], [true, ['E:']])
  // what 書き出す / すべて書き出す write is read back the same by 読み込む and by the folder list
  const again = inspectWorkspace(JSON.stringify(i.data, null, 2), ['C:'])
  // within cleanSession's limits but over what load_workspace reads: refused before saving
  const seg = 'あ'.repeat(240)
  const huge = { layouts: Array.from({ length: 50 }, () => ({ panes: [{ tabs: Array.from({ length: 10 }, () => ({ path: ['C:', ...Array(40).fill(seg)] })) }] })) }
  eq('inspect: too big to open later', inspectWorkspace(JSON.stringify(huge), []).reason?.includes('大きすぎ'), true)
  eq('import: too big reported', readBundle(file({ workspaces: { big: huge } }), ctx).issues.workspaces?.[0]?.includes('大きすぎ'), true)
  eq('inspect: exported file reads back the same', [again.ok, JSON.stringify(again.data) === JSON.stringify(i.data)], [true, true])
}

// combos: what comboOf makes survives normalizeCombo unchanged
{
  eq('combo + alone', normalizeCombo('+'), '+')
  eq('combo contextmenu', normalizeCombo('contextmenu'), 'ContextMenu')
  eq('combo Ctrl+f25', normalizeCombo('Ctrl+f25'), null)
  eq('reserved Shift+Esc', isReservedCombo('Shift+Esc'), true)
  // The defaults, read from the store's own table (it can't be imported here).
  const src = readFileSync(new URL('../store/useStore.ts', import.meta.url), 'utf8')
  const defs = [...src.matchAll(/\['([a-z]+\.[a-z]+)','[^']*','((?:[^'\\]|\\.)*)'\]/g)].map(m => m[2].replace(/\\\\/g, '\\'))
  eq('found the default bindings', defs.length > 40, true)
  eq('defaults are normalized', defs.filter(c => normalizeCombo(c) !== c), [])
  const keys = ['a', 'Z', '1', ' ', '+', '\\', ',', 'F2', 'F24', 'Enter', 'Tab', 'Escape', 'Delete', 'Backspace', 'ArrowUp', 'ArrowLeft', 'Home', 'PageDown', 'Insert', 'ContextMenu', 'Pause', 'MediaPlayPause']
  const made = []
  for (const key of keys) for (const m of [0, 1, 2, 3, 5, 7]) made.push(comboOf({ key, ctrlKey: !!(m & 1), altKey: !!(m & 2), shiftKey: !!(m & 4), metaKey: false }))
  eq('comboOf output is normalized', made.filter(c => normalizeCombo(c) !== c), [])
}

if (bad) { console.log(`\n${bad} failed`); process.exit(1) }
console.log('\nall passed')
