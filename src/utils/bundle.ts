// The settings/workspace export file (オプション > バックアップ) and the checks
// an import goes through before anything is applied.
//
// Pure: no store, no Tauri. What the checks need to know about this machine
// (actions, themes, workspaces, drives) is passed in, so the self-check
// (`node --experimental-strip-types src/utils/bundle.test.mjs`) can run it.

import type { AppearanceOptions, AdvancedState, Bookmark, FolderNote, GenerationRule } from '../types'

export const BUNDLE_KIND = 'flexexplorer-export'
export const BUNDLE_V = 1
export const BUNDLE_EXT = '.flexexplorer.json'
/** Large enough for the automatic pre-import backup (every workspace and
 * note), which has to stay readable by the same import. */
export const BUNDLE_MAX_BYTES = 32 * 1024 * 1024

export type SectionId = 'appearance' | 'behavior' | 'shortcuts' | 'places' | 'themes' | 'workspaces' | 'notes'

export const SECTIONS: { id: SectionId; label: string; desc: string }[] = [
  { id: 'appearance', label: '外観', desc: 'テーマ・文字サイズ・行の高さなど' },
  { id: 'behavior', label: '動作・世代ファイル', desc: 'ファイル表示・デフォルト動作・世代ファイルのルール' },
  { id: 'shortcuts', label: 'ショートカット', desc: 'キーの割り当てとグローバルホットキー' },
  { id: 'places', label: 'ブックマーク・ピン', desc: 'サイドバーのブックマークとピン留め' },
  { id: 'themes', label: '自作テーマ', desc: 'テーマを作成・インポートしたもの' },
  { id: 'workspaces', label: 'ワークスペース', desc: '名前を付けて保存した配置と、Ctrl+N の既定' },
  { id: 'notes', label: '付箋', desc: 'フォルダごとのメモ（私的なメモなので初期値はオフ）' },
]

export interface BundleSections {
  appearance?: { theme: string; opt: AppearanceOptions }
  behavior?: { adv: AdvancedState; genHighlight: boolean; genRules: GenerationRule[] }
  shortcuts?: { binds: Record<string, string>; quickOpenHotkey: string }
  places?: { bookmarks: Bookmark[]; pins: string[] }
  /** Each one the same object a .flextheme.json file holds. */
  themes?: unknown[]
  workspaces?: Record<string, unknown>
  defaultWorkspace?: string | null
  notes?: Record<string, FolderNote>
}

export interface Bundle {
  kind: typeof BUNDLE_KIND
  v: number
  app: string
  exportedAt: string
  /** Set on the automatic pre-import backup: reading it back puts every
   * chosen section back as it was, instead of adding to what is there. */
  autoBackup?: true
  sections: BundleSections
}

/** One workspace in the file, and what to do with it. */
export interface WsItem {
  name: string
  data: object
  /** A workspace of this name is already saved here. */
  exists: boolean
  /** Name it gets when saved under another name. */
  altName: string
  choice: 'add' | 'overwrite' | 'rename' | 'skip'
  unc: string[]
  missingDrives: string[]
}

/** What survived the checks, ready to apply. */
export interface CleanSections<T = unknown> {
  appearance?: { theme?: string; opt: Partial<AppearanceOptions> }
  behavior?: { adv: Partial<AdvancedState>; genHighlight?: boolean; genRules?: GenerationRule[] }
  /** `unbind`: actions not in the file whose key the file gives to another one. */
  shortcuts?: { binds: Record<string, string>; quickOpenHotkey?: string; unbind: string[] }
  places?: { bookmarks: Bookmark[]; pins: string[] }
  themes?: T[]
  workspaces?: WsItem[]
  defaultWorkspace?: string
  notes?: Record<string, FolderNote>
}

export interface ImportPreview<T = unknown> {
  app: string
  exportedAt: string
  /** An automatic backup (or a file chosen as one): sections replace what is
   * there — notes and themes not in it are removed, workspaces overwritten. */
  restore: boolean
  /** Labels of themes in the file that replace a saved one of the same key. */
  themeClash: string[]
  clean: CleanSections<T>
  /** Why items were left out, per section. */
  issues: Partial<Record<SectionId, string[]>>
  /** `\\server` roots found in workspaces and bookmarks. */
  unc: string[]
  /** Drive letters used there that this PC doesn't have. */
  missingDrives: string[]
}

export interface ReadCtx<T> {
  actionIds: ReadonlySet<string>
  advKeys: readonly string[]
  /** Built-in and already-saved custom theme keys. */
  themeKeys: ReadonlySet<string>
  parseTheme: (json: string) => { ok: true; theme: T & { key: string } } | { ok: false; errors: string[] }
  existingWorkspaces: readonly string[]
  /** Current bindings, to find keys the file would take from other actions. */
  binds?: Readonly<Record<string, string>>
  /** "C:", "D:" … — empty when not known, and then nothing is reported missing. */
  drives: readonly string[]
  /** Read the file as an automatic backup even without its marker. */
  asBackup?: boolean
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isStr = (v: unknown): v is string => typeof v === 'string'
const oneOf = (...xs: unknown[]) => (v: unknown) => xs.includes(v)

// ---- key combos ----

const MOD_NAMES: Record<string, 'Ctrl' | 'Alt' | 'Shift'> = { ctrl: 'Ctrl', control: 'Ctrl', meta: 'Ctrl', cmd: 'Ctrl', alt: 'Alt', shift: 'Shift' }
const KEY_ALIASES: Record<string, string> = {
  space: 'Space', ' ': 'Space', arrowup: '↑', up: '↑', arrowdown: '↓', down: '↓', arrowleft: '←', left: '←', arrowright: '→', right: '→',
  delete: 'Del', del: 'Del', escape: 'Esc', esc: 'Esc', enter: 'Enter', return: 'Enter', tab: 'Tab', backspace: 'Backspace',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert',
}

// Named keys whose KeyboardEvent name isn't simply the capitalised word, so a
// hand-written "contextmenu" still becomes what `comboOf` produces.
for (const k of ['ContextMenu', 'PrintScreen', 'ScrollLock', 'CapsLock', 'NumLock', 'Pause', 'Clear', 'Help']) KEY_ALIASES[k.toLowerCase()] = k

/** Human-readable name for the non-modifier half of a combo. */
export function keyName(key: string): string {
  switch (key) {
    case ' ': return 'Space'
    case 'ArrowUp': return '↑'
    case 'ArrowDown': return '↓'
    case 'ArrowLeft': return '←'
    case 'ArrowRight': return '→'
    case 'Delete': return 'Del'
    case 'Escape': return 'Esc'
    default: return key.length === 1 ? key.toUpperCase() : key
  }
}

/** True for the modifier keys themselves, which can't stand alone as a combo. */
export function isModifierKey(key: string): boolean {
  return key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta'
}

/** Canonical name for a key event, e.g. "Ctrl+Shift+P", "Alt+↑", "F2".
 * Modifier order is fixed (Ctrl, Alt, Shift) so equal combos compare equal. */
export function comboOf(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'key'>): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (isModifierKey(e.key)) return parts.join('+')
  parts.push(keyName(e.key))
  return parts.join('+')
}

/** A combo written the way `comboOf` names it — "Ctrl+Alt+Shift+K",
 * "Alt+↑", "F2" — or null when it isn't one. */
export function normalizeCombo(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  // A trailing "+" is the plus key itself ("Ctrl++", or "+" alone).
  const parts = s === '+' ? ['+'] : s.endsWith('++') ? [...s.slice(0, -2).split('+'), '+'] : s.split('+')
  const keyRaw = parts.pop()!.trim()
  const mods = new Set<string>()
  for (const p of parts) {
    const m = MOD_NAMES[p.trim().toLowerCase()]
    if (!m) return null
    mods.add(m)
  }
  if (!keyRaw || MOD_NAMES[keyRaw.toLowerCase()]) return null
  const lower = keyRaw.toLowerCase()
  let key = KEY_ALIASES[lower] ?? (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower) ? lower.toUpperCase() : keyRaw)
  if ([...key].length === 1) key = key.toUpperCase()
  // Other named keys (MediaPlayPause, BrowserBack …) keep their KeyboardEvent
  // name, which always starts with a capital: "f25" or "pgup" is no key.
  else if (!/^[A-Z][A-Za-z0-9]*$/.test(key)) return null
  return [...(['Ctrl', 'Alt', 'Shift'] as const).filter(m => mods.has(m)), key].join('+')
}

/** Combos App.tsx handles itself before (or instead of) the bindings, so a
 * binding on them would never fire or would take away pane switching. Esc
 * closes things whatever modifier is held. */
export function isReservedCombo(combo: string): boolean {
  return /(^|\+)Esc$/.test(combo) || combo === 'Tab' || combo === 'Shift+Tab' || /^Ctrl\+[1-9]$/.test(combo)
}

/** The global quick-open hotkey is registered with the OS for every app, so
 * it needs two modifiers: Ctrl+C or Alt+F would take that key away from
 * whatever else is in front. */
export function globalHotkeyOk(combo: string): boolean {
  return /^(Ctrl\+Alt|Ctrl\+Shift|Alt\+Shift)\+/.test(combo)
}

// ---- paths ----

/** The `\\server` root of a UNC path, the "E:" of a drive path, or neither.
 * `\\?\C:\…` and `\\?\UNC\server\…` (or `\\.\`) are the same places spelled
 * for the Win32 namespaces; anything else there (`\\.\pipe\x`) is a device. */
function rootOf(path: string): { unc?: string; drive?: string; device?: true } {
  const ns = path.match(/^[\\/]{2}[?.][\\/](.*)$/s)
  if (ns) {
    const u = ns[1].match(/^UNC[\\/]+([^\\/]+)/i)
    if (u) return { unc: '\\\\' + u[1] }
    const d = ns[1].match(/^([A-Za-z]):/)
    return d ? { drive: d[1].toUpperCase() + ':' } : { device: true }
  }
  const unc = path.match(/^[\\/]{2}([^\\/]+)/)
  if (unc) return { unc: '\\\\' + unc[1] }
  const d = path.match(/^([A-Za-z]):/)
  return d ? { drive: d[1].toUpperCase() + ':' } : {}
}

function scanRoots(paths: string[], drives: readonly string[]) {
  const unc = new Set<string>()
  const missing = new Set<string>()
  const have = new Set(drives.map(d => d.toUpperCase()))
  for (const p of paths) {
    const r = rootOf(p)
    if (r.unc) unc.add(r.unc)
    if (r.drive && have.size && !have.has(r.drive)) missing.add(r.drive)
  }
  return { unc: [...unc].sort(), missingDrives: [...missing].sort() }
}

// ---- workspaces ----

/** Longest workspace name; the same as `MAX_STEM` in fs.rs. */
const MAX_NAME = 120
/** DOS device names, which Windows opens as the device whatever the
 * extension (`CON.json` is the console, and reading it blocks). Matched
 * after ASCII-only upper-casing, as `reserved_device` (fs.rs) does. */
const RESERVED_NAME = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$|CLOCK\$)$/
/** Rust's `char::is_whitespace`, controls aside (they are removed first).
 * Not JS `\s`/trim(), which also take U+FEFF. */
const WS = '[ \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]'
const LEAD_WS = new RegExp(`^${WS}+`)
const TRAIL_WS = new RegExp(`${WS}+$`)
const TRAIL_CUT = new RegExp(`(\\.|${WS})+$`)
const cutName = (s: string) => [...s].slice(0, MAX_NAME).join('').replace(TRAIL_CUT, '')
const isReservedName = (s: string) => RESERVED_NAME.test(s.split('.')[0].replace(TRAIL_WS, '').replace(/[a-z]/g, c => c.toUpperCase()))

/** A workspace name as `safe_stem` (fs.rs) turns it into a file name, so the
 * name shown is the name the file gets: no path or control characters, no
 * trailing dots or spaces, at most 120 characters, and a `_` in front of a
 * device name (checked on the final name). Applying it twice changes
 * nothing. Empty when nothing usable is left. */
export function cleanWorkspaceName(name: string): string {
  const s = cutName(name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g, '').replace(LEAD_WS, '').replace(TRAIL_WS, ''))
  return isReservedName(s) ? cutName('_' + s) : s
}

const COL_IDS = ['name', 'date', 'size']
const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined)
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined)
const cut = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s)
/** Track weights: none so small its pane can't be seen (the app's own drag
 * stops at about this share), scaled to 1 so their sum stays finite. */
const fracs = (v: unknown, max: number) => {
  if (!Array.isArray(v) || !v.length || v.length > max || !v.every(x => typeof x === 'number' && x > 0 && Number.isFinite(x))) return undefined
  const top = Math.max(...v)
  return v.map(x => Math.max(x / top, 0.12))
}

// What the app itself never goes beyond (MAX_PANES / MAX_COLS / MAX_ROWS in
// useStore, the drag limits in dragMove); a file asking for more would
// otherwise size arrays from it or leave a panel too wide to see past.
const MAX_GROUPS = 50
const MAX_PANES = 9
const MAX_COLS = 4
const MAX_ROWS = 3
const MAX_TABS = 200
/** Tabs in one workspace, all groups together. */
const MAX_WS_TABS = 500

function cleanColumns(v: unknown) {
  if (!Array.isArray(v) || !v.every(c => isObj(c) && COL_IDS.includes(c.id))) return undefined
  const seen = new Set<string>()
  const cols = v.filter(c => !seen.has(c.id) && seen.add(c.id)).map(c => ({ id: c.id as string, w: num(c.w, 40, 2000) ?? 120 }))
  // The file list can't be drawn without its name column.
  return cols.some(c => c.id === 'name') ? cols : undefined
}

function cleanTab(t: unknown) {
  if (!isObj(t) || !Array.isArray(t.path) || !t.path.length || t.path.length > 64 || !t.path.every(x => isStr(x) && x.length <= 260)) return null
  // `\\.\pipe\…` and the like are not folders.
  if (rootOf(t.path[0]).device) return null
  return {
    path: t.path as string[],
    title: isStr(t.title) ? cut(t.title, 260) : undefined,
    columns: cleanColumns(t.columns),
    pinned: t.pinned === true ? true : undefined,
    sortKey: COL_IDS.includes(t.sortKey) ? t.sortKey : undefined,
    sortDir: t.sortDir === 1 || t.sortDir === -1 ? t.sortDir : undefined,
  }
}

function cleanLayout(g: unknown, budget: { tabs: number }) {
  if (!isObj(g) || !Array.isArray(g.panes)) return null
  const panes = g.panes
    .map((p: unknown) => {
      if (!isObj(p) || !Array.isArray(p.tabs) || budget.tabs <= 0) return null
      const tabs = p.tabs.map(cleanTab).filter(Boolean).slice(0, Math.min(MAX_TABS, budget.tabs))
      budget.tabs -= tabs.length
      return tabs.length ? { active: int(p.active), tabs } : null
    })
    .filter(Boolean)
    .slice(0, MAX_PANES)
  if (!panes.length) return null
  // At most MAX_ROWS rows: more columns when the file has more panes than
  // its columns allow, and past MAX_COLS the extra panes go.
  const cols = Math.min(MAX_COLS, Math.max(int(g.gridCols) || 1, Math.ceil(panes.length / MAX_ROWS)))
  return {
    id: isStr(g.id) ? cut(g.id, 64) : undefined,
    name: isStr(g.name) ? cut(g.name, 100) : undefined,
    gridCols: cols,
    activePane: int(g.activePane),
    panes: panes.slice(0, cols * MAX_ROWS),
  }
}

/** A workspace with only the fields `applyWorkspace` reads, or null when it
 * has nothing it could open. Old single-group files (`panes` at the top)
 * become one group. */
export function cleanSession(d: unknown): object | null {
  if (!isObj(d)) return null
  const raw = Array.isArray(d.layouts) ? d.layouts : Array.isArray(d.panes) ? [{ panes: d.panes, gridCols: d.gridCols, activePane: d.activePane }] : []
  const budget = { tabs: MAX_WS_TABS }
  const layouts = raw.slice(0, MAX_GROUPS * 4).map(g => cleanLayout(g, budget)).filter(Boolean).slice(0, MAX_GROUPS)
  if (!layouts.length) return null
  return {
    v: 2,
    layouts,
    activeLayout: int(d.activeLayout),
    colFracs: fracs(d.colFracs, MAX_COLS),
    rowFracs: fracs(d.rowFracs, MAX_ROWS),
    sidebarW: num(d.sidebarW, 180, 420),
    sidebarHidden: isBool(d.sidebarHidden) ? d.sidebarHidden : undefined,
    inspectorW: num(d.inspectorW, 300, 620),
    inspectorOpen: isBool(d.inspectorOpen) ? d.inspectorOpen : undefined,
  }
}

/** Largest workspace file `load_workspace` (workspaces.rs) reads. */
export const WS_MAX_BYTES = 4 * 1024 * 1024
/** Bytes of a workspace as it is saved (compact JSON): one over the limit
 * would save fine and then never open. */
const wsTooBig = (data: object) => new TextEncoder().encode(JSON.stringify(data)).length > WS_MAX_BYTES

export type WorkspaceInfo =
  | { ok: true; data: object; unc: string[]; missingDrives: string[] }
  | { ok: false; reason: string }

/** A saved workspace file, checked like an imported one: it may have been
 * copied in from another PC, or edited by hand. */
export function inspectWorkspace(text: string, drives: readonly string[]): WorkspaceInfo {
  let d: unknown
  try { d = JSON.parse(text) } catch { return { ok: false, reason: 'JSON として読めません' } }
  if (isObj(d) && d.kind === BUNDLE_KIND) return { ok: false, reason: '設定の書き出しファイルです。「読み込む」から取り込んでください' }
  const data = cleanSession(d)
  if (!data) return { ok: false, reason: '開けるタブがありません' }
  if (wsTooBig(data)) return { ok: false, reason: `大きすぎます（${WS_MAX_BYTES / 1048576} MB まで）` }
  return { ok: true, data, ...scanRoots(tabPaths(data), drives) }
}

function tabPaths(session: any): string[] {
  const out: string[] = []
  for (const g of session.layouts) for (const p of g.panes) for (const t of p.tabs) {
    const [head, ...rest] = t.path as string[]
    out.push(rest.length ? head + '\\' + rest.join('\\') : head)
  }
  return out
}

/** `名前 (2)`, `名前 (3)` … — the first one not in `taken` (case-insensitive,
 * as Windows file names are). The name is shortened to leave room for the
 * suffix: past 120 characters the file name would lose it and land on the
 * name it was meant to avoid. */
export function freeName(name: string, taken: Iterable<string>): string {
  const t = new Set([...taken].map(x => x.toLowerCase()))
  if (!t.has(name.toLowerCase())) return name
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const c = cleanWorkspaceName([...name].slice(0, MAX_NAME - suffix.length).join('') + suffix)
    if (!t.has(c.toLowerCase())) return c
  }
}

// ---- appearance / behavior ----

const OPT_CHECK: { [K in keyof AppearanceOptions]?: (v: unknown) => boolean } = {
  accent: v => v === null || (isStr(v) && /^#[0-9a-f]{6}$/i.test(v)),
  fontSize: v => Number.isInteger(v) && (v as number) >= 11 && (v as number) <= 16,
  rowHeight: oneOf('compact', 'standard', 'loose'),
  iconSize: oneOf(16, 24, 32),
  radius: oneOf('sharp', 'medium', 'round'),
  zebra: isBool,
  dimInactive: isBool,
  anim: oneOf('on', 'reduce', 'off'),
}

const OPT_LABEL: Record<string, string> = {
  accent: 'アクセントカラー', fontSize: 'フォントサイズ', rowHeight: '行の高さ', iconSize: 'アイコンサイズ',
  radius: '角丸', zebra: 'ゼブラストライプ', dimInactive: '非アクティブペインを薄く', anim: 'アニメーション',
}

/** A pattern the regex engine can take a very long time on: very long, a
 * quantified group that itself repeats or alternates — `(a+)+`, `(a|aa)*` —
 * or many quantifiers (`a*a*a*a*b`). Optional parts and alternatives add up
 * as well: each `.?` or `a|b` doubles the ways a failing match is retried,
 * so twenty of them took seconds on one file name.
 * ponytail: a heuristic, not a proof; it errs on the side of "risky". A real
 * guarantee needs a linear-time engine or matching off the UI thread. */
export function riskyPattern(p: string): boolean {
  if (p.length > 300) return true
  // Escapes and [...] match one character; `(?:`, `(?=` … and the lazy `?`
  // of `+?` open no extra branches.
  const bare = p.replace(/\\.|\[(?:\\.|[^\]\\])*\]/gs, 'x').replace(/\(\?(<?[=!]|:|<)?/g, '(').replace(/([+*?}])\?/g, '$1')
  if ((bare.match(/[+*]|\{\d*,\d*\}/g) ?? []).length > 3) return true
  if ((bare.match(/[+*?|]|\{\d/g) ?? []).length > 6) return true
  const open: number[] = []
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '\\') { i++; continue }
    if (c === '[') { while (i < p.length && p[i] !== ']') { if (p[i] === '\\') i++; i++ } continue }
    if (c === '(') open.push(i)
    else if (c === ')') {
      const from = open.pop() ?? 0
      if (/[+*{]/.test(p[i + 1] ?? '') && /[+*{|?]/.test(p.slice(from + 1, i))) return true
    }
  }
  return false
}

// ---- reading ----

/** Items per section an import takes, so the state after it still fits the
 * next automatic backup (BUNDLE_MAX_BYTES) and the preview stays drawable. */
export const LIMITS = { workspaces: 200, themes: 100, bookmarks: 500, pins: 500, notes: 2000, genRules: 100 }
/** Reasons listed per section, and the length of each. */
const ISSUE_MAX = 50
const ISSUE_LEN = 100
/** A value from the file, short enough to quote in a reason. */
const q = (v: unknown) => cut(isStr(v) ? v : String(JSON.stringify(v)), 40)

/** The folder key `noteKey` (bridge.ts) makes: backslashes, no trailing
 * separator, lower case. A key in any other form never matches a folder. */
export function normalizeNoteKey(k: string): string {
  const abs = k.replace(/\//g, '\\')
  return (abs.replace(/\\+$/, '') || abs).toLowerCase()
}

/** Checks an export file. Errors that make the whole file unusable come
 * back as `error`; anything smaller drops just that item, with the reason in
 * `issues`, so one bad entry doesn't throw away the rest. */
export function readBundle<T>(text: string, ctx: ReadCtx<T>): { ok: false; error: string } | ({ ok: true } & ImportPreview<T>) {
  let data: unknown
  try { data = JSON.parse(text) } catch { return { ok: false, error: 'JSON として読めません。FlexExplorer で書き出したファイルか確かめてください' } }
  if (!isObj(data) || data.kind !== BUNDLE_KIND) return { ok: false, error: 'FlexExplorer の書き出しファイルではありません' }
  if (typeof data.v !== 'number' || data.v > BUNDLE_V) return { ok: false, error: `このファイルは新しい版の FlexExplorer（${isStr(data.app) ? q(data.app) : '不明'}）で書き出されています。アプリを更新してから読み込んでください` }
  const s = isObj(data.sections) ? data.sections : {}
  const restore = data.autoBackup === true || ctx.asBackup === true
  const issues: Partial<Record<SectionId, string[]>> = {}
  const more: Partial<Record<SectionId, number>> = {}
  const issue = (id: SectionId, msg: string) => {
    const list = (issues[id] ??= [])
    if (list.length < ISSUE_MAX) list.push(cut(msg, ISSUE_LEN))
    else more[id] = (more[id] ?? 0) + 1
  }
  /** The first `max` of `xs`, saying how many were left out. */
  const capped = <X,>(id: SectionId, what: string, xs: X[], max: number): X[] => {
    if (xs.length > max) issue(id, `${what}が多すぎるため、先頭の ${max}件だけ読みます（残り ${xs.length - max}件）`)
    return xs.slice(0, max)
  }
  const clean: CleanSections<T> = {}
  const pathsSeen: string[] = []
  const themeClash: string[] = []

  // themes first: the appearance section may select one of them
  const themeKeys = new Set(ctx.themeKeys)
  if (Array.isArray(s.themes)) {
    clean.themes = []
    capped('themes', '自作テーマ', s.themes, LIMITS.themes).forEach((t: unknown, i: number) => {
      const r = ctx.parseTheme(JSON.stringify(t))
      if (!r.ok) { issue('themes', `${i + 1}件目: ${r.errors.join('、')}`); return }
      if (ctx.themeKeys.has(r.theme.key)) themeClash.push(cut(String((r.theme as any).label || r.theme.key), 40))
      clean.themes!.push(r.theme)
      themeKeys.add(r.theme.key)
    })
  }

  if (isObj(s.appearance)) {
    const a = s.appearance
    const opt: Partial<AppearanceOptions> = {}
    if (isObj(a.opt)) {
      for (const [k, check] of Object.entries(OPT_CHECK)) {
        if (!(k in a.opt)) continue
        if (check!(a.opt[k])) (opt as any)[k] = a.opt[k]
        else issue('appearance', `${OPT_LABEL[k]}: 使えない値 ${q(a.opt[k])}`)
      }
    }
    let theme: string | undefined
    if (isStr(a.theme)) {
      if (themeKeys.has(a.theme)) theme = a.theme
      else issue('appearance', `テーマ「${q(a.theme)}」がこの PC にもファイルにもないため、今のテーマのままにします`)
    }
    clean.appearance = { theme, opt }
  }

  if (isObj(s.behavior)) {
    const b = s.behavior
    const adv: Partial<AdvancedState> = {}
    // Unknown keys are settings this version doesn't have (or no longer has).
    if (isObj(b.adv)) for (const k of ctx.advKeys) if (isBool(b.adv[k])) (adv as any)[k] = b.adv[k]
    let genRules: GenerationRule[] | undefined
    if (Array.isArray(b.genRules)) {
      genRules = []
      capped('behavior', '世代ルール', b.genRules, LIMITS.genRules).forEach((r: unknown, i: number) => {
        if (!isObj(r) || !isStr(r.pattern)) { issue('behavior', `世代ルール ${i + 1}件目: 形が違います`); return }
        const label = isStr(r.label) ? cut(r.label, 100) : ''
        const name = label ? q(label) : String(i + 1)
        try { new RegExp(r.pattern) } catch { issue('behavior', `世代ルール「${name}」: 正規表現が正しくありません`); return }
        const risky = riskyPattern(r.pattern)
        if (risky && r.on !== false) issue('behavior', `世代ルール「${name}」: 時間がかかりうる式なのでオフで取り込みます。中身を確かめてからオンにしてください`)
        genRules!.push({ id: 'r' + Math.random().toString(36).slice(2, 8), on: r.on !== false && !risky, label, pattern: r.pattern })
      })
    }
    clean.behavior = { adv, genHighlight: isBool(b.genHighlight) ? b.genHighlight : undefined, genRules }
  }

  if (isObj(s.shortcuts)) {
    const binds: Record<string, string> = {}
    const owner = new Map<string, string>()
    if (isObj(s.shortcuts.binds)) {
      for (const [id, raw] of Object.entries(s.shortcuts.binds)) {
        if (!ctx.actionIds.has(id)) { issue('shortcuts', `知らない操作「${q(id)}」`); continue }
        if (raw === '') { binds[id] = ''; continue }
        const combo = isStr(raw) ? normalizeCombo(raw) : null
        if (!combo) { issue('shortcuts', `${id}: キーとして読めません ${q(raw)}`); continue }
        if (isReservedCombo(combo)) { issue('shortcuts', `${id}: ${combo} はアプリが固定で使うキーです`); continue }
        const prev = owner.get(combo)
        if (prev) { issue('shortcuts', `${id}: ${combo} は ${prev} と重なっています`); continue }
        owner.set(combo, id)
        binds[id] = combo
      }
    }
    let quickOpenHotkey: string | undefined
    const hk = s.shortcuts.quickOpenHotkey
    if (hk !== undefined) {
      const c = isStr(hk) ? normalizeCombo(hk) : null
      if (c && globalHotkeyOk(c)) quickOpenHotkey = c
      else issue('shortcuts', `グローバルホットキー: 使えないキー ${q(hk)}（Ctrl+Alt・Ctrl+Shift・Alt+Shift のどれかを含めてください）`)
    }
    const unbind: string[] = []
    for (const [id, combo] of Object.entries(ctx.binds ?? {})) {
      const to = combo && owner.get(combo)
      if (to && !(id in binds)) { unbind.push(id); issue('shortcuts', `${combo} を ${to} に使うため、今の ${id} の割り当てを外します`) }
    }
    clean.shortcuts = { binds, quickOpenHotkey, unbind }
  }

  if (isObj(s.places)) {
    const bookmarks: Bookmark[] = []
    if (Array.isArray(s.places.bookmarks)) {
      for (const b of capped('places', 'ブックマーク', s.places.bookmarks, LIMITS.bookmarks)) {
        if (isObj(b) && isStr(b.path) && b.path && b.path.length <= 1024 && !rootOf(b.path).device) {
          bookmarks.push({ path: b.path, label: isStr(b.label) ? cut(b.label, 100) : b.path })
          pathsSeen.push(b.path)
        } else issue('places', 'ブックマーク: 形が違う項目を飛ばしました')
      }
    }
    const pins = Array.isArray(s.places.pins) ? capped('places', 'ピン', s.places.pins.filter((p: unknown) => isStr(p) && p.length <= 1024), LIMITS.pins) : []
    clean.places = { bookmarks, pins }
  }

  if (isObj(s.workspaces)) {
    const entries = capped('workspaces', 'ワークスペース', Object.entries(s.workspaces), LIMITS.workspaces)
    const taken = new Set([...ctx.existingWorkspaces, ...entries.map(([n]) => cleanWorkspaceName(n))])
    const seen = new Set<string>()
    clean.workspaces = []
    for (const [rawName, rawData] of entries) {
      const name = cleanWorkspaceName(rawName)
      if (!name) { issue('workspaces', `名前が使えないものを飛ばしました: ${q(rawName)}`); continue }
      if (seen.has(name.toLowerCase())) { issue('workspaces', `「${q(name)}」がファイルの中で重なっています。最初のものだけ使います`); continue }
      seen.add(name.toLowerCase())
      const data = cleanSession(rawData)
      if (!data) { issue('workspaces', `「${q(name)}」: 開けるタブがありません`); continue }
      if (wsTooBig(data)) { issue('workspaces', `「${q(name)}」: 大きすぎます（${WS_MAX_BYTES / 1048576} MB まで）`); continue }
      const paths = tabPaths(data)
      pathsSeen.push(...paths)
      const exists = ctx.existingWorkspaces.some(w => w.toLowerCase() === name.toLowerCase())
      const altName = exists ? freeName(name, taken) : name
      taken.add(altName)
      // A backup puts back what was there, so it replaces by default.
      clean.workspaces.push({ name, data, exists, altName, choice: exists ? (restore ? 'overwrite' : 'rename') : 'add', ...scanRoots(paths, ctx.drives) })
    }
    if (isStr(s.defaultWorkspace)) {
      const d = cleanWorkspaceName(s.defaultWorkspace).toLowerCase()
      const w = clean.workspaces.find(x => x.name.toLowerCase() === d)
      if (w) clean.defaultWorkspace = w.name
    }
  }

  if (isObj(s.notes)) {
    const notes: Record<string, FolderNote> = {}
    const from = new Map<string, string>()
    for (const [k, v] of Object.entries(s.notes)) {
      // Keys are folder paths (noteKey in bridge.ts); anything else, such as
      // "__proto__", would never match a folder anyway.
      const root = rootOf(k)
      if (k.length > 1024 || (!root.unc && !root.drive) || /^[\\/]{2}[?.][\\/]/.test(k)) { issue('notes', `付箋「${q(k)}」: フォルダのパスではありません`); continue }
      if (!isObj(v) || !isStr(v.text)) { issue('notes', `付箋「${q(k)}」: 形が違います`); continue }
      const key = normalizeNoteKey(k)
      const prev = from.get(key)
      if (prev !== undefined) { issue('notes', `付箋「${q(k)}」: 「${q(prev)}」と同じフォルダです。先のものだけ使います`); continue }
      if (from.size >= LIMITS.notes) { issue('notes', `付箋が多すぎるため、先頭の ${LIMITS.notes}件だけ読みます`); break }
      from.set(key, k)
      notes[key] = {
        text: v.text,
        h: typeof v.h === 'number' && Number.isFinite(v.h) ? Math.max(64, Math.min(520, Math.round(v.h))) : 140,
        collapsed: v.collapsed === true,
        updated: isStr(v.updated) ? cut(v.updated, 40) : undefined,
      }
    }
    clean.notes = notes
  }

  for (const [id, n] of Object.entries(more)) issues[id as SectionId]!.push(`ほか ${n}件`)

  return {
    ok: true,
    app: isStr(data.app) ? cut(data.app, 40) : '',
    exportedAt: isStr(data.exportedAt) ? cut(data.exportedAt, 40) : '',
    restore,
    themeClash,
    clean,
    issues,
    ...scanRoots(pathsSeen, ctx.drives),
  }
}

/** Sections the file carries something in. Restoring a backup also takes
 * a section that is there but empty: no notes then means no notes now. */
export function presentSections(c: CleanSections, restore = false): SectionId[] {
  return SECTIONS.map(x => x.id).filter(id => sectionCount(c, id) > 0 || (restore && c[id] !== undefined))
}

/** How many things a section holds, for the preview ("12件"). */
export function sectionCount(c: CleanSections, id: SectionId): number {
  switch (id) {
    case 'appearance': return c.appearance ? Object.keys(c.appearance.opt).length + (c.appearance.theme ? 1 : 0) : 0
    case 'behavior': return c.behavior ? Object.keys(c.behavior.adv).length + (c.behavior.genHighlight !== undefined ? 1 : 0) + (c.behavior.genRules?.length ?? 0) : 0
    case 'shortcuts': return c.shortcuts ? Object.keys(c.shortcuts.binds).length + (c.shortcuts.quickOpenHotkey ? 1 : 0) : 0
    case 'places': return c.places ? c.places.bookmarks.length + c.places.pins.length : 0
    case 'themes': return c.themes?.length ?? 0
    case 'workspaces': return c.workspaces?.length ?? 0
    case 'notes': return c.notes ? Object.keys(c.notes).length : 0
  }
}

/** "20261029-1000" — part of an export's file name. */
export function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
