// Bridge between the React frontend and the Tauri (Rust) filesystem commands.
//
// When running inside the Tauri shell, these helpers call the real backend.
// When running as a plain web app (`npm run dev` in a browser), `isTauri` is
// false and callers fall back to the mock data baked into the store. This keeps
// the web build fully functional with zero Tauri runtime present.

import type { FileEntry, FolderNote } from '../types'

export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ---- raw DTOs returned by the Rust commands (see src-tauri/src/fs.rs) ----

interface DirEntryDto {
  name: string
  folder: boolean
  ext: string
  size: number
  m: string
  c: string
  hidden: boolean
}

interface DriveDto {
  letter: string
  path: string
  name: string
  total: number
  free: number
}

export interface Drive {
  letter: string
  path: string
  name: string
  total: number
  free: number
}

interface SearchHitDto {
  name: string
  abs: string
  folder: boolean
  ext: string
  size: number
  m: string
}

// Lazily imported so the web build never needs the Tauri runtime at module load.
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

// ---- preview-type inference ----
//
// For real files we only assign a preview type we can actually render from the
// raw bytes: 'image' for images, 'text' for anything we can read as UTF-8 text.
// Binary office formats (xlsx/docx/pptx/pdf) get no preview → "open with default".

const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'])
const SHEET = new Set(['xlsx', 'xlsm', 'xls', 'xlsb', 'ods'])

// Extensions whose contents are plain text / source code.
const TEXT_EXT = new Set([
  // docs / data
  'txt', 'log', 'rst', 'json', 'jsonc', 'json5', 'tsv',
  'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'lock',
  // web
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro',
  // scripts / source
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'pyw', 'rb', 'rs', 'go', 'java',
  'kt', 'kts', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'cs', 'php', 'swift',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd', 'sql', 'r', 'lua',
  'pl', 'pm', 'dart', 'scala', 'clj', 'cljs', 'ex', 'exs', 'erl', 'elm', 'hs',
  'gradle', 'groovy', 'tf', 'tfvars', 'proto', 'graphql', 'gql', 'vim', 'asm',
  'patch', 'diff', 'srt', 'vtt', 'tex', 'bib', 'm', 'mm',
])

// Extensionless filenames that are conventionally plain text.
const TEXT_NAMES = new Set([
  'makefile', 'dockerfile', 'license', 'readme', 'authors', 'changelog', 'notice',
  '.gitignore', '.gitattributes', '.editorconfig', '.env', '.npmrc', '.prettierrc',
  '.babelrc', '.eslintrc', '.dockerignore',
])

function previewType(name: string, ext: string, folder: boolean): string | undefined {
  if (folder) return undefined
  if (IMG.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (SHEET.has(ext)) return 'sheet'
  if (ext === 'csv') return 'text'
  if (ext && TEXT_EXT.has(ext)) return 'text'
  if (!ext && TEXT_NAMES.has(name.toLowerCase())) return 'text'
  return undefined
}

function toFileEntry(d: DirEntryDto): FileEntry {
  const e: FileEntry = {
    name: d.name,
    folder: d.folder,
    ext: d.ext,
    size: d.size,
    m: d.m,
    c: d.c,
  }
  if (d.hidden) { e.dim = true; e.hidden = true }
  const pv = previewType(d.name, d.ext, d.folder)
  if (pv) e.pv = pv
  return e
}

// ---- path helpers (Windows-style, tolerant of forward slashes) ----
//
// Two absolute-path shapes are supported: drive letter ("C:\Users\dev") and
// UNC network path ("\\server\share\folder", e.g. a file server or a
// network-mounted storage box). For UNC paths, segs[0] is the host WITH its
// "\\" prefix kept intact (e.g. "\\server") so join/split round-trip and
// isRealPath can tell it apart from a plain folder name.

/** Join store path segments (e.g. ['C:','Users','dev'] or ['\\\\server','share','dir']) into an absolute path. */
export function joinPath(segs: string[]): string {
  if (segs.length === 0) return ''
  const [head, ...rest] = segs
  if (/^[A-Za-z]:$/.test(head) || head.startsWith('\\\\')) {
    return rest.length ? head + '\\' + rest.join('\\') : head + '\\'
  }
  return segs.join('\\')
}

/** Split an absolute path back into store segments. */
export function splitPath(abs: string): string[] {
  const s = abs.replace(/[\\/]+$/, '')
  const unc = s.match(/^[\\/]{2}([^\\/]+)(?:[\\/](.*))?$/)
  if (unc) {
    const [, host, rest] = unc
    return ['\\\\' + host, ...(rest ? rest.split(/[\\/]+/).filter(Boolean) : [])]
  }
  return s.split(/[\\/]+/).filter(Boolean)
}

/** True when these segments map to a real filesystem path we can read. */
export function isRealPath(segs: string[]): boolean {
  return segs.length > 0 && (/^[A-Za-z]:$/.test(segs[0]) || segs[0].startsWith('\\\\'))
}

// ---- public API ----

export async function listDir(segs: string[]): Promise<FileEntry[]> {
  const raw = await invoke<DirEntryDto[]>('list_dir', { path: joinPath(segs) })
  return raw.map(toFileEntry)
}

export async function listDrives(): Promise<Drive[]> {
  const raw = await invoke<DriveDto[]>('list_drives')
  return raw.map(d => ({ letter: d.letter, path: d.path, name: d.name, total: d.total, free: d.free }))
}

export async function homeDir(): Promise<string> {
  return invoke<string>('home_dir')
}

/** Folder to show on startup instead of the session restore, if this process
 * was launched with a path argument (external launcher / "FlexExplorerで表示"). */
export async function launchPath(): Promise<string | null> {
  if (!isTauri) return null
  return invoke<string | null>('launch_path')
}

/** Subscribes to relaunch requests caught by the single-instance plugin (a
 * second `FlexExplorer.exe "<path>"` launch — BlueWind's filer setting,
 * Win+R, FlexFind's "FlexExplorerで表示" — hands its folder here instead of
 * opening a second window). Returns an unsubscribe function. */
export async function onOpenInTmpPane(cb: (path: string) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<string>('open-in-tmp-pane', e => cb(e.payload))
}

export async function openPath(segs: string[]): Promise<void> {
  await invoke('open_path', { path: joinPath(segs) })
}

export async function readTextPreview(segs: string[], maxBytes = 16384): Promise<string> {
  return invoke<string>('read_text_preview', { path: joinPath(segs), maxBytes })
}

export async function readXlsxPreview(segs: string[], maxRows = 200, maxCols = 30): Promise<string> {
  return invoke<string>('read_xlsx_preview', { path: joinPath(segs), maxRows, maxCols })
}

/** Convert an absolute path to an asset:// URL usable in <img>/<iframe> src. */
export async function assetUrl(absPath: string): Promise<string> {
  if (!isTauri) return ''
  const { convertFileSrc } = await import('@tauri-apps/api/core')
  return convertFileSrc(absPath)
}

export async function renamePath(fromSegs: string[], toName: string): Promise<string> {
  const from = joinPath(fromSegs)
  const to = joinPath([...fromSegs.slice(0, -1), toName])
  return invoke<string>('rename_path', { from, to })
}

export async function copyEntries(absPaths: string[], destSegs: string[]): Promise<number> {
  return invoke<number>('copy_entries', { paths: absPaths, destDir: joinPath(destSegs) })
}

export async function moveEntries(absPaths: string[], destSegs: string[]): Promise<number> {
  return invoke<number>('move_entries', { paths: absPaths, destDir: joinPath(destSegs) })
}

export async function deleteEntries(absPaths: string[], permanent = false): Promise<number> {
  return invoke<number>('delete_entries', { paths: absPaths, permanent })
}

export async function createFolder(dirSegs: string[], name: string): Promise<string> {
  return invoke<string>('create_folder', { dir: joinPath(dirSegs), name })
}

/** Creates a new item of a well-known kind inside dirSegs ('folder' | 'txt' | 'xlsx' | 'docx' | 'pptx').
 * Office formats are created from the same registry-registered blank template Explorer's own
 * "New" menu uses, so this fails with a clear error rather than writing a broken 0-byte file
 * when the corresponding Office app isn't installed. Resolves to the new item's absolute path. */
export async function createNewItem(dirSegs: string[], kind: string): Promise<string> {
  return invoke<string>('create_new_item', { dir: joinPath(dirSegs), kind })
}

/** Duplicates a file into the same folder as `<stem>_<YYYYMMDD>_<NN><ext>`.
 * Resolves to the new file's path. */
export async function duplicateAsDatedCopy(absPath: string): Promise<string> {
  return invoke<string>('duplicate_as_dated_copy', { path: absPath })
}

export async function searchDir(rootSegs: string[], query: string, max = 500): Promise<FileEntry[]> {
  const hits = await invoke<SearchHitDto[]>('search_dir', { root: joinPath(rootSegs), query, max })
  return hits.map(h => {
    const e: FileEntry = { name: h.name, folder: h.folder, ext: h.ext, size: h.size, m: h.m, abs: h.abs }
    const pv = previewType(h.name, h.ext, h.folder)
    if (pv) e.pv = pv
    return e
  })
}

/** Copy plain text to the clipboard (works inside the WebView). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ---- native shell verbs / dialogs ----

export async function shellVerb(absPath: string, verb: string): Promise<void> {
  await invoke('shell_verb', { path: absPath, verb })
}

/** Pops the real OS shell context menu for absPath at screen position (x, y) —
 * the same menu Explorer shows, including third-party shell extensions
 * (Box, OneDrive, 7-Zip, "Send to", …) that FlexExplorer's own menu can't
 * reasonably reimplement itself. */
export async function showShellContextMenu(absPath: string, x: number, y: number): Promise<void> {
  await invoke('show_shell_context_menu', { path: absPath, x: Math.round(x), y: Math.round(y) })
}

export async function createShortcut(absPath: string, destDir?: string): Promise<string> {
  return invoke<string>('create_shortcut', { target: absPath, destDir: destDir ?? null })
}

/** One option for swapping a path segment while keeping the segments below it
 * (see `siblingFolders`). */
export interface Sibling {
  name: string
  /** How many segments of the requested tail this sibling actually contains. */
  depth: number
  hasTail: boolean
}

/** Folders alongside a path segment, each reporting how much of `tail` it also
 * contains — the data behind the breadcrumb's ▾ switcher. */
export async function siblingFolders(parent: string[], tail: string[]): Promise<Sibling[]> {
  if (!isTauri) return []
  return invoke<Sibling[]>('sibling_folders', { parent: joinPath(parent), tail })
}

// ---- watchable copy/move (see src-tauri/src/transfer.rs) ----

export interface TransferPlan {
  files: number
  bytes: number
  /** Top-level names that already exist in the destination. */
  conflicts: string[]
}

export type ConflictChoice = 'overwrite' | 'keepboth' | 'skip'

export interface TransferProgress {
  id: string
  done: number
  total: number
  bytesDone: number
  bytesTotal: number
  current: string
}

export interface TransferDone {
  id: string
  ok: number
  skipped: number
  cancelled: boolean
  errors: string[]
}

/** What a transfer would involve, without touching anything yet. */
export async function planTransfer(paths: string[], destDir: string): Promise<TransferPlan> {
  return invoke<TransferPlan>('plan_transfer', { paths, destDir })
}

/** Kicks off a transfer; resolves as soon as it has started, not when it ends.
 * Follow it through onTransferProgress / onTransferDone. */
export async function startTransfer(
  id: string, paths: string[], destDir: string,
  mode: 'copy' | 'move', conflict: ConflictChoice,
): Promise<void> {
  await invoke('start_transfer', { id, paths, destDir, mode, conflict })
}

export async function cancelTransfer(id: string): Promise<void> {
  await invoke('cancel_transfer', { id })
}

export async function onTransferProgress(cb: (p: TransferProgress) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<TransferProgress>('transfer-progress', e => cb(e.payload))
}

export async function onTransferDone(cb: (d: TransferDone) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<TransferDone>('transfer-done', e => cb(e.payload))
}

export interface ShortcutTarget {
  target: string
  isDir: boolean
}

/** Resolves a `.lnk` shortcut's target path — used so opening a shortcut to a
 * folder navigates inside FlexExplorer instead of bouncing out to Explorer
 * (which is what a `.lnk`'s default shell activation always does for a
 * folder target, regardless of which app opened the shortcut). */
export async function resolveShortcut(absPath: string): Promise<ShortcutTarget> {
  return invoke<ShortcutTarget>('resolve_shortcut', { path: absPath })
}

/** Creates a `<name>へのショートカット.txt` next to absPath, containing its path as
 * plain text — a fallback for items (e.g. some cloud-sync folders) that a real
 * .lnk shortcut can't reliably point at. Resolves to the new file's path. */
export async function createPathShortcutText(absPath: string, destDir?: string): Promise<string> {
  return invoke<string>('create_path_shortcut_text', { target: absPath, destDir: destDir ?? null })
}

export async function revealInExplorer(absPath: string): Promise<void> {
  await invoke('reveal_in_explorer', { path: absPath })
}

export async function openInTerminal(dirSegs: string[]): Promise<void> {
  await invoke('open_in_terminal', { dir: joinPath(dirSegs) })
}

export async function openInVscode(absPath: string): Promise<void> {
  await invoke('open_in_vscode', { path: absPath })
}

// ---- per-folder sticky notes ----

/** Storage key for a folder's note: case-insensitive, separator-normalized, no
 * trailing slash (so "C:\Dir", "c:/dir\" and "C:\dir" all share one note). */
export function noteKey(segs: string[]): string {
  const abs = joinPath(segs).replace(/\//g, '\\')
  const trimmed = abs.replace(/\\+$/, '')
  return (trimmed || abs).toLowerCase()
}

export async function notesLoad(): Promise<Record<string, FolderNote>> {
  if (!isTauri) return {}
  return invoke<Record<string, FolderNote>>('notes_load')
}

export async function notesSet(key: string, note: FolderNote): Promise<void> {
  if (!isTauri) return
  await invoke('notes_set', { key, note })
}

export async function notesDelete(key: string): Promise<void> {
  if (!isTauri) return
  await invoke('notes_delete', { key })
}

// ---- external tool integration (TortoiseSVN / WinMerge) ----

export interface ExternalToolsStatus {
  tortoiseSvn: boolean
  winmerge: boolean
}

/** Detects installed TortoiseSVN / WinMerge so the context menu can hide the
 * entries entirely rather than offering commands that would just fail. */
export async function externalToolsStatus(): Promise<ExternalToolsStatus> {
  if (!isTauri) return { tortoiseSvn: false, winmerge: false }
  return invoke<ExternalToolsStatus>('external_tools_status')
}

/** Runs a TortoiseSVN command (e.g. "commit", "update", "log", "diff") on the
 * given absolute paths — the same thing TortoiseSVN's own shell extension does. */
export async function tortoiseSvnCommand(cmd: string, paths: string[]): Promise<void> {
  await invoke('tortoise_svn_command', { cmd, paths })
}

/** Opens WinMerge to compare 1–3 absolute paths (files or folders). */
export async function winmergeCompare(paths: string[]): Promise<void> {
  await invoke('winmerge_compare', { paths })
}

// ---- named workspaces (layout files) ----

export async function saveWorkspace(name: string, content: string): Promise<void> {
  await invoke('save_workspace', { name, content })
}

export async function listWorkspaces(): Promise<string[]> {
  if (!isTauri) return []
  return invoke<string[]>('list_workspaces')
}

export async function loadWorkspace(name: string): Promise<string> {
  return invoke<string>('load_workspace', { name })
}

export async function deleteWorkspace(name: string): Promise<void> {
  await invoke('delete_workspace', { name })
}

// ---- native Windows shell icons (cached by extension) ----

const iconCache = new Map<string, string>()
const iconInflight = new Map<string, Promise<string>>()

function iconKey(name: string, folder: boolean, large: boolean): string {
  if (folder) return (large ? 'L:' : 'S:') + 'dir'
  const i = name.lastIndexOf('.')
  const ext = i > 0 ? name.slice(i + 1).toLowerCase() : 'noext'
  return (large ? 'L:' : 'S:') + ext
}

/** Synchronously read an already-cached icon data URL, or null. */
export function peekIcon(name: string, folder: boolean, large = false): string | null {
  return iconCache.get(iconKey(name, folder, large)) || null
}

/** Fetch the native shell icon as a PNG data URL (cached by type). */
export async function shellIcon(name: string, folder: boolean, large = false): Promise<string> {
  if (!isTauri) return ''
  const key = iconKey(name, folder, large)
  const cached = iconCache.get(key)
  if (cached) return cached
  const pending = iconInflight.get(key)
  if (pending) return pending
  const p = invoke<string>('shell_icon', { name, folder, large })
    .then(url => { iconCache.set(key, url); iconInflight.delete(key); return url })
    .catch(() => { iconInflight.delete(key); return '' })
  iconInflight.set(key, p)
  return p
}

/** Real-path shell icon (drives, special folders, apps) — cached by path. */
export function peekIconPath(absPath: string, large = false): string | null {
  return iconCache.get((large ? 'PL:' : 'PS:') + absPath) || null
}

export async function shellIconForPath(absPath: string, large = false): Promise<string> {
  if (!isTauri) return ''
  const key = (large ? 'PL:' : 'PS:') + absPath
  const cached = iconCache.get(key)
  if (cached) return cached
  const pending = iconInflight.get(key)
  if (pending) return pending
  const p = invoke<string>('shell_icon_for_path', { path: absPath, large })
    .then(url => { iconCache.set(key, url); iconInflight.delete(key); return url })
    .catch(() => { iconInflight.delete(key); return '' })
  iconInflight.set(key, p)
  return p
}

// ---- window controls (custom titlebar; decorations are disabled) ----

export async function winMinimize(): Promise<void> {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

export async function winToggleMaximize(): Promise<void> {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().toggleMaximize()
}

export async function winClose(): Promise<void> {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}

export async function winStartDragging(): Promise<void> {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().startDragging()
}

/** Un-minimizes, shows, and focuses the main window — used when a global
 * hotkey or a BlueWind/Win+R relaunch wants the app to come to the front. */
export async function focusMainWindow(): Promise<void> {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const w = getCurrentWindow()
  await w.unminimize()
  await w.show()
  await w.setFocus()
}

// ---- global hotkey (system-wide, works even without focus) ----

/** Registers `combo` (e.g. "Ctrl+Alt+O") as a system-wide hotkey; `onPressed`
 * fires on key-down only (the plugin also reports release events). Returns
 * false if registration failed (e.g. another app already owns that combo). */
export async function registerGlobalShortcut(combo: string, onPressed: () => void): Promise<boolean> {
  if (!isTauri) return false
  try {
    const { register } = await import('@tauri-apps/plugin-global-shortcut')
    await register(combo, event => { if (event.state === 'Pressed') onPressed() })
    return true
  } catch {
    return false
  }
}

export async function unregisterGlobalShortcut(combo: string): Promise<void> {
  if (!isTauri) return
  try {
    const { unregister } = await import('@tauri-apps/plugin-global-shortcut')
    await unregister(combo)
  } catch { /* not registered, or already gone — fine either way */ }
}

// ---- secondary windows ----

/** Opens a named workspace in a brand-new window, leaving the current
 * window's live layout untouched. The new window boots with `?workspace=`
 * on its URL; `initTauri()` picks that up and loads the workspace instead of
 * the usual session restore. Window labels are prefixed "workspace-" to
 * match the capability grant in src-tauri/capabilities/default.json. */
export async function openWorkspaceInNewWindow(name: string): Promise<void> {
  if (!isTauri) return
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const label = 'workspace-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  new WebviewWindow(label, {
    url: 'index.html?workspace=' + encodeURIComponent(name),
    title: `FlexExplorer — ${name}`,
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    resizable: true,
    fullscreen: false,
    decorations: false,
    transparent: false,
    center: true,
    dragDropEnabled: false,
  })
}
