export interface FileEntry {
  name: string
  folder?: boolean
  dim?: boolean
  /** OS-hidden (dotfile or hidden/system attribute). Filtered out unless
   * 設定 > ファイル表示 > 隠しファイルを表示 is on. */
  hidden?: boolean
  ext?: string
  size?: number
  m?: string   // modified date string "YYYY/MM/DD HH:mm"
  c?: string   // created date string
  pv?: string  // preview type: 'image'|'json'|'md'|'memo'|'readme'|'sheet'|'text'
  dim2?: string // image dimensions
  abs?: string // absolute path (set for global-search results)
}

export interface PaneTab {
  id: string
  title: string
  path: string[]
  files: FileEntry[]
  focus: number
  sel: number[]
  columns: ColumnDef[]
  pinned?: boolean
  sortKey?: ColumnId | null
  sortDir?: 1 | -1
}

export interface Pane {
  active: number
  tabs: PaneTab[]
}

/** A layout group: one whole pane arrangement, switchable via the toolbar tabs (Tablacus-style). */
export interface LayoutGroup {
  id: string
  name: string
  panes: Pane[]
  gridCols: number
  activePane: number
  /** Relative widths of the grid's columns / heights of its rows, as CSS `fr`
   * weights. Absent on sessions saved before pane resizing existed, in which
   * case the tracks fall back to equal shares. */
  colFracs?: number[]
  rowFracs?: number[]
}

export interface RenameRule {
  id: string
  type: 'replace' | 'affix' | 'seq' | 'date' | 'uid'
  on: boolean
  // replace
  find?: string
  repl?: string
  regex?: boolean
  // affix
  prefix?: string
  suffix?: string
  // seq
  start?: string
  digits?: string
  sep?: string
  // date
  source?: 'modified' | 'created'
  fmt?: string
  // uid
  mode?: 'short' | 'uuid'
}

export interface AppearanceOptions {
  theme: string
  accent: string | null
  fontSize: number
  rowHeight: 'compact' | 'standard' | 'loose'
  iconSize: 16 | 24 | 32
  radius: 'sharp' | 'medium' | 'round'
  zebra: boolean
  dimInactive: boolean
  anim: 'on' | 'reduce' | 'off'
}

export interface AdvancedState {
  hidden: boolean
  alwaysExt: boolean
  confirmDelete: boolean
  restore: boolean
  explorerCtx: boolean
  quickLaunch: boolean
  jumpType: boolean
  gpu: boolean
  telemetry: boolean
  singleClick: boolean
  /** Show 戻る/進む/更新 buttons in every pane's address bar. */
  paneNavButtons: boolean
}

export interface CtxState {
  x: number
  y: number
  pi: number
  idx: number
  q: string
  /** Which submenu is currently open, if any ('new' | 'more' | 'svn'). */
  sub: string | null
}

export interface Drive {
  letter: string
  path: string
  name: string
  total: number
  free: number
}

export interface Bookmark {
  path: string
  label: string
}

export interface Clipboard {
  mode: 'copy' | 'cut'
  paths: string[]
}

/** A private, machine-local memo attached to one folder (stored outside the folder). */
export interface FolderNote {
  text: string
  /** Panel height in px, as last dragged by the user. */
  h: number
  collapsed?: boolean
  updated?: string
}

/** Inline rename in progress: which entry of which pane is being edited. */
export interface RenameState {
  pi: number
  idx: number
}

export type ColumnId = 'name' | 'date' | 'size'

export interface ColumnDef {
  id: ColumnId
  w: number // pixel width (used as flex-basis min for 'name')
}

export type Modal = 'rename' | 'options' | 'workspaces' | 'guide' | null
export type OptTab = 'appearance' | 'shortcuts' | 'files' | 'generations' | 'default' | 'win' | 'advanced'

export interface AppState {
  theme: string
  activePane: number
  inspectorOpen: boolean
  search: string
  searchMode: 'filter' | 'global'
  sidebarW: number
  sidebarHidden: boolean
  inspectorW: number
  pane0Pct: number
  gridCols: number
  /** Live track weights for the active group (see LayoutGroup.colFracs). */
  colFracs: number[]
  rowFracs: number[]
  panes: Pane[]
  ctx: CtxState | null
  modal: Modal
  optTab: OptTab
  toast: string | null
  /** Offered by the toast's ↩ button. Only actions that can genuinely be
   * undone set this — a label alone would promise something nothing delivers. */
  undo: { label: string; kind: 'group' } | null
  capturing: string | null
  binds: Record<string, string>
  rename: { rules: RenameRule[]; addOpen: boolean }
  adv: AdvancedState
  opt: AppearanceOptions
  palette: { open: boolean; q: string; sel: number }
  goto: { open: boolean; q: string; sel: number }
  pins: string[]
  recent: string[]
  maximized: boolean
  containerW: number
  drives: Drive[]
  bookmarks: Bookmark[]
  recentPaths: string[]
  clip: Clipboard | null
  home: string
  workspaces: string[]
  layouts: LayoutGroup[]
  activeLayout: number
  addressEdit: number | null
  /** Folder notes, keyed by `noteKey()` (lowercased absolute path). */
  notes: Record<string, FolderNote>
  renaming: RenameState | null
  /** Which optional external tools were detected on this machine. */
  extTools: { tortoiseSvn: boolean; winmerge: boolean }
  /** System-wide hotkey (e.g. "Ctrl+Alt+O") that pops the quick-open prompt
   * even when FlexExplorer doesn't have focus. User-configurable. */
  quickOpenHotkey: string
  /** Workspace Ctrl+N opens a new window into, if any is marked default. */
  defaultWorkspace: string | null
  quickOpen: { open: boolean }
  /** A copy/move being watched: progress for the bar, plus what to refresh
   * and re-ask when it ends. Null when nothing is running. */
  transfer: {
    id: string
    mode: 'copy' | 'move'
    done: number
    total: number
    bytesDone: number
    bytesTotal: number
    current: string
  } | null
  /** A pending name collision waiting on the user's answer. */
  conflict: {
    names: string[]
    mode: 'copy' | 'move'
    paths: string[]
    dest: string[]
    srcPi: number
  } | null
  /** A destructive action waiting on confirmation (設定 > 削除前に確認). */
  confirm: {
    title: string
    body: string
    okLabel: string
    kind: 'delete' | 'delete-permanent'
    paths: string[]
  } | null
  /** Highlight the newest file of each generation set (see utils/generations). */
  genHighlight: boolean
  /** User overrides for how names are grouped into generation sets. */
  genRules: GenerationRule[]
}

/** A user-supplied override for how file names are grouped into generation
 * sets. `pattern` is a regular expression; files whose capture groups (or,
 * with no capture group, whole match) are equal belong to the same set. */
export interface GenerationRule {
  id: string
  on: boolean
  /** Shown in the settings list so a rule is recognisable at a glance. */
  label: string
  pattern: string
}

export interface IconInfo {
  folder: boolean
  color: string
  soft: string
  label: string
}
