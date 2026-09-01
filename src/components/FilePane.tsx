import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useStore, NOTE_MIN_H, NOTE_MAX_H, navAvailability } from '../store/useStore'
import { iconOf, visibleIndices, fmt } from '../utils/fileUtils'
import { PANE_MIME } from './LayoutTabs'
import SegmentSwitcher from './SegmentSwitcher'
import { dragOut } from '../fs/bridge'
import { latestGenerationIndices } from '../utils/generations'
import { shellIcon, peekIcon, joinPath, splitPath, noteKey, copyText } from '../fs/bridge'
import type { Pane, FileEntry, ColumnDef, ColumnId } from '../types'

/** Returns the native Windows shell icon data URL for a file, or null while loading. */
function useShellIcon(name: string, folder: boolean): string | null {
  const [url, setUrl] = useState<string | null>(() => peekIcon(name, folder))
  useEffect(() => {
    const cached = peekIcon(name, folder)
    if (cached) { setUrl(cached); return }
    let cancelled = false
    shellIcon(name, folder).then(u => { if (!cancelled && u) setUrl(u) })
    return () => { cancelled = true }
  }, [name, folder])
  return url
}

const COL_LABEL: Record<ColumnId, string> = { name: '名前', date: '更新日時', size: 'サイズ' }
const TAB_MIME = 'application/x-flextab'
/** Files/folders dragged out of a pane's list. Payload: { pi, paths }. */
const FILE_MIME = 'application/x-flexfiles'

/** What's currently being dragged out of a list. `dragover` can't read
 * dataTransfer (the browser only exposes it on `drop`), so the payload is kept
 * here as well — otherwise the hover feedback couldn't tell copy from move. */
let filesDrag: { pi: number; paths: string[] } | null = null

/** Explorer's default: within one drive a drag moves, across drives it copies.
 * Ctrl forces a copy and Shift forces a move, either way. */
function dropMode(e: React.DragEvent, to: string, from = filesDrag?.paths[0] ?? ''): 'copy' | 'move' {
  if (e.ctrlKey) return 'copy'
  if (e.shiftKey) return 'move'
  const drive = (p: string) => p.slice(0, 2).toLowerCase()
  return from && drive(from) === drive(to) ? 'move' : 'copy'
}

/** Build the visible columns for a given pane width, dropping size then date when narrow. */
function visibleColumns(columns: ColumnDef[], pw: number): ColumnDef[] {
  let vis = columns
  if (pw < 300) vis = vis.filter(c => c.id !== 'size')
  if (pw < 220) vis = vis.filter(c => c.id !== 'date')
  return vis
}

function gridTemplate(cols: ColumnDef[]): string {
  // Every column is a fixed, resizable width; a trailing flexible track
  // absorbs any leftover space (like Explorer's details view).
  return cols.map(c => `${c.w}px`).join(' ') + ' minmax(0,1fr)'
}

function FolderIcon({ color }: { color: string }) {
  const s = 'var(--icon-box, 16px)'
  return (
    <span style={{ position: 'relative', width: s, height: `calc(${s} * 0.82)`, flex: `0 0 ${s}` }}>
      <span style={{ position: 'absolute', bottom: 0, width: '100%', height: '78%', borderRadius: '0 2px 2px 2px', background: color, opacity: 0.92 }} />
      <span style={{ position: 'absolute', top: 0, left: 0, width: '44%', height: '28%', borderRadius: '2px 2px 0 0', background: color }} />
    </span>
  )
}

function FileIcon({ color, soft, label }: { color: string; soft: string; label: string }) {
  const s = 'var(--icon-box, 16px)'
  return (
    <span style={{ width: s, height: s, flex: `0 0 ${s}`, borderRadius: 3, background: soft, border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 'calc(var(--icon-box, 16px) * 0.42)', fontWeight: 700, color, lineHeight: 1 }}>{label}</span>
  )
}

function CellContent({ col, file }: { col: ColumnDef; file: FileEntry }) {
  if (col.id === 'date') {
    return <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'clip' }}>{file.m || ''}</span>
  }
  if (col.id === 'size') {
    return <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', whiteSpace: 'nowrap' }}>{file.folder ? '—' : fmt(file.size)}</span>
  }
  return null // 'name' handled inline (needs icon)
}

/**
 * Inline rename editor, shown in place of the name cell. Selects only the
 * basename on mount (Explorer's behaviour — the extension stays intact unless
 * the user deliberately extends the selection).
 */
function RenameInput({ initial, folder }: { initial: string; folder: boolean }) {
  const commitRename = useStore(s => s.commitRename)
  const cancelRename = useStore(s => s.cancelRename)
  const ref = useRef<HTMLInputElement>(null)
  // Guards the blur handler so committing via Enter (which blurs on unmount)
  // can't fire the same rename twice.
  const doneRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf('.')
    if (!folder && dot > 0) el.setSelectionRange(0, dot)
    else el.select()
  }, [initial, folder])

  const finish = (commit: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    if (commit) void commitRename(ref.current?.value ?? initial)
    else cancelRename()
  }

  return (
    <input
      ref={ref}
      defaultValue={initial}
      autoComplete="off"
      spellCheck={false}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); finish(true) }
        if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      }}
      onBlur={() => finish(true)}
      style={{ flex: 1, minWidth: 0, height: 'calc(var(--row-h) - 6px)', border: '1px solid var(--accent)', outline: 'none', borderRadius: 4, background: 'var(--bg-page)', color: 'var(--text)', fontSize: 'var(--list-fs)', fontFamily: 'var(--font)', padding: '0 5px' }}
    />
  )
}

/** 戻る / 進む / 更新 for one pane, sitting at the left of its address bar.
 * Hidden entirely when 設定 > 既定 > ペインに戻る/進む/更新ボタンを表示 is off. */
function PaneNavButtons({ pi, path }: { pi: number; path: string[] }) {
  const navBack = useStore(s => s.navBack)
  const navForward = useStore(s => s.navForward)
  const navigate = useStore(s => s.navigate)
  // Recomputed on every render; a pane re-renders whenever `path` changes,
  // which is exactly when the history stacks change.
  const avail = navAvailability(pi)

  const Btn = ({ label, title, enabled, run }: { label: string; title: string; enabled: boolean; run: () => void }) => (
    <span
      onClick={e => { e.stopPropagation(); run() }}
      title={title}
      style={{ width: 20, height: 20, flex: '0 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 11, cursor: 'default', color: enabled ? 'var(--text-muted)' : 'var(--text-faint)', opacity: enabled ? 1 : 0.45 }}
      onMouseEnter={e => { if (enabled) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >{label}</span>
  )

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 1, flex: '0 0 auto', marginRight: 6 }}>
      <Btn label="←" title="戻る (Alt+←)" enabled={avail.back} run={() => navBack(pi)} />
      <Btn label="→" title="進む (Alt+→)" enabled={avail.forward} run={() => navForward(pi)} />
      <Btn label="↻" title="最新の情報に更新 (F5)" enabled run={() => void navigate(pi, path, { push: false })} />
    </span>
  )
}

function FileRow({ file, idx, pi, cols, gridCols, isActive, selected, focused, tabIdx, renaming, soleSelected, cut, latest, abs, selectedAbs }: {
  file: FileEntry; idx: number; pi: number; cols: ColumnDef[]; gridCols: string; isActive: boolean; selected: boolean; focused: boolean; tabIdx: number; renaming: boolean; soleSelected: boolean
  /** Sitting on the clipboard as a pending cut — shown faded, like Explorer. */
  cut: boolean
  /** Newest file of its generation set (see utils/generations). */
  latest: boolean
  /** Absolute path of this row. */
  abs: string
  /** Absolute paths of the whole selection, for dragging several at once. */
  selectedAbs: string[]
}) {
  const selectFile = useStore(s => s.selectFile)
  const dropOnFolder = useStore(s => s.dropOnFolder)
  const [dropInto, setDropInto] = useState(false)
  const openFile = useStore(s => s.openFile)
  const openCtx = useStore(s => s.openCtx)
  const startRename = useStore(s => s.startRename)
  const singleClickOpen = useStore(s => s.adv.singleClick)
  const ic = iconOf(file)
  const shellUrl = useShellIcon(file.name, !!file.folder)
  const zebra = useStore(s => s.opt.zebra)
  const bg = dropInto ? 'var(--accent-soft)'
    : selected ? (isActive ? 'var(--bg-active)' : 'var(--bg-hover)')
    : latest ? 'var(--accent-soft)'
    : (zebra && tabIdx % 2 === 1 ? 'var(--bg-stripe)' : 'transparent')

  // Explorer's "slow second click renames": a click on a row that is already
  // the sole selection starts an inline rename — but only after the
  // double-click window has passed, so opening the item still wins.
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPendingRename = () => {
    if (renameTimer.current) { clearTimeout(renameTimer.current); renameTimer.current = null }
  }
  useEffect(() => cancelPendingRename, [])

  const onClick = (e: React.MouseEvent) => {
    const wasSole = selected && soleSelected && isActive && !e.ctrlKey && !e.shiftKey && !renaming
    selectFile(pi, idx, e)
    cancelPendingRename()
    if (wasSole && !singleClickOpen) {
      renameTimer.current = setTimeout(() => { renameTimer.current = null; startRename(pi, idx) }, 500)
    }
  }

  return (
    <div
      draggable={!renaming}
      onDragStart={e => {
        cancelPendingRename()
        // Dragging a row outside the current selection drags just that row —
        // otherwise the whole selection travels together.
        // Ctrl+drag on an unselected row adds it to the selection, so what
        // travels should be that whole selection — not just the row grabbed.
        const paths = selected && selectedAbs.length
          ? selectedAbs
          : (e.ctrlKey || e.metaKey) && selectedAbs.length
            ? [...selectedAbs, abs]
            : [abs]
        if (!selected) selectFile(pi, idx, e as unknown as React.MouseEvent)
        // Alt+drag hands the files to the OS instead, so they can be dropped
        // on other apps. The in-app drag stays on the plain gesture.
        if (e.altKey) {
          e.preventDefault()
          void dragOut(paths)
          return
        }
        filesDrag = { pi, paths }
        e.dataTransfer.effectAllowed = 'copyMove'
        e.dataTransfer.setData(FILE_MIME, JSON.stringify({ pi, paths }))
        e.dataTransfer.setData('text/plain', paths.join('\n'))
      }}
      onDragEnd={() => { filesDrag = null }}
      onDragOver={e => {
        // Only folders take a drop; a file row lets the list background have it.
        if (!file.folder || !e.dataTransfer.types.includes(FILE_MIME)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = dropMode(e, abs)
        if (!dropInto) setDropInto(true)
      }}
      onDragLeave={() => setDropInto(false)}
      onDrop={e => {
        setDropInto(false)
        if (!file.folder || !e.dataTransfer.types.includes(FILE_MIME)) return
        e.preventDefault()
        e.stopPropagation()
        const { pi: srcPi, paths } = JSON.parse(e.dataTransfer.getData(FILE_MIME)) as { pi: number; paths: string[] }
        // Refuse to drop a folder into itself or into its own subtree.
        const low = abs.toLowerCase()
        if (paths.some(p => low === p.toLowerCase() || low.startsWith(p.toLowerCase() + '\\'))) return
        void dropOnFolder(splitPath(abs), paths, dropMode(e, abs, paths[0]), srcPi)
      }}
      onClick={onClick}
      onDoubleClick={() => { cancelPendingRename(); openFile(pi, idx) }}
      onContextMenu={e => { e.preventDefault(); cancelPendingRename(); openCtx(pi, idx, e.clientX, e.clientY) }}
      title={file.name}
      data-focused={focused && isActive ? '1' : undefined}
      style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', height: 'var(--row-h)', padding: '0 10px', gap: 8, fontSize: 'var(--list-fs)', background: bg, color: 'var(--text)', opacity: cut ? 0.45 : 1, borderBottom: '1px solid var(--col-divider)', cursor: 'default', userSelect: 'none', boxShadow: focused && isActive ? 'inset 0 0 0 1.5px var(--accent)' : 'none', borderRadius: focused && isActive ? 4 : 0 }}
    >
      {cols.map(col => col.id === 'name'
        ? (
          <div key="name" style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {latest && (
              <span
                title="この世代セットで最新のファイル"
                style={{ width: 3, height: 'calc(var(--row-h) - 6px)', flex: '0 0 3px', borderRadius: 2, background: 'var(--accent)', marginLeft: -6 }}
              />
            )}
            {shellUrl
              ? <img src={shellUrl} alt="" draggable={false} style={{ width: 'var(--icon-box, 16px)', height: 'var(--icon-box, 16px)', flex: '0 0 var(--icon-box, 16px)', objectFit: 'contain' }} />
              : (file.folder ? <FolderIcon color={ic.color} /> : <FileIcon color={ic.color} soft={ic.soft} label={ic.label} />)}
            {renaming
              ? <RenameInput initial={file.name} folder={!!file.folder} />
              : <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>}
          </div>
        )
        : <CellContent key={col.id} col={col} file={file} />
      )}
    </div>
  )
}

/**
 * Address-bar edit input. Focuses and selects its full text on mount, so
 * typing immediately replaces the whole path instead of inserting into
 * whatever position the cursor happened to land at (native `autoFocus` alone
 * focuses the element but doesn't reliably select its text — the DOM's
 * `value` assignment and the focus step can race, leaving the caret
 * collapsed at the end). Doing focus+select together in an effect, after
 * the DOM node already has its value, avoids that race.
 */
function AddressBarInput({ defaultValue, onSubmit, onDone }: {
  defaultValue: string
  onSubmit: (value: string) => void
  onDone: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  return (
    <input
      ref={ref}
      defaultValue={defaultValue}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        // Explicitly stop propagation so a global window-level keydown
        // listener can never race this input for the same keystroke (e.g.
        // if focus is ever ambiguous for a tick, a leaked keystroke here
        // must not fall through to app-wide shortcuts / type-ahead).
        e.stopPropagation()
        if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) onSubmit(v); onDone() }
        if (e.key === 'Escape') onDone()
      }}
      onBlur={onDone}
      style={{ flex: 1, minWidth: 0, border: '1px solid var(--accent)', outline: 'none', borderRadius: 5, background: 'var(--bg-page)', color: 'var(--text)', fontSize: 11.5, padding: '3px 8px', fontFamily: 'var(--mono)' }}
    />
  )
}

function ColumnHeader({ pi, cols, gridCols, sortKey, sortDir }: {
  pi: number; cols: ColumnDef[]; gridCols: string; sortKey: ColumnId | null | undefined; sortDir: 1 | -1 | undefined
}) {
  const startColDrag = useStore(s => s.startColDrag)
  const reorderColumns = useStore(s => s.reorderColumns)
  const setSort = useStore(s => s.setSort)
  const dragColRef = useRef<ColumnId | null>(null)
  const [overId, setOverId] = useState<ColumnId | null>(null)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', height: 26, flex: '0 0 26px', padding: '0 10px', gap: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
      {cols.map(col => (
        <div
          key={col.id}
          draggable
          onDragStart={e => { dragColRef.current = col.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col.id) }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overId !== col.id) setOverId(col.id) }}
          onDragLeave={() => setOverId(prev => (prev === col.id ? null : prev))}
          onDrop={e => { e.preventDefault(); if (dragColRef.current) reorderColumns(pi, dragColRef.current, col.id); dragColRef.current = null; setOverId(null) }}
          onDragEnd={() => { dragColRef.current = null; setOverId(null) }}
          onClick={() => setSort(pi, col.id)}
          title="クリックで並べ替え・ドラッグで列を移動"
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, justifyContent: col.id === 'size' ? 'flex-end' : 'flex-start', minWidth: 0, cursor: 'grab', userSelect: 'none', boxShadow: overId === col.id ? 'inset 2px 0 0 var(--accent)' : 'none' }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: sortKey === col.id ? 'var(--accent)' : undefined, fontWeight: sortKey === col.id ? 700 : 600 }}>{COL_LABEL[col.id]}</span>
          {sortKey === col.id && <span style={{ fontSize: 9, color: 'var(--accent)', flex: '0 0 auto' }}>{sortDir === -1 ? '▼' : '▲'}</span>}
          <span
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startColDrag(pi, col.id, e.clientX, col.w) }}
            onClick={e => e.stopPropagation()}
            draggable={false}
            title="ドラッグで列幅を調整"
            style={{ position: 'absolute', right: -8, top: -6, width: 12, height: 38, cursor: 'col-resize', zIndex: 2 }}
          />
        </div>
      ))}
    </div>
  )
}

/** Small right-click menu for a pane tab: pin, cleanup, close. */
function TabContextMenu({ pi, ti, x, y, pinned, onClose }: { pi: number; ti: number; x: number; y: number; pinned: boolean; onClose: () => void }) {
  const toggleTabPin = useStore(s => s.toggleTabPin)
  const cleanTabs = useStore(s => s.cleanTabs)
  const closeTab = useStore(s => s.closeTab)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  const Item = ({ label, run, danger }: { label: string; run: () => void; danger?: boolean }) => (
    <div
      onClick={() => { run(); onClose() }}
      style={{ padding: '7px 12px', fontSize: 12, cursor: 'default', borderRadius: 5, color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? 'var(--danger-soft)' : 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >{label}</div>
  )

  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 200, minWidth: 190, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)' }}>
      <Item label={pinned ? 'ピン留めを解除' : 'ピン留め'} run={() => toggleTabPin(pi, ti)} />
      <Item label="ピン留め以外のタブを閉じる" run={() => cleanTabs(pi)} />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
      <Item label="閉じる" run={() => closeTab(pi, ti)} danger />
    </div>
  )
}

/** Right-click menu for the address bar (edit / copy / jump to a pasted path). */
function AddressContextMenu({ pi, path, x, y, onClose }: { pi: number; path: string[]; x: number; y: number; onClose: () => void }) {
  const startAddressEdit = useStore(s => s.startAddressEdit)
  const navigate = useStore(s => s.navigate)
  const showToast = useStore(s => s.showToast)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  const Item = ({ label, shortcut, run }: { label: string; shortcut?: string; run: () => void }) => (
    <div
      onClick={() => { run(); onClose() }}
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 12px', fontSize: 12, cursor: 'default', borderRadius: 5, color: 'var(--text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
      {shortcut && <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-faint)' }}>{shortcut}</span>}
    </div>
  )

  return (
    <div ref={ref} style={{ position: 'fixed', left: Math.min(x, window.innerWidth - 230), top: y, zIndex: 200, minWidth: 214, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)' }}>
      <Item label="アドレスを編集" shortcut="Ctrl+L" run={() => startAddressEdit(pi)} />
      <Item label="パスをコピー" run={() => { void copyText(joinPath(path)).then(ok => showToast(ok ? 'パスをコピーしました' : 'コピーに失敗')) }} />
      <Item label="コピー済みのパスへ移動" run={() => {
        void navigator.clipboard.readText()
          .then(t => {
            const v = t.trim().replace(/^"|"$/g, '')
            if (v) void navigate(pi, splitPath(v))
            else showToast('クリップボードが空です')
          })
          .catch(() => showToast('クリップボードを読み取れません'))
      }} />
    </div>
  )
}

/**
 * Per-folder sticky memo, pinned to the bottom of the pane. The note is stored
 * outside the folder (see src-tauri/src/notes.rs) so it stays private to this
 * machine even for shared or read-only folders. Height is user-draggable and
 * persisted per folder; width simply follows the pane.
 */
function FolderNotePanel({ path }: { path: string[] }) {
  const key = noteKey(path)
  const note = useStore(s => s.notes[key])
  const setNoteText = useStore(s => s.setNoteText)
  const setNoteHeight = useStore(s => s.setNoteHeight)
  const toggleNoteCollapsed = useStore(s => s.toggleNoteCollapsed)
  const removeNote = useStore(s => s.removeNote)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // A memo that opens empty was just created from the menu — jump straight in.
  const autoFocus = useRef(!note?.text)

  useEffect(() => {
    if (autoFocus.current && note && !note.collapsed) { taRef.current?.focus(); autoFocus.current = false }
  }, [note])

  if (!note) return null

  const onResizeDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startY = e.clientY
    const startH = note.h
    const move = (ev: MouseEvent) => setNoteHeight(key, startH - (ev.clientY - startY))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const HeadBtn = ({ label, title, onClick, danger }: { label: string; title: string; onClick: () => void; danger?: boolean }) => (
    <span
      title={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{ width: 18, height: 18, flex: '0 0 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 10.5, color: 'var(--text-faint)' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--danger-soft)' : 'var(--bg-hover)'; e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
    >{label}</span>
  )

  return (
    <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--border)', background: 'var(--warn-soft)' }}>
      {!note.collapsed && (
        <div
          onMouseDown={onResizeDown}
          title="ドラッグで高さを調整"
          style={{ height: 5, cursor: 'row-resize', background: 'transparent' }}
        />
      )}
      <div
        onClick={() => { if (note.collapsed) toggleNoteCollapsed(key) }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px', fontSize: 11, color: 'var(--text-muted)', cursor: 'default', userSelect: 'none' }}
      >
        <span style={{ flex: '0 0 auto' }}>📌</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
          メモ{note.collapsed && note.text ? `: ${note.text.split('\n')[0]}` : ''}
        </span>
        {!note.collapsed && note.updated && <span style={{ flex: '0 0 auto', fontSize: 10, opacity: 0.7 }}>{note.updated}</span>}
        <HeadBtn label={note.collapsed ? '▴' : '▾'} title={note.collapsed ? '展開' : '折りたたむ'} onClick={() => toggleNoteCollapsed(key)} />
        <HeadBtn label="🗑" title="このメモを削除" onClick={() => removeNote(key)} danger />
      </div>
      {!note.collapsed && (
        <textarea
          ref={taRef}
          value={note.text}
          onChange={e => setNoteText(key, e.target.value)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') e.currentTarget.blur() }}
          placeholder="このフォルダについてのメモ（自分だけに表示されます）"
          spellCheck={false}
          style={{
            display: 'block', width: '100%', height: Math.max(NOTE_MIN_H, Math.min(NOTE_MAX_H, note.h)),
            boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'none',
            background: 'transparent', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12, lineHeight: 1.55,
            padding: '0 10px 8px',
          }}
        />
      )}
    </div>
  )
}

export default function FilePane({ pane, pi, spanCols }: { pane: Pane; pi: number; spanCols: number }) {
  const activePane = useStore(s => s.activePane)
  const paneCols = useStore(s => s.gridCols)
  const containerW = useStore(s => s.containerW)
  const search = useStore(s => s.search)
  const searchMode = useStore(s => s.searchMode)
  const dimInactive = useStore(s => s.opt.dimInactive)
  const anim = useStore(s => s.opt.anim)
  const panesLen = useStore(s => s.panes.length)
  const setActivePane = useStore(s => s.setActivePane)
  const switchTab = useStore(s => s.switchTab)
  const closeTab = useStore(s => s.closeTab)
  const newTab = useStore(s => s.newTab)
  const closePane = useStore(s => s.closePane)
  const swapPanesAt = useStore(s => s.swapPanesAt)
  const navBreadcrumb = useStore(s => s.navBreadcrumb)
  const cleanTabs = useStore(s => s.cleanTabs)
  const moveTabToPane = useStore(s => s.moveTabToPane)
  const addressEdit = useStore(s => s.addressEdit)
  const startAddressEdit = useStore(s => s.startAddressEdit)
  const endAddressEdit = useStore(s => s.endAddressEdit)
  const navigate = useStore(s => s.navigate)
  const openCtxBg = useStore(s => s.openCtxBg)
  const dropOnFolder = useStore(s => s.dropOnFolder)
  const renaming = useStore(s => s.renaming)
  const clip = useStore(s => s.clip)
  const paneNavButtons = useStore(s => s.adv.paneNavButtons)
  const showHidden = useStore(s => s.adv.hidden)
  const genHighlight = useStore(s => s.genHighlight)
  const genRules = useStore(s => s.genRules)
  const [paneDragOver, setPaneDragOver] = useState(false)
  const [listDropOver, setListDropOver] = useState(false)
  const [tabDragOver, setTabDragOver] = useState<{ ti: number; side: 'before' | 'after' } | null>(null)
  const [tabCtx, setTabCtx] = useState<{ ti: number; x: number; y: number } | null>(null)
  const [addrCtx, setAddrCtx] = useState<{ x: number; y: number } | null>(null)
  /** Which breadcrumb segment has its ▼ switcher open, if any. */
  const [swapCi, setSwapCi] = useState<{ ci: number; x: number; y: number } | null>(null)

  const isActive = pi === activePane
  const renamingIdx = renaming && renaming.pi === pi ? renaming.idx : -1
  // Pending-cut paths, lowercased for case-insensitive matching against rows.
  const cutPaths = useMemo(
    () => new Set(clip?.mode === 'cut' ? clip.paths.map(p => p.toLowerCase()) : []),
    [clip],
  )
  const tab = pane.tabs[pane.active]
  const dirAbs = joinPath(tab.path)
  // Absolute paths of the current selection, handed to each row so a drag can
  // carry the whole selection rather than just the row that started it.
  const selAbs = useMemo(
    () => tab.sel.map(i => tab.files[i]).filter(Boolean).map(f => f.abs || joinPath([...tab.path, f.name])),
    [tab.sel, tab.files, tab.path],
  )
  // Newest member of each generation set, when the toolbar toggle is on.
  const latestIdx = useMemo(
    () => (genHighlight ? latestGenerationIndices(tab.files, genRules) : new Set<number>()),
    [genHighlight, genRules, tab.files],
  )
  const pw = (containerW || 900) / Math.max(1, paneCols) * spanCols - 18
  const cols = visibleColumns(tab.columns, pw)
  const gridCols = gridTemplate(cols)
  const q = searchMode === 'filter' ? search.trim().toLowerCase() : ''
  const vis = visibleIndices(tab, q, showHidden)

  // Keep the focused row visible when focus moves via the keyboard.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isActive) return
    const el = listRef.current?.querySelector('[data-focused="1"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [tab.focus, tab.id, isActive])

  const paneStyle: React.CSSProperties = {
    // In the 2-pane split layout (App.tsx) this is a plain block child of a
    // width-only wrapper div, not itself a flex/grid item — without an
    // explicit height it shrinks to its content (fewer files = a shorter
    // pane) instead of matching its sibling. height:100% makes it always
    // fill whatever definite height its container already has, in both that
    // wrapper and the CSS-grid layout (where it's a real grid item stretched
    // by the grid's own default alignment; explicit height is redundant
    // there but harmless).
    position: 'relative', minWidth: 0, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column',
    gridColumn: spanCols > 1 ? `span ${spanCols}` : undefined,
  }

  const cardStyle: React.CSSProperties = {
    flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
    background: 'var(--bg-panel)',
    border: paneDragOver ? '2px dashed var(--accent)' : isActive ? '1.5px solid var(--accent)' : '1px solid var(--border)',
    borderRadius: 'var(--radius)', overflow: 'hidden',
    boxShadow: isActive ? '0 0 0 3px var(--accent-soft)' : '0 1px 2px var(--shadow)',
    opacity: !isActive && dimInactive ? 0.62 : 1,
    transition: anim === 'off' ? 'none' : 'opacity .15s',
  }

  const onPaneDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-flexpane')) { e.preventDefault(); if (!paneDragOver) setPaneDragOver(true) }
  }
  const onPaneDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-flexpane')) return
    e.preventDefault()
    const src = parseInt(e.dataTransfer.getData('application/x-flexpane'), 10)
    if (!isNaN(src)) swapPanesAt(src, pi)
    setPaneDragOver(false)
  }

  const dropTab = (e: React.DragEvent, destTi: number) => {
    if (!e.dataTransfer.types.includes(TAB_MIME)) return
    e.preventDefault()
    const raw = e.dataTransfer.getData(TAB_MIME)
    setTabDragOver(null)
    if (!raw) return
    try {
      const { pi: srcPi, ti: srcTi } = JSON.parse(raw) as { pi: number; ti: number }
      moveTabToPane(srcPi, srcTi, pi, destTi)
    } catch { /* ignore malformed payload */ }
  }

  return (
    <div
      onMouseDown={() => setActivePane(pi)}
      onDragOver={onPaneDragOver}
      onDragLeave={() => setPaneDragOver(false)}
      onDrop={onPaneDrop}
      style={paneStyle}
    >
      <div style={cardStyle}>
        {/* Tab bar */}
        <div style={{ display: 'flex', alignItems: 'stretch', height: 34, flex: '0 0 34px', background: 'var(--bg-sunken)', borderBottom: '1px solid var(--border)', overflowX: 'auto', overflowY: 'hidden' }}>
          {panesLen > 1 && (
            <div
              draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('application/x-flexpane', String(pi))
                // Same drag, second destination: dropped on a group tab this
                // moves the pane into that group (see LayoutTabs).
                e.dataTransfer.setData(PANE_MIME, String(pi))
                e.dataTransfer.setData('text/plain', 'pane')
              }}
              title="ドラッグして他のペインと入れ替え / グループタブに落とすとそのグループへ移動"
              style={{ width: 22, flex: '0 0 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: 'var(--text-faint)', fontSize: 13, borderRight: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)', e.currentTarget.style.color = 'var(--text-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '', e.currentTarget.style.color = 'var(--text-faint)')}
            >⠿</div>
          )}
          {pane.tabs.map((t, ti) => {
            const act = ti === pane.active
            const dragSide = tabDragOver?.ti === ti ? tabDragOver.side : null
            return (
              <div
                key={t.id}
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(TAB_MIME, JSON.stringify({ pi, ti })) }}
                onDragOver={e => {
                  if (!e.dataTransfer.types.includes(TAB_MIME)) return
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  const side = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
                  setTabDragOver(prev => (prev?.ti === ti && prev.side === side) ? prev : { ti, side })
                }}
                onDragLeave={() => setTabDragOver(prev => (prev?.ti === ti ? null : prev))}
                onDrop={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const side = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
                  let dest = ti + (side === 'after' ? 1 : 0)
                  if (e.dataTransfer.types.includes(TAB_MIME)) {
                    const raw = e.dataTransfer.getData(TAB_MIME)
                    if (raw) { try { const src = JSON.parse(raw) as { pi: number; ti: number }; if (src.pi === pi && src.ti < dest) dest-- } catch { /* ignore */ } }
                  }
                  dropTab(e, dest)
                }}
                onClick={() => switchTab(pi, ti)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTabCtx({ ti, x: e.clientX, y: e.clientY }) }}
                title={t.title}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, height: '100%', padding: '0 10px', fontSize: 12, cursor: 'default', whiteSpace: 'nowrap',
                  color: act ? 'var(--text)' : 'var(--text-muted)', background: act ? 'var(--bg-panel)' : 'transparent',
                  borderRight: '1px solid var(--border)', borderTop: act ? '2px solid var(--accent)' : '2px solid transparent',
                  borderBottom: act ? '1px solid var(--bg-panel)' : '1px solid var(--border)', marginBottom: -1,
                  boxShadow: dragSide === 'before' ? 'inset 2px 0 0 var(--accent)' : dragSide === 'after' ? 'inset -2px 0 0 var(--accent)' : 'none',
                }}
              >
                {t.pinned && <span title="ピン留め" style={{ fontSize: 10.5, flex: '0 0 auto' }}>📌</span>}
                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                {!t.pinned && (
                  <span
                    onClick={e => { e.stopPropagation(); closeTab(pi, ti) }}
                    style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 11, color: 'var(--text-faint)', flex: '0 0 16px' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)', e.currentTarget.style.color = 'var(--text)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '', e.currentTarget.style.color = 'var(--text-faint)')}
                  >✕</span>
                )}
              </div>
            )
          })}
          <div
            onClick={() => newTab(pi)}
            title="新しいタブ"
            style={{ width: 30, flex: '0 0 30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', color: 'var(--text-muted)', fontSize: 15 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)', e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.background = '', e.currentTarget.style.color = 'var(--text-muted)')}
          >+</div>
          <div
            style={{ flex: 1 }}
            onDragOver={e => { if (e.dataTransfer.types.includes(TAB_MIME)) e.preventDefault() }}
            onDrop={e => dropTab(e, pane.tabs.length)}
          />
          <div
            onClick={() => cleanTabs(pi)}
            title="ピン留め以外のタブを閉じる"
            style={{ width: 26, flex: '0 0 26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', color: 'var(--text-faint)', fontSize: 12 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)', e.currentTarget.style.color = 'var(--text-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = '', e.currentTarget.style.color = 'var(--text-faint)')}
          >🧹</div>
          {panesLen > 1 && (
            <div
              onClick={e => { e.stopPropagation(); closePane(pi) }}
              title="このペインを閉じる"
              style={{ width: 28, flex: '0 0 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', color: 'var(--text-faint)', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-soft)', e.currentTarget.style.color = 'var(--danger)')}
              onMouseLeave={e => (e.currentTarget.style.background = '', e.currentTarget.style.color = 'var(--text-faint)')}
            >✕</div>
          )}
        </div>

        {tabCtx && (
          <TabContextMenu pi={pi} ti={tabCtx.ti} x={tabCtx.x} y={tabCtx.y} pinned={!!pane.tabs[tabCtx.ti]?.pinned} onClose={() => setTabCtx(null)} />
        )}

        {/* Breadcrumb / address bar.
            Editing can be started four ways, so a long path never forces a trip
            to the far right edge: click the current (last) crumb, click the
            sticky ✎ button, right-click anywhere on the bar, or Ctrl+L / F4. */}
        <div
          onClick={() => { if (addressEdit !== pi) startAddressEdit(pi) }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setActivePane(pi); setAddrCtx({ x: e.clientX, y: e.clientY }) }}
          title="クリックでパスを編集（右クリックでメニュー）"
          style={{ display: 'flex', alignItems: 'center', height: 30, flex: '0 0 30px', padding: addressEdit === pi ? '0 7px' : '0 10px', borderBottom: '1px solid var(--border)', fontSize: 11.5, overflowX: 'auto', whiteSpace: 'nowrap' }}
        >
          {paneNavButtons && addressEdit !== pi && (
            <PaneNavButtons pi={pi} path={tab.path} />
          )}
          {addressEdit === pi ? (
            <AddressBarInput
              defaultValue={joinPath(tab.path)}
              onSubmit={v => { if (v) void navigate(pi, splitPath(v)) }}
              onDone={endAddressEdit}
            />
          ) : (
            <>
              {tab.path.map((seg, ci) => {
                const last = ci === tab.path.length - 1
                // The drive/share root has no siblings to swap between, and the
                // last crumb is the edit affordance, so neither gets a ▾.
                const swappable = ci > 0 && !last
                return (
                  <span key={ci} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span
                      onClick={e => { e.stopPropagation(); if (last) startAddressEdit(pi); else navBreadcrumb(pi, ci) }}
                      title={last ? 'クリックでパスを編集' : seg + ' へ移動'}
                      style={{ padding: '2px 7px', borderRadius: 4, cursor: 'default', color: last ? 'var(--text)' : 'var(--text-muted)', fontWeight: last ? 600 : 400, flex: '0 0 auto' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = last ? 'var(--text)' : 'var(--text-muted)' }}
                    >{seg}</span>
                    {swappable && (
                      <span
                        onClick={e => {
                          e.stopPropagation()
                          const r = e.currentTarget.getBoundingClientRect()
                          setSwapCi(v => (v?.ci === ci ? null : { ci, x: r.left, y: r.bottom + 2 }))
                        }}
                        title={'この階層だけ切り替え（下の階層は維持）'}
                        style={{ padding: '2px 3px', borderRadius: 4, cursor: 'default', fontSize: 8, flex: '0 0 auto', color: swapCi?.ci === ci ? 'var(--accent)' : 'var(--text-faint)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = swapCi?.ci === ci ? 'var(--accent)' : 'var(--text-faint)' }}
                      >▼</span>
                    )}
                    {swapCi?.ci === ci && (
                      <SegmentSwitcher pi={pi} path={tab.path} ci={ci} anchor={{ x: swapCi.x, y: swapCi.y }} onClose={() => setSwapCi(null)} />
                    )}
                    {!last && <span style={{ color: 'var(--text-faint)', padding: '0 1px', flex: '0 0 auto' }}>›</span>}
                  </span>
                )
              })}
              {/* Sticks to the right edge of the bar, so it stays reachable
                  however far the breadcrumbs scroll. */}
              <span
                onClick={e => { e.stopPropagation(); startAddressEdit(pi) }}
                title="パスを編集 (Ctrl+L / F4)"
                style={{ position: 'sticky', right: 0, marginLeft: 'auto', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 20, borderRadius: 4, cursor: 'default', fontSize: 11, color: 'var(--text-faint)', background: 'var(--bg-panel)', boxShadow: '-8px 0 8px -2px var(--bg-panel)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)' }}
              >✎</span>
            </>
          )}
        </div>

        {addrCtx && (
          <AddressContextMenu pi={pi} path={tab.path} x={addrCtx.x} y={addrCtx.y} onClose={() => setAddrCtx(null)} />
        )}

        {/* Column header */}
        <ColumnHeader pi={pi} cols={cols} gridCols={gridCols} sortKey={tab.sortKey} sortDir={tab.sortDir} />

        {/* File list */}
        <div
          ref={listRef}
          onContextMenu={e => { if (e.target === e.currentTarget) { e.preventDefault(); openCtxBg(pi, e.clientX, e.clientY) } }}
          onDragOver={e => {
            if (!e.dataTransfer.types.includes(FILE_MIME)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = dropMode(e, dirAbs)
            if (!listDropOver) setListDropOver(true)
          }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setListDropOver(false) }}
          onDrop={e => {
            setListDropOver(false)
            if (!e.dataTransfer.types.includes(FILE_MIME)) return
            e.preventDefault()
            const { pi: srcPi, paths } = JSON.parse(e.dataTransfer.getData(FILE_MIME)) as { pi: number; paths: string[] }
            // Same guard as the folder rows: dropping a folder into its own
            // subtree would have the copy walk into what it is creating.
            const low = dirAbs.toLowerCase()
            if (paths.some(p => low === p.toLowerCase() || low.startsWith(p.toLowerCase() + '\\'))) return
            // Anywhere in the empty list means "into the folder being shown".
            void dropOnFolder(tab.path, paths, dropMode(e, dirAbs, paths[0]), srcPi)
          }}
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative', outline: listDropOver ? '2px solid var(--accent)' : 'none', outlineOffset: -2 }}
        >
          {vis.map((idx, row) => (
            <FileRow
              key={tab.files[idx].name + idx}
              file={tab.files[idx]}
              idx={idx}
              pi={pi}
              cols={cols}
              gridCols={gridCols}
              isActive={isActive}
              selected={tab.sel.includes(idx)}
              focused={tab.focus === idx}
              tabIdx={row}
              renaming={renamingIdx === idx}
              soleSelected={tab.sel.length === 1}
              cut={cutPaths.has((tab.files[idx].abs || joinPath([...tab.path, tab.files[idx].name])).toLowerCase())}
              latest={latestIdx.has(idx)}
              abs={tab.files[idx].abs || joinPath([...tab.path, tab.files[idx].name])}
              selectedAbs={selAbs}
            />
          ))}
        </div>

        {/* Folder sticky memo (private, stored per folder) */}
        <FolderNotePanel path={tab.path} />
      </div>
    </div>
  )
}
