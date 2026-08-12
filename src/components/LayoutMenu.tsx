import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

type LayoutId = 'single' | 'dualH' | 'dualV' | 'triple' | 'quad'
type Preset = { id: LayoutId; label: string; count: number; cols: number; rows: number }

const PRESETS: Preset[] = [
  { id: 'single', label: '単一', count: 1, cols: 1, rows: 1 },
  { id: 'dualH', label: '左右に2分割', count: 2, cols: 2, rows: 1 },
  { id: 'dualV', label: '上下に2分割', count: 2, cols: 1, rows: 2 },
  { id: 'triple', label: '3分割', count: 3, cols: 3, rows: 1 },
  { id: 'quad', label: '4分割 (2×2)', count: 4, cols: 2, rows: 2 },
]

/** Mini grid icon illustrating a pane layout. */
function LayoutIcon({ cols, rows, count, active }: { cols: number; rows: number; count: number; active?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)`, gap: 2, width: 22, height: 16, flex: '0 0 22px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ borderRadius: 2, background: active ? 'var(--accent)' : 'var(--text-muted)', opacity: active ? 1 : 0.7 }} />
      ))}
    </div>
  )
}

export default function LayoutMenu() {
  const panesLen = useStore(s => s.panes.length)
  const gridCols = useStore(s => s.gridCols)
  const setGridLayout = useStore(s => s.setGridLayout)
  const addPaneRight = useStore(s => s.addPaneRight)
  const addPaneDown = useStore(s => s.addPaneDown)
  const closePane = useStore(s => s.closePane)
  const activePane = useStore(s => s.activePane)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const cur = PRESETS.find(p => p.count === panesLen && p.cols === gridCols)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        title="ペインのレイアウト"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 9px', borderRadius: 7, cursor: 'default', color: hover || open ? 'var(--text)' : 'var(--text-muted)', background: open ? 'var(--bg-active)' : hover ? 'var(--bg-hover)' : 'transparent', border: '1px solid var(--border-strong)' }}
      >
        <LayoutIcon cols={gridCols} rows={Math.ceil(panesLen / gridCols)} count={panesLen} active />
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>▾</span>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 36, right: 0, zIndex: 60, width: 250, padding: 6, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 40px var(--shadow)' }}>
          {/* Absolute layouts */}
          <div style={{ padding: '5px 9px 3px', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>このレイアウトにする</div>
          {PRESETS.map(p => {
            const active = cur?.id === p.id
            return (
              <Row key={p.id} active={active} onClick={() => { setGridLayout(p.id); setOpen(false) }}
                left={<span style={{ fontSize: 12.5, color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 600 : 400 }}>{p.label}</span>}
                right={<LayoutIcon cols={p.cols} rows={p.rows} count={p.count} active={active} />}
              />
            )
          })}

          <div style={{ height: 1, background: 'var(--border)', margin: '5px 6px' }} />

          {/* Relative changes */}
          <div style={{ padding: '5px 9px 3px', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>現在の配置を変更</div>
          <Row onClick={() => { addPaneRight(); setOpen(false) }}
            left={<span style={{ fontSize: 12.5, color: 'var(--text)' }}>右にペインを追加</span>}
            right={<DirIcon dir="right" />}
            shortcut="Ctrl+Alt+→"
          />
          <Row onClick={() => { addPaneDown(); setOpen(false) }}
            left={<span style={{ fontSize: 12.5, color: 'var(--text)' }}>下にペインを追加</span>}
            right={<DirIcon dir="down" />}
            shortcut="Ctrl+Alt+↓"
          />
          <Row disabled={panesLen <= 1} onClick={() => { if (panesLen > 1) { closePane(activePane); setOpen(false) } }}
            left={<span style={{ fontSize: 12.5, color: panesLen <= 1 ? 'var(--text-faint)' : 'var(--danger)' }}>アクティブなペインを閉じる</span>}
            right={<span style={{ fontSize: 13, color: panesLen <= 1 ? 'var(--text-faint)' : 'var(--danger)' }}>✕</span>}
            shortcut="Ctrl+Alt+X"
          />
        </div>
      )}
    </div>
  )
}

function DirIcon({ dir }: { dir: 'right' | 'down' }) {
  // Current grid (muted) plus a highlighted new cell on the right/bottom.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: dir === 'right' ? '1fr 1fr' : '1fr', gridTemplateRows: dir === 'down' ? '1fr 1fr' : '1fr', gap: 2, width: 22, height: 16, flex: '0 0 22px' }}>
      <div style={{ borderRadius: 2, background: 'var(--text-muted)', opacity: 0.5 }} />
      <div style={{ borderRadius: 2, background: 'var(--accent)' }} />
    </div>
  )
}

function Row({ left, right, shortcut, active, disabled, onClick }: { left: React.ReactNode; right: React.ReactNode; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, padding: '4px 9px', borderRadius: 6, cursor: 'default', background: active ? 'var(--accent-soft)' : (hover && !disabled ? 'var(--bg-hover)' : 'transparent'), opacity: disabled ? 0.6 : 1 }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{left}</span>
      {shortcut && <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-faint)' }}>{shortcut}</span>}
      {right}
    </div>
  )
}
