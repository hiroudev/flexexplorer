import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { iconOf, visibleIndices, fmt } from '../utils/fileUtils'
import { shellIcon, peekIcon, joinPath, splitPath } from '../fs/bridge'
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

function FileRow({ file, idx, pi, cols, gridCols, isActive, selected, focused, tabIdx }: {
  file: FileEntry; idx: number; pi: number; cols: ColumnDef[]; gridCols: string; isActive: boolean; selected: boolean; focused: boolean; tabIdx: number
}) {
  const selectFile = useStore(s => s.selectFile)
  const openFile = useStore(s => s.openFile)
  const openCtx = useStore(s => s.openCtx)
  const ic = iconOf(file)
  const shellUrl = useShellIcon(file.name, !!file.folder)
  const zebra = useStore(s => s.opt.zebra)
  const bg = selected ? (isActive ? 'var(--bg-active)' : 'var(--bg-hover)') : (zebra && tabIdx % 2 === 1 ? 'var(--bg-stripe)' : 'transparent')

  return (
    <div
      onClick={e => selectFile(pi, idx, e as React.MouseEvent)}
      onDoubleClick={() => openFile(pi, idx)}
      onContextMenu={e => { e.preventDefault(); openCtx(pi, idx, e.clientX, e.clientY) }}
      title={file.name}
      data-focused={focused && isActive ? '1' : undefined}
      style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', height: 'var(--row-h)', padding: '0 10px', gap: 8, fontSize: 'var(--list-fs)', background: bg, color: 'var(--text)', borderBottom: '1px solid var(--col-divider)', cursor: 'default', userSelect: 'none', boxShadow: focused && isActive ? 'inset 0 0 0 1.5px var(--accent)' : 'none', borderRadius: focused && isActive ? 4 : 0 }}
    >
      {cols.map(col => col.id === 'name'
        ? (
          <div key="name" style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {shellUrl
              ? <img src={shellUrl} alt="" draggable={false} style={{ width: 'var(--icon-box, 16px)', height: 'var(--icon-box, 16px)', flex: '0 0 var(--icon-box, 16px)', objectFit: 'contain' }} />
              : (file.folder ? <FolderIcon color={ic.color} /> : <FileIcon color={ic.color} soft={ic.soft} label={ic.label} />)}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
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
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
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
  const [paneDragOver, setPaneDragOver] = useState(false)
  const [tabDragOver, setTabDragOver] = useState<{ ti: number; side: 'before' | 'after' } | null>(null)
  const [tabCtx, setTabCtx] = useState<{ ti: number; x: number; y: number } | null>(null)

  const isActive = pi === activePane
  const tab = pane.tabs[pane.active]
  const pw = (containerW || 900) / Math.max(1, paneCols) * spanCols - 18
  const cols = visibleColumns(tab.columns, pw)
  const gridCols = gridTemplate(cols)
  const q = searchMode === 'filter' ? search.trim().toLowerCase() : ''
  const vis = visibleIndices(tab, q)

  // Keep the focused row visible when focus moves via the keyboard.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isActive) return
    const el = listRef.current?.querySelector('[data-focused="1"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [tab.focus, tab.id, isActive])

  const paneStyle: React.CSSProperties = {
    position: 'relative', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
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
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-flexpane', String(pi)); e.dataTransfer.setData('text/plain', 'pane') }}
              title="ドラッグして他のペインと入れ替え"
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

        {/* Breadcrumb / address bar */}
        <div
          onClick={() => { if (addressEdit !== pi) startAddressEdit(pi) }}
          style={{ display: 'flex', alignItems: 'center', height: 30, flex: '0 0 30px', padding: addressEdit === pi ? '0 7px' : '0 10px', borderBottom: '1px solid var(--border)', fontSize: 11.5, overflowX: 'auto', whiteSpace: 'nowrap' }}
        >
          {addressEdit === pi ? (
            <AddressBarInput
              defaultValue={joinPath(tab.path)}
              onSubmit={v => { if (v) void navigate(pi, splitPath(v)) }}
              onDone={endAddressEdit}
            />
          ) : (
            tab.path.map((seg, ci) => (
              <span key={ci} style={{ display: 'flex', alignItems: 'center' }}>
                <span
                  onClick={e => { e.stopPropagation(); navBreadcrumb(pi, ci) }}
                  style={{ padding: '2px 7px', borderRadius: 4, cursor: 'default', color: ci === tab.path.length - 1 ? 'var(--text)' : 'var(--text-muted)', fontWeight: ci === tab.path.length - 1 ? 600 : 400, flex: '0 0 auto' }}
                  onMouseEnter={e => { if (ci < tab.path.length - 1) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' } }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = ci === tab.path.length - 1 ? 'var(--text)' : 'var(--text-muted)' }}
                >{seg}</span>
                {ci < tab.path.length - 1 && <span style={{ color: 'var(--text-faint)', padding: '0 1px', flex: '0 0 auto' }}>›</span>}
              </span>
            ))
          )}
        </div>

        {/* Column header */}
        <ColumnHeader pi={pi} cols={cols} gridCols={gridCols} sortKey={tab.sortKey} sortDir={tab.sortDir} />

        {/* File list */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
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
            />
          ))}
        </div>
      </div>
    </div>
  )
}
