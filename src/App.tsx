import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useStore, rowCount } from './store/useStore'
import TitleBar from './components/TitleBar'
import ToolBar from './components/ToolBar'
import SideBar from './components/SideBar'
import FilePane from './components/FilePane'
import Inspector from './components/Inspector'
import StatusBar from './components/StatusBar'
import ContextMenu from './components/ContextMenu'
import Toast from './components/Toast'
import RenameModal from './components/modals/RenameModal'
import OptionsModal from './components/modals/OptionsModal'
import WorkspacesModal from './components/modals/WorkspacesModal'
import GuideModal from './components/modals/GuideModal'
import CommandPalette from './components/overlays/CommandPalette'
import GoToOverlay from './components/overlays/GoToOverlay'
import QuickOpenOverlay from './components/overlays/QuickOpenOverlay'
import { ConfirmDialog, ConflictDialog, TransferProgressBar } from './components/overlays/TransferOverlays'
import { onOpenInTmpPane, onTransferProgress, onTransferDone } from './fs/bridge'
import { comboOf, runBinding } from './keys'

export default function App() {
  const dragMove = useStore(s => s.dragMove)
  const dragEnd = useStore(s => s.dragEnd)
  const setContainerW = useStore(s => s.setContainerW)
  const closeCtx = useStore(s => s.closeCtx)
  const modal = useStore(s => s.modal)
  const paletteOpen = useStore(s => s.palette.open)
  const gotoOpen = useStore(s => s.goto.open)
  const quickOpenOpen = useStore(s => s.quickOpen.open)
  const accent = useStore(s => s.opt.accent)
  const binds = useStore(s => s.binds)

  const panesRef = useRef<HTMLDivElement>(null)

  // Under Tauri, replace the mock panes with real directory listings.
  useEffect(() => { void useStore.getState().initTauri() }, [])

  // System-wide "quick open" hotkey (default Ctrl+Alt+O, user-configurable
  // in Options > ショートカット) — works even without focus, unlike every
  // other shortcut here which is just a plain window keydown listener.
  useEffect(() => { void useStore.getState().registerQuickOpenHotkey() }, [])

  // A relaunch caught by the single-instance plugin (BlueWind, Win+R,
  // FlexFind's "FlexExplorerで表示", …) lands here instead of opening a
  // second window — show the requested folder in the "tmp" layout group.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    void onOpenInTmpPane(path => useStore.getState().openInTmpGroup(path)).then(u => { unlisten = u })
    return () => unlisten?.()
  }, [])

  // Copy/move runs in a background thread on the Rust side and reports back
  // through these two events (see src-tauri/src/transfer.rs).
  useEffect(() => {
    const un: Array<() => void> = []
    void onTransferProgress(p => useStore.getState().onTransferTick(p)).then(u => un.push(u))
    void onTransferDone(d => void useStore.getState().onTransferDone(d)).then(u => un.push(u))
    return () => un.forEach(u => u())
  }, [])

  // Track pane container width for responsive columns
  useEffect(() => {
    const el = panesRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [setContainerW])

  // Global keyboard handler.
  //
  // Bindable actions are dispatched through `binds` (Options > ショートカット)
  // rather than matched here, so rebinding one actually takes effect — see
  // keys.ts. What stays hard-coded below is the set that isn't rebindable:
  // list movement, type-ahead, and the Esc/Tab conventions.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // Escape closes whatever is on top, wherever focus is.
      if (e.key === 'Escape') {
        closeCtx()
        useStore.getState().closePalette()
        useStore.getState().closeGoto()
        useStore.getState().closeQuickOpen()
        useStore.getState().closeConfirm()
        void useStore.getState().resolveConflict(null)
        useStore.getState().closeModal()
        return
      }

      const combo = comboOf(e)

      // These few reach in from anywhere, including from inside a text field,
      // because they're how you get *out* to another surface.
      if (combo && (combo === binds['cmd.palette'] || combo === binds['cmd.options'] ||
          combo === binds['cmd.goto'] || combo === binds['cmd.workspaces'] || combo === binds['cmd.guide'])) {
        e.preventDefault(); runBinding(combo, binds, useStore); return
      }

      // Everything else stays out of the way of modals, overlays and inputs.
      if (modal || paletteOpen || gotoOpen || quickOpenOpen || inInput) return
      if (useStore.getState().confirm || useStore.getState().conflict) return

      // Ctrl+1…9 selects the nth tab of the active pane (fixed, not rebindable —
      // it's a family of ten combos rather than one action).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const s0 = useStore.getState()
        const ti = Number(e.key) - 1
        if (ti < s0.panes[s0.activePane].tabs.length) s0.switchTab(s0.activePane, ti)
        return
      }

      if (combo && runBinding(combo, binds, useStore)) { e.preventDefault(); return }

      const st = useStore.getState()
      const ap = st.activePane
      // Switch the active pane (dual-pane file-manager convention: Tab / Shift+Tab).
      if (e.key === 'Tab') { e.preventDefault(); st.cyclePane(e.shiftKey ? -1 : 1); return }
      if (e.key === 'F4') { e.preventDefault(); st.startAddressEdit(ap); return }
      if (e.key === 'Home') { e.preventDefault(); st.focusEdge('home'); return }
      if (e.key === 'End') { e.preventDefault(); st.focusEdge('end'); return }
      // Type-ahead: jump to entries by typed prefix (Explorer-style).
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
        st.typeAhead(e.key)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modal, paletteOpen, gotoOpen, quickOpenOpen, binds, closeCtx])

  // Mouse drag events
  useEffect(() => {
    const onMove = (e: MouseEvent) => dragMove(e.clientX, e.clientY)
    const onUp = () => dragEnd()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragMove, dragEnd])

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
        background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'var(--font)',
        // Apply a custom accent color (and its soft tint) when chosen in Options.
        ...(accent ? { ['--accent' as string]: accent, ['--accent-soft' as string]: accent + '22' } : {}),
      } as CSSProperties}
    >
      <TitleBar />
      <ToolBar />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <SideBar />

        {/* Panes + Inspector */}
        <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
          {/* File panes.
              One CSS grid whose column/row weights the user can drag. The
              splitters live in their own gutter tracks and span the whole grid
              (a column splitter covers every row, a row splitter every column),
              so moving one boundary never staggers the panes either side of it
              — the pane edges stay on one straight line by construction. */}
          <PaneGrid panesRef={panesRef} />

          <Inspector />
        </div>
      </div>

      <StatusBar />

      {/* Overlays */}
      <ContextMenu />
      <Toast />
      <RenameModal />
      <OptionsModal />
      <WorkspacesModal />
      <GuideModal />
      <CommandPalette />
      <GoToOverlay />
      <QuickOpenOverlay />
      <ConfirmDialog />
      <ConflictDialog />
      <TransferProgressBar />
    </div>
  )
}

const GUTTER = 8

/** The resizable pane grid: `gridCols` columns × as many rows as the panes
 * need, with a draggable gutter track between every pair of tracks. */
function PaneGrid({ panesRef }: { panesRef: React.RefObject<HTMLDivElement | null> }) {
  const panes = useStore(s => s.panes)
  const gridCols = useStore(s => s.gridCols)
  const colFracs = useStore(s => s.colFracs)
  const rowFracs = useStore(s => s.rowFracs)
  const startTrackDrag = useStore(s => s.startTrackDrag)

  const cols = Math.max(1, gridCols)
  const rows = rowCount(panes.length, cols)
  // Stored weights can lag the pane count by a render (a pane was just added or
  // closed); pad/trim so the template always has exactly the right track count.
  const cf = fitLocal(colFracs, cols)
  const rf = fitLocal(rowFracs, rows)

  // "1fr 8px 2fr" — data tracks at even indices, gutters at odd ones.
  const template = (fr: number[]) => fr.map(f => `${f}fr`).join(` ${GUTTER}px `)

  const beginDrag = (axis: 'col' | 'row', index: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    const el = panesRef.current
    if (!el) return
    const total = axis === 'col'
      ? el.clientWidth - GUTTER * (cols - 1)
      : el.clientHeight - GUTTER * (rows - 1)
    startTrackDrag(axis, index, axis === 'col' ? e.clientX : e.clientY, Math.max(1, total))
  }

  return (
    <div
      ref={panesRef as React.RefObject<HTMLDivElement>}
      data-panes
      style={{
        flex: 1, display: 'grid', padding: 8, minWidth: 0, minHeight: 0, overflow: 'hidden',
        gridTemplateColumns: template(cf),
        gridTemplateRows: template(rf),
      }}
    >
      {panes.map((pane, pi) => {
        const r = Math.floor(pi / cols)
        const c = pi % cols
        // A final row that doesn't fill its columns lets the last pane stretch
        // across the leftovers, gutters included.
        const rem = panes.length % cols
        const span = (pi === panes.length - 1 && rem !== 0) ? cols - rem + 1 : 1
        return (
          <div
            key={pi}
            style={{
              gridColumn: `${c * 2 + 1} / span ${span * 2 - 1}`,
              gridRow: `${r * 2 + 1}`,
              minWidth: 0, minHeight: 0, overflow: 'hidden',
            }}
          >
            <FilePane pane={pane} pi={pi} spanCols={span} />
          </div>
        )
      })}

      {Array.from({ length: cols - 1 }, (_, i) => (
        <TrackHandle key={'c' + i} axis="col" style={{ gridColumn: (i + 1) * 2, gridRow: '1 / -1' }} onMouseDown={beginDrag('col', i)} />
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <TrackHandle key={'r' + i} axis="row" style={{ gridRow: (i + 1) * 2, gridColumn: '1 / -1' }} onMouseDown={beginDrag('row', i)} />
      ))}
    </div>
  )
}

/** Local mirror of the store's `fitFracs` for render-time safety. */
function fitLocal(fr: number[], n: number): number[] {
  if (fr.length === n) return fr
  return Array.from({ length: n }, (_, i) => (fr[i] > 0 ? fr[i] : 1))
}

function TrackHandle({ axis, style, onMouseDown }: { axis: 'col' | 'row'; style: CSSProperties; onMouseDown: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false)
  const vertical = axis === 'col'
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...style,
        zIndex: 1,
        cursor: vertical ? 'col-resize' : 'row-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{
        background: hover ? 'var(--accent)' : 'transparent',
        borderRadius: 1,
        transition: 'background .1s',
        ...(vertical ? { width: 2, height: '100%' } : { height: 2, width: '100%' }),
      }} />
    </div>
  )
}
