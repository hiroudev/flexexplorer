export interface FileEntry {
  name: string
  folder?: boolean
  dim?: boolean
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
}

export interface CtxState {
  x: number
  y: number
  pi: number
  idx: number
  q: string
  sub: boolean
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

export type ColumnId = 'name' | 'date' | 'size'

export interface ColumnDef {
  id: ColumnId
  w: number // pixel width (used as flex-basis min for 'name')
}

export type Modal = 'rename' | 'options' | 'workspaces' | null
export type OptTab = 'appearance' | 'shortcuts' | 'files' | 'default' | 'win' | 'advanced'

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
  panes: Pane[]
  ctx: CtxState | null
  modal: Modal
  optTab: OptTab
  toast: string | null
  undo: string | null
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
}

export interface IconInfo {
  folder: boolean
  color: string
  soft: string
  label: string
}
