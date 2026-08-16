import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { THEMES } from 'flex-design/themes/presets.js'
import { applyTheme } from 'flex-design/runtime/theme.js'
import type { AppState, FileEntry, Pane, PaneTab, RenameRule, OptTab, ColumnId, LayoutGroup, FolderNote } from '../types'
import { fmt, fmtDate, hashStr, uidFor, applyRules, visibleIndices } from '../utils/fileUtils'
import {
  isTauri, isRealPath, listDir, listDrives, homeDir, launchPath, openPath, splitPath, joinPath, renamePath,
  copyEntries, moveEntries, deleteEntries, createFolder, createNewItem as bridgeCreateNewItem, searchDir, copyText,
  shellVerb, showShellContextMenu, createShortcut, createPathShortcutText, revealInExplorer, openInTerminal, openInVscode, duplicateAsDatedCopy,
  saveWorkspace, listWorkspaces, loadWorkspace, deleteWorkspace,
  noteKey, notesLoad, notesSet, notesDelete,
  externalToolsStatus, tortoiseSvnCommand, winmergeCompare,
} from '../fs/bridge'

const F = (name: string, o: Partial<FileEntry> = {}): FileEntry => ({ name, ...o })

// Default column layout; each tab gets an independent copy.
function defCols(): import('../types').ColumnDef[] {
  return [{ id: 'name', w: 260 }, { id: 'date', w: 124 }, { id: 'size', w: 84 }]
}

function makePane0(): Pane {
  const webapp: FileEntry[] = [
    F('src', { folder: true }), F('public', { folder: true }), F('node_modules', { folder: true, dim: true }),
    F('dist', { folder: true }), F('.git', { folder: true, dim: true }),
    F('package.json', { ext: 'json', size: 2148, m: '2026/06/21 18:44', c: '2026/05/02 09:10', pv: 'json' }),
    F('package-lock.json', { ext: 'json', size: 284517, m: '2026/06/21 18:44', c: '2026/05/02 09:10' }),
    F('tsconfig.json', { ext: 'json', size: 712, m: '2026/06/10 10:15', c: '2026/05/02 09:10' }),
    F('vite.config.ts', { ext: 'ts', size: 986, m: '2026/06/15 16:20', c: '2026/05/02 09:12' }),
    F('README.md', { ext: 'md', size: 4320, m: '2026/06/19 13:05', c: '2026/05/02 09:00', pv: 'readme' }),
    F('.gitignore', { ext: '', size: 210, m: '2026/06/01 09:00', c: '2026/05/02 09:00' }),
    F('設計メモ_アーキテクチャ検討_v3.md', { ext: 'md', size: 8861, m: '2026/06/23 20:14', c: '2026/06/08 14:00', pv: 'memo' }),
    F('議事録_2026-06-12_キックオフ.docx', { ext: 'docx', size: 34201, m: '2026/06/12 17:30', c: '2026/06/12 17:30' }),
  ]
  const mk = (title: string, path: string[], files: FileEntry[], focus?: number): PaneTab => ({
    id: title + Math.random().toString(36).slice(2), title, path, files,
    focus: focus || 0, sel: [focus || 0], columns: defCols(),
  })
  return {
    active: 0,
    tabs: [
      mk('webapp', ['C:', 'Users', 'dev', 'projects', 'webapp'], webapp, 9),
    ],
  }
}

function makePane1(): Pane {
  const shiryo: FileEntry[] = [
    F('アーカイブ', { folder: true }), F('共有フォルダ_チーム全体', { folder: true }),
    F('第3四半期_売上報告書_最終版_2026.xlsx', { ext: 'xlsx', size: 128440, m: '2026/06/24 19:02', c: '2026/06/20 10:00', pv: 'sheet' }),
    F('プレゼン資料_製品ロードマップ_v2_修正版.pptx', { ext: 'pptx', size: 2048112, m: '2026/06/22 11:20', c: '2026/06/15 10:00' }),
    F('会議議事録（プロジェクトキックオフ）2026年6月.md', { ext: 'md', size: 6210, m: '2026/06/12 18:00', c: '2026/06/12 18:00', pv: 'memo' }),
    F('スクリーンショット 2026-06-20 14.33.05.png', { ext: 'png', size: 842310, m: '2026/06/20 14:33', c: '2026/06/20 14:33', pv: 'image', dim2: '2560 × 1440' }),
    F('請求書_株式会社サンプル商事_20260601.pdf', { ext: 'pdf', size: 98220, m: '2026/06/01 10:00', c: '2026/06/01 10:00' }),
    F('予算管理表_2026年度上期.xlsx', { ext: 'xlsx', size: 54300, m: '2026/06/15 14:00', c: '2026/04/01 10:00', pv: 'sheet' }),
    F('メモ.txt', { ext: 'txt', size: 340, m: '2026/06/24 09:12', c: '2026/06/24 09:12', pv: 'text' }),
  ]
  const mk = (title: string, path: string[], files: FileEntry[], focus?: number): PaneTab => ({
    id: title + Math.random().toString(36).slice(2), title, path, files,
    focus: focus || 0, sel: [focus || 0], columns: defCols(),
  })
  return {
    active: 0,
    tabs: [
      mk('2026年度資料', ['D:', '資料', '2026年度'], shiryo, 5),
    ],
  }
}

const SHORTCUT_GROUPS = [
  { title: 'ナビゲーション', items: [['nav.up','上の項目へ','↑'],['nav.down','下の項目へ','↓'],['nav.parent','親フォルダへ','Alt+↑'],['nav.back','戻る','Alt+←'],['nav.forward','進む','Alt+→'],['nav.open','開く / フォルダへ','Enter'],['nav.newtab','新しいタブ','Ctrl+T'],['nav.closetab','タブを閉じる','Ctrl+W'],['cmd.goto','GoTo','Ctrl+G'],['view.split','ペインを切替','Ctrl+\\']] },
  { title: '表示', items: [['view.inspector','Inspector を開閉','Space'],['cmd.palette','コマンドパレット','Ctrl+Shift+P'],['cmd.options','オプション','Ctrl+,'],['view.density','表示密度を切替','Ctrl+Shift+D'],['view.theme','テーマを切替','Ctrl+Shift+L'],['view.sidebar','サイドバーを開閉','Ctrl+B']] },
  { title: '編集', items: [['edit.copy','コピー','Ctrl+C'],['edit.cut','切り取り','Ctrl+X'],['edit.paste','貼り付け','Ctrl+V'],['edit.rename','名前の変更','F2'],['edit.bulk','一括リネーム','Ctrl+Shift+R'],['edit.delete','削除','Del'],['edit.copypath','パスをコピー','Ctrl+Shift+C']] },
  { title: '検索', items: [['find.filter','フィルタ検索','Ctrl+F'],['find.global','グローバル検索','Ctrl+Shift+F']] },
]

function defaultBinds(): Record<string, string> {
  const b: Record<string, string> = {}
  SHORTCUT_GROUPS.forEach(g => g.items.forEach(i => { b[i[0]] = i[2] }))
  return b
}

function rid() { return 'r' + Math.random().toString(36).slice(2, 8) }

function defaultRules(): RenameRule[] {
  return [
    { id: rid(), type: 'replace', on: true, find: '_v\\d+', repl: '', regex: true },
    { id: rid(), type: 'seq', on: true, start: '1', digits: '3', sep: '_' },
  ]
}

function ruleDefaults(type: RenameRule['type']): RenameRule {
  const d: RenameRule = { id: rid(), type, on: true }
  if (type === 'replace') Object.assign(d, { find: '', repl: '', regex: false })
  if (type === 'affix') Object.assign(d, { prefix: '', suffix: '' })
  if (type === 'seq') Object.assign(d, { start: '1', digits: '3', sep: '_' })
  if (type === 'date') Object.assign(d, { source: 'modified', fmt: 'YYYY-MM-DD' })
  if (type === 'uid') Object.assign(d, { mode: 'short', sep: '_' })
  return d
}

function clonePanes(panes: Pane[]): Pane[] {
  return panes.map(p => ({ active: p.active, tabs: p.tabs.map(t => ({ ...t, sel: [...t.sel] })) }))
}

function activeTab(s: AppState): PaneTab {
  const p = s.panes[s.activePane]
  return p.tabs[p.active]
}

/** Id of the currently active layout group, used to namespace per-pane nav history. */
function curLayoutId(s: AppState): string {
  return s.layouts[s.activeLayout]?.id || 'default'
}

const MAX_PANES = 9
const MAX_COLS = 4
const MAX_ROWS = 3

/** Create a new single-tab pane showing the same folder as `src`. */
function makePaneFrom(src: PaneTab): Pane {
  return {
    active: 0,
    tabs: [{
      id: 'p' + rid(),
      title: src.title,
      path: [...src.path],
      files: src.files,
      focus: src.focus,
      sel: [...src.sel],
      columns: defCols(),
    }],
  }
}

/** Absolute paths of the currently selected entries (handles search results). */
function selectedAbs(t: PaneTab): string[] {
  return t.sel.map(i => t.files[i]).filter(Boolean).map(f => f.abs || joinPath([...t.path, f.name]))
}

/** Absolute path of the focused entry, or null. */
function focusedAbs(t: PaneTab): string | null {
  const f = t.files[t.focus]
  if (!f) return null
  return f.abs || joinPath([...t.path, f.name])
}

interface Actions {
  // theme
  setTheme(t: string): void
  toggleTheme(): void
  // panes
  selectFile(pi: number, idx: number, e?: React.MouseEvent): void
  openFile(pi: number, idx: number): void
  openFolderTab(pi: number, name: string): void
  // real filesystem navigation (Tauri); no-ops on the plain web build
  navigate(pi: number, segs: string[], opts?: { newTab?: boolean; push?: boolean }): Promise<void>
  navParent(pi: number): void
  navBack(pi: number): void
  navForward(pi: number): void
  navBreadcrumb(pi: number, ci: number): void
  navSidebar(label: string): void
  navPath(path: string, other?: boolean): void
  initTauri(): Promise<void>
  loadDrives(): Promise<void>
  // file operations (Tauri)
  copyToClip(): void
  cutToClip(): void
  paste(): Promise<void>
  deleteSelected(): Promise<void>
  copyPathToClipboard(): Promise<void>
  createNewFolder(): Promise<void>
  createNewItem(kind: string): Promise<void>
  duplicateSelectedAsDatedCopy(): Promise<void>
  // bookmarks
  addBookmark(): void
  removeBookmark(path: string): void
  // global search
  runGlobalSearch(): Promise<void>
  // native shell actions
  shellProperties(): void
  shellNew(): void
  openWith(): void
  revealInExplorer(): void
  openInTerminal(): void
  openInVscode(): void
  createShortcutForSel(): Promise<void>
  createPathShortcutTextForSel(): Promise<void>
  showOsContextMenuForSel(x: number, y: number): Promise<void>
  switchTab(pi: number, ti: number): void
  closeTab(pi: number, ti: number): void
  newTab(pi: number): void
  setActivePane(pi: number): void
  setMaximized(v: boolean): void
  cyclePane(dir: 1 | -1): void
  swapPanes(): void
  swapPanesAt(a: number, b: number): void
  // pane grid
  setGridLayout(preset: 'single' | 'dualH' | 'dualV' | 'triple' | 'quad'): void
  addPaneRight(): void
  addPaneDown(): void
  closePane(pi: number): void
  moveSel(delta: number): void
  focusEdge(which: 'home' | 'end'): void
  typeAhead(ch: string): void
  // layout groups (Tablacus-style tabs bundling a whole pane arrangement)
  switchLayoutGroup(i: number): void
  cycleLayoutGroup(dir: 1 | -1): void
  addLayoutGroup(): void
  closeLayoutGroup(i: number): void
  reopenClosedLayoutGroup(): void
  renameLayoutGroup(i: number, name: string): void
  // tabs: pin / cleanup / restore / drag-reorder / move between panes
  toggleTabPin(pi: number, ti: number): void
  cleanTabs(pi: number): void
  reopenClosedTab(): void
  reorderTabs(pi: number, srcTi: number, destTi: number): void
  moveTabToPane(srcPi: number, srcTi: number, destPi: number, destTi: number): void
  // columns (per active tab of a pane)
  setColumnWidth(pi: number, id: ColumnId, w: number): void
  reorderColumns(pi: number, srcId: ColumnId, destId: ColumnId): void
  startColDrag(pi: number, id: ColumnId, startX: number, startW: number): void
  setSort(pi: number, id: ColumnId): void
  // ui
  toggleInspector(): void
  toggleSidebar(): void
  setSearch(v: string): void
  toggleSearchMode(): void
  setContainerW(w: number): void
  startAddressEdit(pi: number): void
  endAddressEdit(): void
  // drag
  startSidebarDrag(startX: number): void
  startSplitDrag(startX: number, paneW: number): void
  startInspectorDrag(startX: number): void
  dragMove(clientX: number): void
  dragEnd(): void
  // ctx
  openCtx(pi: number, idx: number, x: number, y: number): void
  openCtxBg(pi: number, x: number, y: number): void
  closeCtx(): void
  ctxSearch(q: string): void
  togglePin(id: string): void
  // modal
  openModal(m: 'rename' | 'options' | 'workspaces'): void
  closeModal(): void
  // workspaces (named layout files)
  applyWorkspace(data: SessionData): Promise<void>
  saveWorkspaceAs(name: string): Promise<void>
  loadNamedWorkspace(name: string): Promise<void>
  deleteNamedWorkspace(name: string): Promise<void>
  refreshWorkspaces(): Promise<void>
  // inline rename (F2 / slow second click on a selected row)
  startRename(pi?: number, idx?: number): void
  cancelRename(): void
  commitRename(name: string): Promise<void>
  // folder sticky notes
  loadNotes(): Promise<void>
  /** Create (or reveal) the memo for `path`, defaulting to the active folder. */
  addNote(path?: string[]): void
  setNoteText(key: string, text: string): void
  setNoteHeight(key: string, h: number): void
  toggleNoteCollapsed(key: string): void
  removeNote(key: string): void
  // external tool integration (TortoiseSVN / WinMerge)
  loadExtTools(): Promise<void>
  runTortoiseSvn(cmd: string, paths: string[]): Promise<void>
  runWinMerge(paths: string[]): Promise<void>
  // rename
  addRule(type: RenameRule['type']): void
  removeRule(id: string): void
  updateRule(id: string, patch: Partial<RenameRule>): void
  moveRule(id: string, dir: 1 | -1): void
  reorderRule(srcId: string, destId: string): void
  toggleAddMenu(): void
  applyRename(): void
  // options
  setOptTab(t: OptTab): void
  setOpt<K extends keyof AppState['opt']>(k: K, v: AppState['opt'][K]): void
  setOptTheme(v: string): void
  resetOptCategory(cat: string): void
  toggleAdv(k: keyof AppState['adv']): void
  startCapture(id: string): void
  captureKey(combo: string): void
  exportShortcuts(): void
  importShortcuts(): void
  // palette
  openPalette(): void
  closePalette(): void
  paletteInput(q: string): void
  paletteSel(sel: number): void
  runCommand(id: string): void
  paletteAssign(id: string): void
  // goto
  openGoto(): void
  closeGoto(): void
  gotoInput(q: string): void
  gotoSel(sel: number): void
  navTo(path: string, other?: boolean): void
  // toast
  showToast(msg: string, undo?: string): void
  doUndo(): void
  clearToast(): void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
let dragState: { type: string; startX: number; sidebarW: number; inspectorW: number; pane0Pct: number; paneW: number; colId?: ColumnId; colW?: number; colPi?: number } | null = null
// Per-pane back/forward history of path segments, namespaced by layout group id (used under Tauri).
const histBack: Record<string, string[][]> = {}
const histFwd: Record<string, string[][]> = {}
// Type-ahead (keyboard prefix search) state.
let typeAheadBuf = ''
let typeAheadTime = 0
// Recently-closed tabs, for reopen (Ctrl+Shift+T).
let closedTabStack: PaneTab[] = []
const MAX_CLOSED_TABS = 20
function pushClosedTab(t: PaneTab) {
  closedTabStack.push(t)
  if (closedTabStack.length > MAX_CLOSED_TABS) closedTabStack.shift()
}
// Recently-closed layout groups (whole pane/tab arrangements), for reopen.
let closedGroupStack: LayoutGroup[] = []
const MAX_CLOSED_GROUPS = 10
function pushClosedLayoutGroup(g: LayoutGroup) {
  closedGroupStack.push(g)
  if (closedGroupStack.length > MAX_CLOSED_GROUPS) closedGroupStack.shift()
}
// Debounced session auto-save.
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null
const SESSION_KEY = 'flexexplorer:session'

// Folder notes: min/max panel height, and one debounce timer per folder so
// typing in a memo doesn't rewrite notes.json on every keystroke.
export const NOTE_MIN_H = 64
export const NOTE_MAX_H = 520
const noteSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function saveNoteDebounced(key: string, note: FolderNote) {
  const prev = noteSaveTimers.get(key)
  if (prev) clearTimeout(prev)
  noteSaveTimers.set(key, setTimeout(() => {
    noteSaveTimers.delete(key)
    void notesSet(key, note).catch(() => {})
  }, 500))
}

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface SessionTab {
  path?: string[]
  title?: string
  columns?: import('../types').ColumnDef[]
  pinned?: boolean
  sortKey?: ColumnId | null
  sortDir?: 1 | -1
}
interface SessionPane { active?: number; tabs?: SessionTab[] }
interface SessionLayout { id?: string; name?: string; gridCols?: number; activePane?: number; panes?: SessionPane[] }

interface SessionData {
  v?: number
  // v1 (legacy): a single implicit layout group at the top level.
  gridCols?: number
  activePane?: number
  panes?: SessionPane[]
  // v2: multiple named layout groups.
  layouts?: SessionLayout[]
  activeLayout?: number
  // shared
  sidebarW?: number
  sidebarHidden?: boolean
  inspectorW?: number
  inspectorOpen?: boolean
}

/** Serialize the current view state (all layout groups + open folders) for save/restore. */
function serializeSession(s: AppState): SessionData {
  const layouts: SessionLayout[] = s.layouts.map((g, gi) => {
    const live = gi === s.activeLayout
    const panes = live ? s.panes : g.panes
    return {
      id: g.id,
      name: g.name,
      gridCols: live ? s.gridCols : g.gridCols,
      activePane: live ? s.activePane : g.activePane,
      panes: panes.map(p => ({
        active: p.active,
        tabs: p.tabs.map(t => ({ path: t.path, title: t.title, columns: t.columns, pinned: t.pinned, sortKey: t.sortKey, sortDir: t.sortDir })),
      })),
    }
  })
  return {
    v: 2,
    layouts,
    activeLayout: s.activeLayout,
    sidebarW: s.sidebarW,
    sidebarHidden: s.sidebarHidden,
    inspectorW: s.inspectorW,
    inspectorOpen: s.inspectorOpen,
  }
}

export const useStore = create<AppState & Actions>()(persist((set, get) => ({
  theme: 'flex-light',
  activePane: 0,
  inspectorOpen: true,
  search: '',
  searchMode: 'filter',
  sidebarW: 208,
  sidebarHidden: false,
  inspectorW: 320,
  pane0Pct: 50,
  gridCols: 2,
  panes: [makePane0(), makePane1()],
  ctx: null,
  modal: null,
  optTab: 'appearance',
  toast: null,
  undo: null,
  capturing: null,
  binds: defaultBinds(),
  rename: { rules: defaultRules(), addOpen: false },
  adv: { hidden: true, alwaysExt: true, confirmDelete: true, restore: true, explorerCtx: true, quickLaunch: true, jumpType: false, gpu: true, telemetry: false, singleClick: false },
  opt: { theme: 'flex-light', accent: null, fontSize: 13, rowHeight: 'compact', iconSize: 16, radius: 'medium', zebra: false, dimInactive: true, anim: 'on' },
  palette: { open: false, q: '', sel: 0 },
  goto: { open: false, q: '', sel: 0 },
  pins: ['vscode', 'copypath'],
  recent: ['view.inspector', 'edit.bulk', 'find.filter'],
  maximized: false,
  containerW: 900,
  drives: [],
  bookmarks: [],
  recentPaths: [],
  clip: null,
  home: '',
  workspaces: [],
  layouts: [{ id: 'g' + rid(), name: 'グループ 1', panes: [], gridCols: 2, activePane: 0 }],
  activeLayout: 0,
  addressEdit: null,
  notes: {},
  renaming: null,
  extTools: { tortoiseSvn: false, winmerge: false },

  setTheme: (t) => { applyTheme(t, document.documentElement); set({ theme: t, opt: { ...get().opt, theme: t } }) },
  toggleTheme: () => {
    const base = THEMES[get().theme]?.base ?? 'light'
    const t = base === 'light' ? 'flex-dark' : 'flex-light'
    applyTheme(t, document.documentElement)
    set({ theme: t, opt: { ...get().opt, theme: t } })
  },

  selectFile: (pi, idx, e) => {
    set(s => {
      const panes = clonePanes(s.panes)
      const t = panes[pi].tabs[panes[pi].active]
      if (e?.ctrlKey) {
        const set2 = new Set(t.sel); set2.has(idx) ? set2.delete(idx) : set2.add(idx); t.sel = [...set2]; t.focus = idx
      } else if (e?.shiftKey) {
        const a = Math.min(t.focus, idx), b = Math.max(t.focus, idx)
        const r: number[] = []; for (let i = a; i <= b; i++) r.push(i); t.sel = r
      } else { t.sel = [idx]; t.focus = idx }
      return { panes, activePane: pi, ctx: null }
    })
  },

  openFile: (pi, idx) => {
    const s = get()
    const tab = s.panes[pi].tabs[s.panes[pi].active]
    const f = tab.files[idx]
    if (!f) return
    // Search result: navigate to / open the absolute path it carries.
    if (f.abs) {
      const segs = splitPath(f.abs)
      if (f.folder) { void get().navigate(pi, segs); return }
      if (isTauri) { openPath(segs).catch(err => get().showToast('開けません: ' + String(err))); set({ inspectorOpen: true }); return }
    }
    if (f.folder) { get().openFolderTab(pi, f.name); return }
    if (isTauri && isRealPath(tab.path)) {
      openPath([...tab.path, f.name]).catch(err => get().showToast('開けません: ' + String(err)))
      set({ inspectorOpen: true })
      return
    }
    set({ inspectorOpen: true }); get().showToast('開く: ' + f.name)
  },

  openFolderTab: (pi, name) => {
    const cur = get().panes[pi].tabs[get().panes[pi].active].path
    if (isTauri && isRealPath(cur)) { void get().navigate(pi, [...cur, name]); return }
    const kids: FileEntry[] = [
      F(name + '_assets', { folder: true }),
      F('index.json', { ext: 'json', size: 420, m: '2026/06/24 10:00', c: '2026/06/24 10:00', pv: 'json' }),
      F('メモ.txt', { ext: 'txt', size: 120, m: '2026/06/24 10:00', c: '2026/06/24 10:00', pv: 'text' }),
    ]
    set(s => {
      const panes = clonePanes(s.panes); const p = panes[pi]
      const path = [...p.tabs[p.active].path, name]
      p.tabs.push({ id: name + Math.random().toString(36).slice(2), title: name, path, files: kids, focus: 0, sel: [0], columns: defCols() })
      p.active = p.tabs.length - 1
      return { panes, activePane: pi }
    })
  },

  navigate: async (pi, segs, opts) => {
    if (!isTauri || !isRealPath(segs)) return
    let files: FileEntry[]
    try { files = await listDir(segs) }
    catch (err) { get().showToast('開けません: ' + String(err)); return }
    // record history unless navigating into a fresh tab or replaying history
    if (opts?.push !== false && !opts?.newTab) {
      const cur = get().panes[pi].tabs[get().panes[pi].active].path
      if (isRealPath(cur) && cur.join('\\') !== segs.join('\\')) {
        const key = curLayoutId(get()) + ':' + pi
        ;(histBack[key] ||= []).push(cur)
        histFwd[key] = []
      }
    }
    set(s => {
      const panes = clonePanes(s.panes); const p = panes[pi]
      const title = segs[segs.length - 1] || segs[0]
      const sel = files.length ? [0] : []
      if (opts?.newTab) {
        p.tabs.push({ id: 't' + rid(), title, path: segs, files, focus: 0, sel, columns: defCols() })
        p.active = p.tabs.length - 1
      } else {
        const t = p.tabs[p.active]
        t.title = title; t.path = segs; t.files = files; t.focus = 0; t.sel = sel
      }
      const abs = joinPath(segs)
      const recentPaths = [abs, ...s.recentPaths.filter(rp => rp !== abs)].slice(0, 12)
      return { panes, activePane: pi, recentPaths, renaming: null }
    })
  },

  navParent: (pi) => {
    const cur = get().panes[pi].tabs[get().panes[pi].active].path
    if (cur.length <= 1) return
    if (isTauri && isRealPath(cur)) void get().navigate(pi, cur.slice(0, -1))
    else get().showToast('親フォルダへ')
  },

  navBack: (pi) => {
    const key = curLayoutId(get()) + ':' + pi
    const stack = histBack[key]
    if (!stack || !stack.length) { get().showToast('戻る'); return }
    const prev = stack.pop()!
    const cur = get().panes[pi].tabs[get().panes[pi].active].path
    ;(histFwd[key] ||= []).push(cur)
    void get().navigate(pi, prev, { push: false })
  },

  navForward: (pi) => {
    const key = curLayoutId(get()) + ':' + pi
    const stack = histFwd[key]
    if (!stack || !stack.length) { get().showToast('進む'); return }
    const next = stack.pop()!
    const cur = get().panes[pi].tabs[get().panes[pi].active].path
    ;(histBack[key] ||= []).push(cur)
    void get().navigate(pi, next, { push: false })
  },

  navBreadcrumb: (pi, ci) => {
    const cur = get().panes[pi].tabs[get().panes[pi].active].path
    if (ci >= cur.length - 1) return
    const segs = cur.slice(0, ci + 1)
    if (isTauri && isRealPath(segs)) void get().navigate(pi, segs)
    else get().showToast('移動: ' + cur[ci])
  },

  navSidebar: (label) => {
    if (!isTauri) { get().showToast('移動: ' + label); return }
    const drive = label.match(/\(([A-Za-z]):\)/)
    if (drive) { void get().navigate(get().activePane, [drive[1] + ':']); return }
    const map: Record<string, string> = { 'デスクトップ': 'Desktop', 'ダウンロード': 'Downloads', 'ドキュメント': 'Documents', 'ピクチャ': 'Pictures' }
    const sub = map[label]
    if (sub) { void homeDir().then(h => get().navigate(get().activePane, [...splitPath(h), sub])); return }
    get().showToast('移動: ' + label)
  },

  navPath: (path, other) => {
    const segs = splitPath(path)
    if (isTauri && isRealPath(segs)) {
      const pi = other ? (get().activePane === 0 ? 1 : 0) : get().activePane
      void get().navigate(pi, segs)
    } else {
      get().showToast('移動: ' + path)
    }
  },

  loadDrives: async () => {
    if (!isTauri) return
    try { set({ drives: await listDrives() }) } catch { /* ignore */ }
  },

  initTauri: async () => {
    if (!isTauri) return
    try {
      const [home, drives] = await Promise.all([homeDir(), listDrives()])
      set({ drives, home })
      void get().refreshWorkspaces()
      void get().loadNotes()
      void get().loadExtTools()

      // Launched with a folder argument — an external launcher (BlueWind's
      // "フォルダを開くファイラー" pointed at this exe) or FlexFind's
      // "FlexExplorerで表示" invoking `FlexExplorer.exe "<path>"`. Show that
      // folder immediately; this is an explicit navigation request, so it
      // takes priority over restoring whatever was open last session.
      const startPath = await launchPath()
      if (startPath) {
        const segs = splitPath(startPath)
        await get().navigate(0, segs, { push: false })
        const root = drives[0]?.path ? splitPath(drives[0].path) : ['C:']
        await get().navigate(1, root, { push: false })
        set({ activePane: 0 })
        return
      }

      // Restore the previous session if enabled.
      if (get().adv.restore) {
        try {
          const raw = localStorage.getItem(SESSION_KEY)
          if (raw) {
            await get().applyWorkspace(JSON.parse(raw) as SessionData)
            set({ activePane: 0 })
            return
          }
        } catch { /* fall through to defaults */ }
      }
      const homeSegs = splitPath(home)
      await get().navigate(0, homeSegs.length ? homeSegs : ['C:'], { push: false })
      const root = drives[0]?.path ? splitPath(drives[0].path) : ['C:']
      await get().navigate(1, root, { push: false })
      set({ activePane: 0 })
    } catch (err) { get().showToast('初期化に失敗: ' + String(err)) }
  },

  copyToClip: () => {
    const t = activeTab(get())
    const paths = selectedAbs(t)
    if (!paths.length) return
    set({ clip: { mode: 'copy', paths } })
    get().showToast(paths.length + ' 件をコピー')
  },

  cutToClip: () => {
    const t = activeTab(get())
    const paths = selectedAbs(t)
    if (!paths.length) return
    set({ clip: { mode: 'cut', paths } })
    get().showToast(paths.length + ' 件を切り取り')
  },

  paste: async () => {
    const s = get()
    const clip = s.clip
    if (!clip || !clip.paths.length) return
    const pi = s.activePane
    const t = activeTab(s)
    if (!isTauri || !isRealPath(t.path)) return
    try {
      const n = clip.mode === 'copy'
        ? await copyEntries(clip.paths, t.path)
        : await moveEntries(clip.paths, t.path)
      if (clip.mode === 'cut') set({ clip: null })
      await get().navigate(pi, t.path, { push: false })
      get().showToast(`${n} 件を貼り付け`)
    } catch (err) { get().showToast('貼り付け失敗: ' + String(err)) }
  },

  deleteSelected: async () => {
    const s = get()
    const pi = s.activePane
    const t = activeTab(s)
    const paths = selectedAbs(t)
    if (!paths.length) return
    if (!isTauri || !isRealPath(t.path)) { get().showToast('削除: ごみ箱へ移動'); return }
    try {
      const n = await deleteEntries(paths, false)
      await get().navigate(pi, t.path, { push: false })
      get().showToast(`${n} 件をごみ箱へ移動`)
    } catch (err) { get().showToast('削除失敗: ' + String(err)) }
  },

  copyPathToClipboard: async () => {
    const t = activeTab(get())
    const paths = selectedAbs(t)
    if (!paths.length) return
    const ok = await copyText(paths.join('\r\n'))
    get().showToast(ok ? 'パスをコピーしました' : 'パスのコピーに失敗')
  },

  createNewFolder: async () => {
    const s = get()
    const pi = s.activePane
    const t = activeTab(s)
    if (!isTauri || !isRealPath(t.path)) { get().showToast('新しいフォルダー'); return }
    try {
      await createFolder(t.path, '新しいフォルダー')
      await get().navigate(pi, t.path, { push: false })
      get().showToast('フォルダーを作成しました')
    } catch (err) { get().showToast('作成失敗: ' + String(err)) }
  },

  createNewItem: async (kind) => {
    const s = get()
    const pi = s.activePane
    const t = activeTab(s)
    if (!isTauri || !isRealPath(t.path)) { get().showToast('新規作成'); return }
    try {
      await bridgeCreateNewItem(t.path, kind)
      await get().navigate(pi, t.path, { push: false })
      get().showToast('作成しました')
    } catch (err) { get().showToast('作成失敗: ' + String(err)) }
  },

  duplicateSelectedAsDatedCopy: async () => {
    const s = get()
    const pi = s.activePane
    const t = activeTab(s)
    const paths = selectedAbs(t)
    if (paths.length !== 1) { get().showToast('コピーを日付付きで保存'); return }
    try {
      await duplicateAsDatedCopy(paths[0])
      await get().navigate(pi, t.path, { push: false })
      get().showToast('日付付きでコピーしました')
    } catch (err) { get().showToast('コピー失敗: ' + String(err)) }
  },

  addBookmark: () => {
    const t = activeTab(get())
    const path = joinPath(t.path)
    const label = t.path[t.path.length - 1] || t.path[0] || path
    set(s => {
      if (s.bookmarks.some(b => b.path === path)) return {}
      return { bookmarks: [...s.bookmarks, { path, label }] }
    })
    get().showToast('ブックマークに追加しました')
  },

  removeBookmark: (path) => set(s => ({ bookmarks: s.bookmarks.filter(b => b.path !== path) })),

  runGlobalSearch: async () => {
    const s = get()
    const pi = s.activePane
    const t = activeTab(s)
    const query = s.search.trim()
    if (!query) return
    if (!isTauri || !isRealPath(t.path)) { get().showToast('グローバル検索: ' + query); return }
    get().showToast('検索中…')
    try {
      const files = await searchDir(t.path, query, 500)
      set(st => {
        const panes = clonePanes(st.panes); const p = panes[pi]
        p.tabs.push({ id: 't' + rid(), title: '🔍 ' + query, path: t.path, files, focus: 0, sel: files.length ? [0] : [], columns: defCols() })
        p.active = p.tabs.length - 1
        return { panes }
      })
      get().showToast(`${files.length} 件ヒット`)
    } catch (err) { get().showToast('検索失敗: ' + String(err)) }
  },

  shellProperties: () => {
    const abs = focusedAbs(activeTab(get()))
    if (!abs) return
    if (isTauri) shellVerb(abs, 'properties').catch(err => get().showToast('プロパティを開けません: ' + String(err)))
    else get().showToast('プロパティ')
  },

  /** Explorer's own "新規" verb on the focused file — Office apps open an
   * unsaved copy seeded from it, leaving the original untouched. Same behaviour
   * FlexFind exposes; no-op for types that don't register the verb. */
  shellNew: () => {
    const abs = focusedAbs(activeTab(get()))
    if (!abs) return
    if (isTauri) shellVerb(abs, 'new').catch(() => get().showToast('この種類のファイルは「新規」に対応していません'))
    else get().showToast('新規')
  },

  openWith: () => {
    const abs = focusedAbs(activeTab(get()))
    if (!abs) return
    if (isTauri) shellVerb(abs, 'openas').catch(err => get().showToast('開けません: ' + String(err)))
    else get().showToast('プログラムから開く')
  },

  revealInExplorer: () => {
    const abs = focusedAbs(activeTab(get()))
    if (!abs) return
    if (isTauri) revealInExplorer(abs).catch(err => get().showToast('表示できません: ' + String(err)))
    else get().showToast('エクスプローラーで表示')
  },

  openInTerminal: () => {
    const t = activeTab(get())
    if (isTauri && isRealPath(t.path)) openInTerminal(t.path).catch(err => get().showToast('開けません: ' + String(err)))
    else get().showToast('ターミナルで開く')
  },

  openInVscode: () => {
    const t = activeTab(get())
    const f = t.files[t.focus]
    const target = f?.folder ? focusedAbs(t) : joinPath(t.path)
    if (isTauri && target) openInVscode(target).catch(err => get().showToast('VS Code で開けません: ' + String(err)))
    else get().showToast('VS Code で開く')
  },

  createShortcutForSel: async () => {
    const s = get()
    const pi = s.activePane
    const t = activeTab(s)
    const abs = focusedAbs(t)
    if (!abs) return
    if (!isTauri || !isRealPath(t.path)) { get().showToast('ショートカットを作成'); return }
    try {
      await createShortcut(abs)
      await get().navigate(pi, t.path, { push: false })
      get().showToast('ショートカットを作成しました')
    } catch (err) { get().showToast('作成失敗: ' + String(err)) }
  },

  createPathShortcutTextForSel: async () => {
    const s = get()
    const pi = s.activePane
    const t = activeTab(s)
    const abs = focusedAbs(t)
    if (!abs) return
    if (!isTauri || !isRealPath(t.path)) { get().showToast('ショートカットを作成(テキスト)'); return }
    try {
      await createPathShortcutText(abs)
      await get().navigate(pi, t.path, { push: false })
      get().showToast('テキストショートカットを作成しました')
    } catch (err) { get().showToast('作成失敗: ' + String(err)) }
  },

  showOsContextMenuForSel: async (x, y) => {
    const t = activeTab(get())
    const abs = focusedAbs(t)
    if (!abs || !isTauri) { get().showToast('Windows のメニュー'); return }
    try { await showShellContextMenu(abs, x, y) }
    catch (err) { get().showToast('メニューを表示できません: ' + String(err)) }
  },

  switchTab: (pi, ti) => set(s => { const panes = clonePanes(s.panes); panes[pi].active = ti; return { panes, activePane: pi, renaming: null } }),

  closeTab: (pi, ti) => {
    const p = get().panes[pi]
    const t = p?.tabs[ti]
    if (!p || p.tabs.length <= 1) return
    if (t?.pinned) { get().showToast('ピン留めされたタブです'); return }
    set(s => {
      const panes = clonePanes(s.panes); const pp = panes[pi]
      pp.tabs.splice(ti, 1)
      if (pp.active >= pp.tabs.length) pp.active = pp.tabs.length - 1
      else if (ti < pp.active) pp.active--
      return { panes }
    })
    if (t) pushClosedTab(t)
  },

  toggleTabPin: (pi, ti) => set(s => {
    const panes = clonePanes(s.panes); const p = panes[pi]
    const t = p.tabs[ti]
    if (!t) return {}
    const activeId = p.tabs[p.active].id
    t.pinned = !t.pinned
    // Browser-style clustering: pinned tabs stay grouped at the front, in their relative order.
    const pinned = p.tabs.filter(x => x.pinned)
    const unpinned = p.tabs.filter(x => !x.pinned)
    p.tabs = [...pinned, ...unpinned]
    p.active = p.tabs.findIndex(x => x.id === activeId)
    return { panes }
  }),

  cleanTabs: (pi) => {
    const p = get().panes[pi]
    if (!p) return
    const toClose = p.tabs.filter((t, ti) => !t.pinned && ti !== p.active)
    if (!toClose.length) { get().showToast('掃除するタブがありません'); return }
    set(s => {
      const panes = clonePanes(s.panes); const pp = panes[pi]
      const activeId = pp.tabs[pp.active].id
      pp.tabs = pp.tabs.filter(t => t.pinned || t.id === activeId)
      pp.active = Math.max(0, pp.tabs.findIndex(t => t.id === activeId))
      return { panes }
    })
    toClose.forEach(pushClosedTab)
    get().showToast(`${toClose.length} 件のタブを閉じました`)
  },

  reopenClosedTab: () => {
    const t = closedTabStack.pop()
    if (!t) { get().showToast('復元するタブがありません'); return }
    const pi = get().activePane
    const restored: PaneTab = { ...t, id: 't' + rid(), sel: [...t.sel] }
    set(s => {
      const panes = clonePanes(s.panes); const p = panes[pi]
      p.tabs.push(restored)
      p.active = p.tabs.length - 1
      return { panes }
    })
    if (isTauri && isRealPath(restored.path)) {
      listDir(restored.path).then(files => {
        set(st => {
          const panes = clonePanes(st.panes); const p = panes[pi]
          const idx = p.tabs.findIndex(x => x.id === restored.id)
          if (idx >= 0) { p.tabs[idx].files = files; p.tabs[idx].sel = files.length ? [0] : [] }
          return { panes }
        })
      }).catch(() => {})
    }
    get().showToast(`「${t.title}」を復元しました`)
  },

  reorderTabs: (pi, srcTi, destTi) => {
    if (srcTi === destTi) return
    set(s => {
      const panes = clonePanes(s.panes); const p = panes[pi]
      if (srcTi < 0 || srcTi >= p.tabs.length) return {}
      const activeId = p.tabs[p.active].id
      const src = p.tabs[srcTi]
      const pinnedCount = p.tabs.filter(t => t.pinned).length
      // Clamp the drop position to stay within the same pinned/unpinned block as the dragged tab.
      let dest = Math.max(0, Math.min(p.tabs.length - 1, destTi))
      dest = src.pinned ? Math.min(dest, pinnedCount - 1) : Math.max(dest, pinnedCount)
      const tabs = [...p.tabs]
      tabs.splice(srcTi, 1)
      tabs.splice(dest, 0, src)
      p.tabs = tabs
      p.active = p.tabs.findIndex(t => t.id === activeId)
      return { panes }
    })
  },

  moveTabToPane: (srcPi, srcTi, destPi, destTi) => {
    if (srcPi === destPi) { get().reorderTabs(srcPi, srcTi, destTi); return }
    const srcP = get().panes[srcPi]
    if (!srcP || srcTi < 0 || srcTi >= srcP.tabs.length) return
    if (srcP.tabs.length <= 1) { get().showToast('ペインには最低1つのタブが必要です'); return }
    set(s => {
      const panes = clonePanes(s.panes)
      const sp = panes[srcPi]; const dp = panes[destPi]
      const [moved] = sp.tabs.splice(srcTi, 1)
      if (sp.active >= sp.tabs.length) sp.active = sp.tabs.length - 1
      else if (srcTi < sp.active) sp.active--
      const dest = Math.max(0, Math.min(dp.tabs.length, destTi))
      dp.tabs.splice(dest, 0, moved)
      dp.active = dest
      return { panes, activePane: destPi }
    })
  },

  newTab: (pi) => {
    const home: FileEntry[] = [F('デスクトップ', { folder: true }), F('ダウンロード', { folder: true }), F('ドキュメント', { folder: true }), F('ピクチャ', { folder: true })]
    set(s => {
      const panes = clonePanes(s.panes); const p = panes[pi]
      p.tabs.push({ id: 'new' + Math.random().toString(36).slice(2), title: 'PC', path: ['PC'], files: home, focus: 0, sel: [0], columns: defCols() })
      p.active = p.tabs.length - 1
      return { panes, activePane: pi }
    })
  },

  setActivePane: (pi) => { if (get().activePane !== pi) set({ activePane: pi }) },
  setMaximized: (v) => set({ maximized: v }),
  cyclePane: (dir) => set(s => { const n = s.panes.length; return { activePane: (s.activePane + dir + n) % n } }),
  swapPanes: () => set(s => {
    const n = s.panes.length
    if (n < 2) return {}
    const panes = clonePanes(s.panes)
    const a = s.activePane; const b = (a + 1) % n
    const tmp = panes[a]; panes[a] = panes[b]; panes[b] = tmp
    return { panes, activePane: b }
  }),
  swapPanesAt: (a, b) => set(s => {
    const n = s.panes.length
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) return {}
    const panes = clonePanes(s.panes)
    const tmp = panes[a]; panes[a] = panes[b]; panes[b] = tmp
    return { panes, activePane: b }
  }),

  switchLayoutGroup: (i) => {
    const s = get()
    if (i < 0 || i >= s.layouts.length || i === s.activeLayout) return
    // Stash the live state into the currently active group's slot before switching away.
    const layouts = s.layouts.map((g, gi) => gi === s.activeLayout
      ? { ...g, panes: clonePanes(s.panes), gridCols: s.gridCols, activePane: s.activePane }
      : g)
    const target = layouts[i]
    set({
      layouts,
      activeLayout: i,
      panes: clonePanes(target.panes),
      gridCols: target.gridCols,
      activePane: Math.min(target.activePane, Math.max(0, target.panes.length - 1)),
    })
    if (isTauri) {
      const cur = get().panes
      cur.forEach((p, pi) => p.tabs.forEach((t, ti) => {
        if (!isRealPath(t.path)) return
        listDir(t.path).then(files => set(st => {
          const ps = clonePanes(st.panes)
          if (ps[pi]?.tabs[ti]?.id === t.id) { ps[pi].tabs[ti].files = files; ps[pi].tabs[ti].sel = files.length ? [0] : [] }
          return { panes: ps }
        })).catch(() => {})
      }))
    }
  },

  /** Ctrl+←/→: step through layout groups, wrapping at both ends. */
  cycleLayoutGroup: (dir) => {
    const s = get()
    const n = s.layouts.length
    if (n < 2) return
    get().switchLayoutGroup((s.activeLayout + dir + n) % n)
  },

  addLayoutGroup: () => {
    const s = get()
    const stashed = s.layouts.map((g, gi) => gi === s.activeLayout
      ? { ...g, panes: clonePanes(s.panes), gridCols: s.gridCols, activePane: s.activePane }
      : g)
    const newGroup: LayoutGroup = {
      id: 'g' + rid(),
      name: `グループ ${stashed.length + 1}`,
      panes: [makePaneFrom(activeTab(s))],
      gridCols: 1,
      activePane: 0,
    }
    const layouts = [...stashed, newGroup]
    set({
      layouts,
      activeLayout: layouts.length - 1,
      panes: clonePanes(newGroup.panes),
      gridCols: newGroup.gridCols,
      activePane: 0,
    })
  },

  closeLayoutGroup: (i) => {
    const s = get()
    if (s.layouts.length <= 1 || i < 0 || i >= s.layouts.length) return
    let layouts = s.layouts.map((g, gi) => gi === s.activeLayout
      ? { ...g, panes: clonePanes(s.panes), gridCols: s.gridCols, activePane: s.activePane }
      : g)
    const closing = layouts[i]
    // Closing a group discards its whole pane/tab arrangement, so confirm
    // first — same weight as closing a window, unlike a single tab.
    if (!window.confirm(`グループ「${closing.name}」を閉じますか？`)) return
    pushClosedLayoutGroup(closing)
    const wasActive = i === s.activeLayout
    layouts = layouts.filter((_, gi) => gi !== i)
    const activeLayout = i < s.activeLayout ? s.activeLayout - 1 : Math.min(i, layouts.length - 1)
    const target = layouts[activeLayout]
    set({
      layouts,
      activeLayout,
      panes: clonePanes(target.panes),
      gridCols: target.gridCols,
      activePane: Math.min(target.activePane, Math.max(0, target.panes.length - 1)),
    })
    if (wasActive && isTauri) {
      const cur = get().panes
      cur.forEach((p, pi) => p.tabs.forEach((t, ti) => {
        if (!isRealPath(t.path)) return
        listDir(t.path).then(files => set(st => {
          const ps = clonePanes(st.panes)
          if (ps[pi]?.tabs[ti]?.id === t.id) { ps[pi].tabs[ti].files = files; ps[pi].tabs[ti].sel = files.length ? [0] : [] }
          return { panes: ps }
        })).catch(() => {})
      }))
    }
    get().showToast(`グループ「${closing.name}」を閉じました`, closing.name)
  },

  /** Restore the most recently closed layout group, tab-close-style. */
  reopenClosedLayoutGroup: () => {
    const g = closedGroupStack.pop()
    if (!g) { get().showToast('復元するグループがありません'); return }
    const s = get()
    const layouts = s.layouts.map((lg, gi) => gi === s.activeLayout
      ? { ...lg, panes: clonePanes(s.panes), gridCols: s.gridCols, activePane: s.activePane }
      : lg)
    const restored: LayoutGroup = { ...g, id: 'g' + rid(), panes: clonePanes(g.panes) }
    const next = [...layouts, restored]
    set({
      layouts: next,
      activeLayout: next.length - 1,
      panes: clonePanes(restored.panes),
      gridCols: restored.gridCols,
      activePane: Math.min(restored.activePane, Math.max(0, restored.panes.length - 1)),
    })
    if (isTauri) {
      const cur = get().panes
      cur.forEach((p, pi) => p.tabs.forEach((t, ti) => {
        if (!isRealPath(t.path)) return
        listDir(t.path).then(files => set(st => {
          const ps = clonePanes(st.panes)
          if (ps[pi]?.tabs[ti]?.id === t.id) { ps[pi].tabs[ti].files = files; ps[pi].tabs[ti].sel = files.length ? [0] : [] }
          return { panes: ps }
        })).catch(() => {})
      }))
    }
    get().showToast(`グループ「${restored.name}」を復元しました`)
  },

  renameLayoutGroup: (i, name) => set(s => {
    const nm = name.trim()
    if (!nm) return {}
    return { layouts: s.layouts.map((g, gi) => gi === i ? { ...g, name: nm } : g) }
  }),

  setGridLayout: (preset) => set(s => {
    const map = { single: [1, 1], dualH: [2, 2], dualV: [2, 1], triple: [3, 3], quad: [4, 2] } as const
    const [count, cols] = map[preset]
    const panes = clonePanes(s.panes)
    const src = activeTab(s)
    while (panes.length < count) panes.push(makePaneFrom(src))
    while (panes.length > count) panes.pop()
    return { panes, gridCols: cols, activePane: Math.min(s.activePane, count - 1) }
  }),

  addPaneRight: () => set(s => {
    if (s.panes.length >= MAX_PANES) { get().showToast('これ以上ペインを追加できません'); return {} }
    const panes = clonePanes(s.panes)
    const at = s.activePane + 1
    panes.splice(at, 0, makePaneFrom(activeTab(s)))
    return { panes, gridCols: Math.min(MAX_COLS, s.gridCols + 1), activePane: at }
  }),

  addPaneDown: () => set(s => {
    const cols = Math.max(1, s.gridCols)
    if (s.panes.length >= MAX_PANES) { get().showToast('これ以上ペインを追加できません'); return {} }
    if (Math.ceil((s.panes.length + 1) / cols) > MAX_ROWS) { get().showToast(`縦方向は最大 ${MAX_ROWS} 行までです`); return {} }
    const panes = clonePanes(s.panes)
    const at = s.activePane + 1
    panes.splice(at, 0, makePaneFrom(activeTab(s)))
    return { panes, activePane: at }
  }),

  closePane: (pi) => set(s => {
    if (s.panes.length <= 1) return {}
    const panes = clonePanes(s.panes)
    panes.splice(pi, 1)
    const gridCols = Math.max(1, Math.min(s.gridCols, panes.length))
    const activePane = Math.min(s.activePane, panes.length - 1)
    return { panes, gridCols, activePane }
  }),

  setColumnWidth: (pi, id, w) => set(s => {
    const panes = clonePanes(s.panes); const t = panes[pi].tabs[panes[pi].active]
    t.columns = t.columns.map(c => c.id === id ? { ...c, w: Math.max(60, Math.min(640, Math.round(w))) } : c)
    return { panes }
  }),
  reorderColumns: (pi, srcId, destId) => {
    if (srcId === destId) return
    set(s => {
      const panes = clonePanes(s.panes); const t = panes[pi].tabs[panes[pi].active]
      const a = [...t.columns]
      const si = a.findIndex(c => c.id === srcId); const di = a.findIndex(c => c.id === destId)
      if (si < 0 || di < 0) return {}
      const [m] = a.splice(si, 1); a.splice(di, 0, m)
      t.columns = a
      return { panes }
    })
  },
  startColDrag: (pi, id, startX, startW) => { dragState = { type: 'col', startX, sidebarW: 0, inspectorW: 0, pane0Pct: 0, paneW: 0, colId: id, colW: startW, colPi: pi } },

  setSort: (pi, id) => set(s => {
    const panes = clonePanes(s.panes); const t = panes[pi].tabs[panes[pi].active]
    if (t.sortKey === id) t.sortDir = t.sortDir === 1 ? -1 : 1
    else { t.sortKey = id; t.sortDir = 1 }
    return { panes }
  }),

  moveSel: (delta) => set(s => {
    const panes = clonePanes(s.panes); const p = panes[s.activePane]; const t = p.tabs[p.active]
    const q = s.searchMode === 'filter' ? s.search : ''
    const vis = visibleIndices(t, q)
    if (!vis.length) return {}
    let pos = vis.indexOf(t.focus); if (pos < 0) pos = 0
    pos = Math.max(0, Math.min(vis.length - 1, pos + delta))
    const idx = vis[pos]; t.focus = idx; t.sel = [idx]
    return { panes }
  }),

  focusEdge: (which) => set(s => {
    const panes = clonePanes(s.panes); const p = panes[s.activePane]; const t = p.tabs[p.active]
    const q = s.searchMode === 'filter' ? s.search : ''
    const vis = visibleIndices(t, q)
    if (!vis.length) return {}
    const idx = which === 'home' ? vis[0] : vis[vis.length - 1]
    t.focus = idx; t.sel = [idx]
    return { panes }
  }),

  typeAhead: (ch) => {
    const s = get()
    const p = s.panes[s.activePane]; const t = p.tabs[p.active]
    const q = s.searchMode === 'filter' ? s.search : ''
    const vis = visibleIndices(t, q)
    if (!vis.length) return
    const now = Date.now()
    const within = now - typeAheadTime < 800
    typeAheadTime = now
    const lower = ch.toLowerCase()
    let cycle = false
    if (within && typeAheadBuf.length === 1 && lower === typeAheadBuf) {
      cycle = true // same single char repeated → cycle through matches
    } else if (within) {
      typeAheadBuf += lower
    } else {
      typeAheadBuf = lower
    }
    const prefix = typeAheadBuf
    const accumulating = within && !cycle && prefix.length > 1
    const cur = vis.indexOf(t.focus)
    const start = (cur < 0 ? 0 : cur) + (accumulating ? 0 : 1)
    for (let k = 0; k < vis.length; k++) {
      const idx = vis[(start + k) % vis.length]
      if (t.files[idx].name.toLowerCase().startsWith(prefix)) {
        set(st => {
          const panes = clonePanes(st.panes); const tt = panes[st.activePane].tabs[panes[st.activePane].active]
          tt.focus = idx; tt.sel = [idx]
          return { panes }
        })
        return
      }
    }
  },

  toggleInspector: () => set(s => ({ inspectorOpen: !s.inspectorOpen })),
  toggleSidebar: () => set(s => ({ sidebarHidden: !s.sidebarHidden })),
  setSearch: (v) => set({ search: v }),
  toggleSearchMode: () => set(s => ({ searchMode: s.searchMode === 'filter' ? 'global' : 'filter' })),
  setContainerW: (w) => set({ containerW: w }),
  startAddressEdit: (pi) => set({ addressEdit: pi }),
  endAddressEdit: () => set({ addressEdit: null }),

  startSidebarDrag: (startX) => { dragState = { type: 'sidebar', startX, sidebarW: get().sidebarW, inspectorW: get().inspectorW, pane0Pct: get().pane0Pct, paneW: 0 } },
  startSplitDrag: (startX, paneW) => { dragState = { type: 'split', startX, sidebarW: get().sidebarW, inspectorW: get().inspectorW, pane0Pct: get().pane0Pct, paneW } },
  startInspectorDrag: (startX) => { dragState = { type: 'inspector', startX, sidebarW: get().sidebarW, inspectorW: get().inspectorW, pane0Pct: get().pane0Pct, paneW: 0 } },

  dragMove: (clientX) => {
    if (!dragState) return
    const dx = clientX - dragState.startX
    if (dragState.type === 'sidebar') set({ sidebarW: Math.max(180, Math.min(420, dragState.sidebarW + dx)) })
    else if (dragState.type === 'inspector') set({ inspectorW: Math.max(300, Math.min(620, dragState.inspectorW - dx)) })
    else if (dragState.type === 'split') set({ pane0Pct: Math.max(22, Math.min(78, dragState.pane0Pct + dx / dragState.paneW * 100)) })
    else if (dragState.type === 'col' && dragState.colId) get().setColumnWidth(dragState.colPi || 0, dragState.colId, (dragState.colW || 0) + dx)
  },
  dragEnd: () => { dragState = null },

  openCtx: (pi, idx, x, y) => set(s => {
    const panes = clonePanes(s.panes); const t = panes[pi].tabs[panes[pi].active]
    if (!t.sel.includes(idx)) { t.sel = [idx]; t.focus = idx }
    return { panes, activePane: pi, ctx: { x, y, pi, idx, q: '', sub: null } }
  }),
  // Right-click on empty list space (no target file): idx: -1, current selection left untouched
  // (matches Explorer — right-clicking blank space doesn't clear what's selected).
  openCtxBg: (pi, x, y) => set({ activePane: pi, ctx: { x, y, pi, idx: -1, q: '', sub: null } }),
  closeCtx: () => { if (get().ctx) set({ ctx: null }) },
  ctxSearch: (q) => set(s => s.ctx ? { ctx: { ...s.ctx, q } } : {}),
  togglePin: (id) => {
    set(s => { const set2 = new Set(s.pins); set2.has(id) ? set2.delete(id) : set2.add(id); return { pins: [...set2] } })
    get().showToast('ピン留めを更新しました')
  },

  openModal: (m) => { set({ modal: m, ctx: null }); if (m === 'workspaces') void get().refreshWorkspaces() },
  closeModal: () => set(s => ({ modal: null, capturing: null, rename: { ...s.rename, addOpen: false } })),

  applyWorkspace: async (data) => {
    try {
      const rawLayouts: SessionLayout[] = (data.layouts && data.layouts.length)
        ? data.layouts
        : [{ name: 'グループ 1', gridCols: data.gridCols, activePane: data.activePane, panes: data.panes }]
      const layouts: LayoutGroup[] = rawLayouts.map((g, gi) => {
        const panes: Pane[] = (g.panes || []).map(p => ({
          active: Math.max(0, Math.min(p.active || 0, (p.tabs?.length || 1) - 1)),
          tabs: (p.tabs || []).map(t => ({
            id: 't' + rid(),
            title: t.title || (t.path && t.path[t.path.length - 1]) || 'PC',
            path: t.path || ['PC'],
            files: [],
            focus: 0,
            sel: [],
            columns: Array.isArray(t.columns) && t.columns.length ? t.columns : defCols(),
            pinned: t.pinned,
            sortKey: t.sortKey,
            sortDir: t.sortDir,
          })),
        })).filter(p => p.tabs.length > 0)
        return {
          id: g.id || 'g' + rid(),
          name: g.name || `グループ ${gi + 1}`,
          panes,
          gridCols: Math.max(1, g.gridCols || 1),
          activePane: Math.min(g.activePane || 0, Math.max(0, panes.length - 1)),
        }
      }).filter(g => g.panes.length > 0)
      if (!layouts.length) return
      const activeLayout = Math.min(data.activeLayout || 0, layouts.length - 1)
      const active = layouts[activeLayout]
      set({
        layouts,
        activeLayout,
        panes: active.panes,
        gridCols: active.gridCols,
        activePane: active.activePane,
        sidebarW: data.sidebarW ?? get().sidebarW,
        sidebarHidden: !!data.sidebarHidden,
        inspectorW: data.inspectorW ?? get().inspectorW,
        inspectorOpen: data.inspectorOpen ?? get().inspectorOpen,
      })
      // Re-read folder contents from disk for each tab of the active group.
      // Other groups are lazily refreshed when the user switches to them.
      if (isTauri) {
        const cur = get().panes
        for (let pi = 0; pi < cur.length; pi++) {
          for (let ti = 0; ti < cur[pi].tabs.length; ti++) {
            const path = cur[pi].tabs[ti].path
            if (!isRealPath(path)) continue
            try {
              const files = await listDir(path)
              set(st => {
                const ps = clonePanes(st.panes)
                if (ps[pi]?.tabs[ti]) { ps[pi].tabs[ti].files = files; ps[pi].tabs[ti].sel = files.length ? [0] : [] }
                return { panes: ps }
              })
            } catch { /* skip unreadable */ }
          }
        }
      }
    } catch (err) { get().showToast('レイアウトの復元に失敗: ' + String(err)) }
  },

  refreshWorkspaces: async () => {
    try { set({ workspaces: await listWorkspaces() }) } catch { /* ignore */ }
  },

  saveWorkspaceAs: async (name) => {
    if (!isTauri) { get().showToast('保存はデスクトップアプリで利用できます'); return }
    const nm = name.trim()
    if (!nm) return
    try {
      await saveWorkspace(nm, JSON.stringify(serializeSession(get())))
      await get().refreshWorkspaces()
      get().showToast(`ワークスペース「${nm}」を保存しました`)
    } catch (err) { get().showToast('保存失敗: ' + String(err)) }
  },

  loadNamedWorkspace: async (name) => {
    if (!isTauri) return
    try {
      const json = await loadWorkspace(name)
      await get().applyWorkspace(JSON.parse(json) as SessionData)
      set({ modal: null })
      get().showToast(`「${name}」を開きました`)
    } catch (err) { get().showToast('読込失敗: ' + String(err)) }
  },

  deleteNamedWorkspace: async (name) => {
    try {
      await deleteWorkspace(name)
      await get().refreshWorkspaces()
      get().showToast(`「${name}」を削除しました`)
    } catch (err) { get().showToast('削除失敗: ' + String(err)) }
  },

  startRename: (pi, idx) => {
    const s = get()
    const p = pi ?? s.activePane
    const t = s.panes[p].tabs[s.panes[p].active]
    const i = idx ?? t.focus
    if (!t.files[i]) return
    set({ renaming: { pi: p, idx: i }, activePane: p, ctx: null })
  },

  cancelRename: () => { if (get().renaming) set({ renaming: null }) },

  commitRename: async (name) => {
    const s = get()
    const r = s.renaming
    set({ renaming: null })
    if (!r) return
    const t = s.panes[r.pi].tabs[s.panes[r.pi].active]
    const f = t.files[r.idx]
    const next = name.trim()
    if (!f || !next || next === f.name) return
    if (/[\\/:*?"<>|]/.test(next)) { get().showToast('ファイル名に使えない文字が含まれています'); return }
    if (!isTauri || !isRealPath(t.path)) { get().showToast(`名前を変更: ${next}`); return }
    // Search results carry their own absolute path; plain listings live under the tab path.
    const fromSegs = f.abs ? splitPath(f.abs) : [...t.path, f.name]
    try {
      await renamePath(fromSegs, next)
      await get().navigate(r.pi, t.path, { push: false })
      // Re-focus the entry under its new name (the listing was re-sorted by the refresh).
      set(st => {
        const panes = clonePanes(st.panes); const tt = panes[r.pi].tabs[panes[r.pi].active]
        const i = tt.files.findIndex(x => x.name === next)
        if (i >= 0) { tt.focus = i; tt.sel = [i] }
        return { panes }
      })
      get().showToast(`「${next}」に変更しました`)
    } catch (err) { get().showToast('名前の変更に失敗: ' + String(err)) }
  },

  loadNotes: async () => {
    if (!isTauri) return
    try { set({ notes: await notesLoad() }) } catch { /* notes are optional */ }
  },

  addNote: (path) => {
    const s = get()
    const segs = path ?? activeTab(s).path
    const key = noteKey(segs)
    const cur = s.notes[key]
    // Already has one: just make sure it's expanded rather than starting over.
    if (cur) { set({ ctx: null }); if (cur.collapsed) get().toggleNoteCollapsed(key); return }
    const note: FolderNote = { text: '', h: 140, collapsed: false, updated: nowStamp() }
    set(st => ({ notes: { ...st.notes, [key]: note }, ctx: null }))
    void notesSet(key, note).catch(() => {})
    // Focused by the note panel itself once it mounts (see FolderNotePanel).
  },

  setNoteText: (key, text) => {
    const cur = get().notes[key]
    if (!cur) return
    const note: FolderNote = { ...cur, text, updated: nowStamp() }
    set(s => ({ notes: { ...s.notes, [key]: note } }))
    saveNoteDebounced(key, note)
  },

  setNoteHeight: (key, h) => {
    const cur = get().notes[key]
    if (!cur) return
    const note: FolderNote = { ...cur, h: Math.max(NOTE_MIN_H, Math.min(NOTE_MAX_H, Math.round(h))) }
    if (note.h === cur.h) return
    set(s => ({ notes: { ...s.notes, [key]: note } }))
    saveNoteDebounced(key, note)
  },

  toggleNoteCollapsed: (key) => {
    const cur = get().notes[key]
    if (!cur) return
    const note: FolderNote = { ...cur, collapsed: !cur.collapsed }
    set(s => ({ notes: { ...s.notes, [key]: note } }))
    saveNoteDebounced(key, note)
  },

  removeNote: (key) => {
    set(s => { const n = { ...s.notes }; delete n[key]; return { notes: n, ctx: null } })
    void notesDelete(key).catch(() => {})
    get().showToast('付箋メモを削除しました')
  },

  loadExtTools: async () => {
    if (!isTauri) return
    try { set({ extTools: await externalToolsStatus() }) } catch { /* keep both flags false */ }
  },

  runTortoiseSvn: async (cmd, paths) => {
    if (!paths.length) return
    if (!isTauri) { get().showToast('TortoiseSVN: ' + cmd); return }
    try { await tortoiseSvnCommand(cmd, paths) }
    catch (err) { get().showToast('TortoiseSVN を起動できません: ' + String(err)) }
  },

  runWinMerge: async (paths) => {
    if (!paths.length) return
    if (!isTauri) { get().showToast('WinMerge で比較'); return }
    try { await winmergeCompare(paths) }
    catch (err) { get().showToast('WinMerge を起動できません: ' + String(err)) }
  },

  addRule: (type) => set(s => ({ rename: { ...s.rename, rules: [...s.rename.rules, ruleDefaults(type)], addOpen: false } })),
  removeRule: (id) => set(s => ({ rename: { ...s.rename, rules: s.rename.rules.filter(r => r.id !== id) } })),
  updateRule: (id, patch) => set(s => ({ rename: { ...s.rename, rules: s.rename.rules.map(r => r.id === id ? { ...r, ...patch } : r) } })),
  moveRule: (id, dir) => set(s => {
    const a = [...s.rename.rules]; const i = a.findIndex(r => r.id === id); const j = i + dir
    if (j < 0 || j >= a.length) return {}
    const t = a[i]; a[i] = a[j]; a[j] = t; return { rename: { ...s.rename, rules: a } }
  }),
  reorderRule: (srcId, destId) => {
    if (srcId === destId) return
    set(s => {
      const a = [...s.rename.rules]; const si = a.findIndex(r => r.id === srcId); const di = a.findIndex(r => r.id === destId)
      if (si < 0 || di < 0) return {}
      const [m] = a.splice(si, 1); a.splice(di, 0, m); return { rename: { ...s.rename, rules: a } }
    })
  },
  toggleAddMenu: () => set(s => ({ rename: { ...s.rename, addOpen: !s.rename.addOpen } })),
  applyRename: async () => {
    const s = get()
    const pi = s.activePane
    const t = s.panes[pi].tabs[s.panes[pi].active]
    let targets = t.sel.map(i => t.files[i]).filter(f => f && !f.folder)
    if (targets.length <= 1) targets = t.files.filter(f => !f.folder)
    const afters = applyRules(targets, s.rename.rules)
    set({ modal: null })
    if (isTauri && isRealPath(t.path)) {
      let ok = 0, fail = 0
      for (let i = 0; i < targets.length; i++) {
        if (targets[i].name === afters[i]) continue
        try { await renamePath([...t.path, targets[i].name], afters[i]); ok++ }
        catch { fail++ }
      }
      await get().navigate(pi, t.path, { push: false })
      if (fail) get().showToast(`${ok} 件をリネーム・${fail} 件失敗`)
      else get().showToast(`${ok} 件のファイル名を変更しました`, ok ? ok + ' 件のリネーム' : undefined)
      return
    }
    get().showToast(targets.length + ' 件のファイル名を変更しました', targets.length + ' 件のリネーム')
  },

  setOptTab: (t) => set({ optTab: t, capturing: null }),
  setOpt: (k, v) => set(s => ({ opt: { ...s.opt, [k]: v } })),
  setOptTheme: (v) => {
    applyTheme(v, document.documentElement)
    set(s => ({ theme: v, opt: { ...s.opt, theme: v } }))
  },
  resetOptCategory: (cat) => {
    if (cat === 'appearance') {
      applyTheme('flex-light', document.documentElement)
      set(s => ({ theme: 'flex-light', opt: { ...s.opt, theme: 'flex-light', accent: null, fontSize: 13, rowHeight: 'compact', iconSize: 16, radius: 'medium', zebra: false, dimInactive: true, anim: 'on' } }))
      get().showToast('外観をデフォルトに戻しました')
    } else {
      get().showToast('このカテゴリをデフォルトに戻しました')
    }
  },
  toggleAdv: (k) => set(s => ({ adv: { ...s.adv, [k]: !s.adv[k] } })),
  startCapture: (id) => set({ capturing: id }),
  captureKey: (combo) => set(s => ({ binds: { ...s.binds, [s.capturing!]: combo }, capturing: null })),
  exportShortcuts: () => get().showToast('shortcuts.json をエクスポートしました'),
  importShortcuts: () => get().showToast('shortcuts.json を読み込みました'),

  openPalette: () => set({ palette: { open: true, q: '', sel: 0 }, modal: null, ctx: null, goto: { ...get().goto, open: false } }),
  closePalette: () => set(s => ({ palette: { ...s.palette, open: false }, capturing: null })),
  paletteInput: (q) => set(s => ({ palette: { ...s.palette, q, sel: 0 } })),
  paletteSel: (sel) => set(s => ({ palette: { ...s.palette, sel } })),
  runCommand: (id) => {
    set(s => ({ recent: [id, ...s.recent.filter(r => r !== id)].slice(0, 4) }))
    get().closePalette()
  },
  paletteAssign: (id) => set({ capturing: id }),

  openGoto: () => set({ goto: { open: true, q: '', sel: 0 }, modal: null, ctx: null, palette: { ...get().palette, open: false } }),
  closeGoto: () => set(s => ({ goto: { ...s.goto, open: false } })),
  gotoInput: (q) => set(s => ({ goto: { ...s.goto, q, sel: 0 } })),
  gotoSel: (sel) => set(s => ({ goto: { ...s.goto, sel } })),
  navTo: (path, other) => {
    set(s => ({ goto: { ...s.goto, open: false } }))
    const segs = splitPath(path)
    if (isTauri && isRealPath(segs)) {
      const pi = other ? (get().activePane === 0 ? 1 : 0) : get().activePane
      void get().navigate(pi, segs)
      return
    }
    get().showToast('移動: ' + path + (other ? '（別パネル）' : ''))
  },

  showToast: (msg, undo) => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: msg, undo: undo || null })
    toastTimer = setTimeout(() => set({ toast: null, undo: null }), undo ? 5000 : 2200)
  },
  doUndo: () => {
    const u = get().undo
    if (!u) return
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: u + ' を元に戻しました', undo: null })
    toastTimer = setTimeout(() => set({ toast: null }), 2000)
  },
  clearToast: () => set({ toast: null, undo: null }),
}), {
  name: 'flexexplorer:settings',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  // Persist only user preferences — never transient/session state like panes.
  partialize: (s) => ({
    theme: s.theme,
    opt: s.opt,
    adv: s.adv,
    binds: s.binds,
    pins: s.pins,
    recent: s.recent,
    bookmarks: s.bookmarks,
    recentPaths: s.recentPaths,
    sidebarW: s.sidebarW,
    sidebarHidden: s.sidebarHidden,
    inspectorW: s.inspectorW,
    inspectorOpen: s.inspectorOpen,
    pane0Pct: s.pane0Pct,
  }),
}))

// Persist the open layout (folders/panes) to localStorage, debounced, so the
// previous session can be restored on next launch.
useStore.subscribe(() => {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer)
  sessionSaveTimer = setTimeout(() => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(serializeSession(useStore.getState()))) } catch { /* ignore */ }
  }, 700)
})

export { SHORTCUT_GROUPS, fmt, fmtDate, hashStr, uidFor }
