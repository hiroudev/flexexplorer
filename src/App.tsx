import { useEffect, useRef, type CSSProperties } from 'react'
import { useStore } from './store/useStore'
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
import CommandPalette from './components/overlays/CommandPalette'
import GoToOverlay from './components/overlays/GoToOverlay'

export default function App() {
  const panes = useStore(s => s.panes)
  const gridCols = useStore(s => s.gridCols)
  const dragMove = useStore(s => s.dragMove)
  const dragEnd = useStore(s => s.dragEnd)
  const setContainerW = useStore(s => s.setContainerW)
  const openModal = useStore(s => s.openModal)
  const openPalette = useStore(s => s.openPalette)
  const openGoto = useStore(s => s.openGoto)
  const toggleInspector = useStore(s => s.toggleInspector)
  const toggleSidebar = useStore(s => s.toggleSidebar)
  const toggleTheme = useStore(s => s.toggleTheme)
  const moveSel = useStore(s => s.moveSel)
  const closeCtx = useStore(s => s.closeCtx)
  const modal = useStore(s => s.modal)
  const paletteOpen = useStore(s => s.palette.open)
  const gotoOpen = useStore(s => s.goto.open)
  const accent = useStore(s => s.opt.accent)

  const panesRef = useRef<HTMLDivElement>(null)

  // Under Tauri, replace the mock panes with real directory listings.
  useEffect(() => { void useStore.getState().initTauri() }, [])

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

  // Global keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // Always-active shortcuts
      if (e.key === 'Escape') {
        closeCtx()
        useStore.getState().closePalette()
        useStore.getState().closeGoto()
        useStore.getState().closeModal()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault(); openPalette(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault(); openModal('options'); return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault(); openGoto(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault(); openModal('workspaces'); return
      }

      // Skip navigation shortcuts when in modals/palette/goto
      if (modal || paletteOpen || gotoOpen || inInput) return

      if (e.key === ' ') { e.preventDefault(); toggleInspector(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleSidebar(); return }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') { e.preventDefault(); toggleTheme(); return }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') { e.preventDefault(); openModal('rename'); return }

      // Switch the active pane (dual-pane file-manager convention: Tab / Shift+Tab).
      if (e.key === 'Tab') { e.preventDefault(); useStore.getState().cyclePane(e.shiftKey ? -1 : 1); return }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'X' || e.key === 'x')) { e.preventDefault(); useStore.getState().swapPanes(); return }
      // Pane grid (Ctrl+Alt+…)
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'ArrowRight') { e.preventDefault(); useStore.getState().addPaneRight(); return }
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'ArrowDown') { e.preventDefault(); useStore.getState().addPaneDown(); return }
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); useStore.getState().closePane(useStore.getState().activePane); return }

      if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); useStore.getState().navParent(useStore.getState().activePane); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); useStore.getState().startAddressEdit(useStore.getState().activePane); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); return }

      const st = useStore.getState()
      const ap = st.activePane
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); void st.copyPathToClipboard(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c')) { e.preventDefault(); st.copyToClip(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'x')) { e.preventDefault(); st.cutToClip(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v')) { e.preventDefault(); void st.paste(); return }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'T' || e.key === 't')) { e.preventDefault(); st.reopenClosedTab(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 't')) { e.preventDefault(); st.newTab(ap); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'w')) { e.preventDefault(); st.closeTab(ap, st.panes[ap].active); return }
      if (e.key === 'Delete') { e.preventDefault(); void st.deleteSelected(); return }
      if (e.key === 'F2') { e.preventDefault(); st.openModal('rename'); return }
      if (e.altKey && e.key === 'Enter') { e.preventDefault(); st.shellProperties(); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        const tab = st.panes[ap].tabs[st.panes[ap].active]
        st.openFile(ap, tab.focus)
        return
      }
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
  }, [modal, paletteOpen, gotoOpen, closeCtx, openPalette, openModal, openGoto, toggleInspector, toggleSidebar, toggleTheme, moveSel])

  // Mouse drag events
  useEffect(() => {
    const onMove = (e: MouseEvent) => dragMove(e.clientX)
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
          {/* File panes (dynamic grid) */}
          <div
            ref={panesRef}
            data-panes
            style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(0, 1fr)', gap: 8, padding: 8, minWidth: 0, minHeight: 0, overflow: 'hidden' }}
          >
            {panes.map((pane, pi) => {
              const rem = panes.length % gridCols
              const span = (pi === panes.length - 1 && rem !== 0) ? gridCols - rem + 1 : 1
              return <FilePane key={pi} pane={pane} pi={pi} spanCols={span} />
            })}
          </div>

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
      <CommandPalette />
      <GoToOverlay />
    </div>
  )
}
