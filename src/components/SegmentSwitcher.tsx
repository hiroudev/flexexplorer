//! The breadcrumb's ▾ switcher: swap one folder in the middle of the path and
//! keep everything below it.
//!
//! `…/10:2026/10:基本設計/hoge` → pick `20:2027` → `…/20:2027/10:基本設計/hoge`.
//! Useful when the same folder structure is repeated per year, per project or
//! per customer, where the alternative is walking up three levels and back
//! down three more.
//!
//! Siblings that don't contain the whole tail are still selectable — the
//! missing folders are often exactly what you're about to create — but they
//! say so, and picking one lands on the deepest folder that does exist.

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { siblingFolders, type Sibling } from '../fs/bridge'

/** Above this many siblings the list gets a filter box. */
const FILTER_THRESHOLD = 30

export default function SegmentSwitcher({ pi, path, ci, anchor, onClose }: {
  pi: number
  path: string[]
  /** Index of the segment being swapped. */
  ci: number
  /** Viewport position of the ▼ that opened this, in px. The breadcrumb bar
   * scrolls horizontally, which would clip an absolutely positioned child, so
   * the panel is placed against the viewport instead. */
  anchor: { x: number; y: number }
  onClose: () => void
}) {
  const swapPathSegment = useStore(s => s.swapPathSegment)
  const showHidden = useStore(s => s.adv.hidden)
  const [items, setItems] = useState<Sibling[] | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const tail = path.slice(ci + 1)

  useEffect(() => {
    let cancelled = false
    siblingFolders(path.slice(0, ci), tail)
      .then(list => { if (!cancelled) setItems(list) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pi, ci, path.join(' ')])

  // Click anywhere else closes it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [onClose])

  const all = items ?? []
  const visible = all.filter(s => {
    if (!showHidden && s.name.startsWith('.')) return false
    return !q || s.name.toLowerCase().includes(q.toLowerCase())
  })

  useEffect(() => { setSel(0) }, [q])
  // ↑↓/Enter only reach onKeyDown if something inside actually has focus: the
  // filter box when there is one, the panel itself otherwise.
  useEffect(() => {
    if (items === null) return
    if (all.length > FILTER_THRESHOLD) filterRef.current?.focus()
    else boxRef.current?.focus()
  }, [items, all.length])

  const choose = (name: string) => {
    onClose()
    void swapPathSegment(pi, ci, name)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Every key handled here must also stop propagating: React dispatches from
    // the document root, so anything left to bubble reaches App.tsx's global
    // handler as well — Enter would open whatever is selected in the list
    // behind this panel, and ↑↓ would move that selection.
    if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
    }
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { setSel(s => Math.min(visible.length - 1, s + 1)); return }
    if (e.key === 'ArrowUp') { setSel(s => Math.max(0, s - 1)); return }
    if (e.key === 'Enter') {
      const pick = visible[sel]
      if (pick) choose(pick.name)
    }
  }

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
      style={{ position: 'fixed', top: Math.min(anchor.y, window.innerHeight - 380), left: Math.min(anchor.x, window.innerWidth - 316), zIndex: 44, width: 300, maxHeight: 360, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)', overflow: 'hidden', outline: 'none', fontFamily: 'var(--font)' }}
    >
      <div style={{ padding: '8px 11px 6px', fontSize: 10.5, color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
        {tail.length > 0
          ? <>この階層を切り替え（<span style={{ color: 'var(--text-muted)' }}>{tail.join(' / ')}</span> は維持）</>
          : 'この階層を切り替え'}
      </div>

      {all.length > FILTER_THRESHOLD && (
        <input
          ref={filterRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="絞り込み…"
          style={{ margin: '7px 8px 4px', height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-page)', color: 'var(--text)', fontSize: 12, outline: 'none' }}
        />
      )}

      <div style={{ overflowY: 'auto', padding: 5 }}>
        {items === null && (
          <div style={{ padding: '10px 8px', fontSize: 11.5, color: 'var(--text-faint)' }}>読み込み中…</div>
        )}
        {items !== null && visible.length === 0 && (
          <div style={{ padding: '10px 8px', fontSize: 11.5, color: 'var(--text-faint)' }}>
            切り替えられるフォルダがありません
          </div>
        )}
        {visible.map((s, i) => (
          <Row
            key={s.name}
            sib={s}
            tailLen={tail.length}
            current={s.name === path[ci]}
            active={i === sel}
            onHover={() => setSel(i)}
            onPick={() => choose(s.name)}
          />
        ))}
      </div>
    </div>
  )
}

function Row({ sib, tailLen, current, active, onHover, onPick }: {
  sib: Sibling; tailLen: number; current: boolean; active: boolean
  onHover: () => void; onPick: () => void
}) {
  // ● the whole structure is there, ○ only part of it, · nothing below.
  const mark = tailLen === 0 ? '' : sib.hasTail ? '●' : sib.depth > 0 ? '◐' : '○'
  const markColor = sib.hasTail ? 'var(--accent)' : sib.depth > 0 ? 'var(--warn)' : 'var(--text-faint)'
  const note = tailLen === 0 || sib.hasTail
    ? ''
    : sib.depth > 0 ? `途中まで（${sib.depth}/${tailLen}）` : '同じ構造なし'

  return (
    <div
      onMouseEnter={onHover}
      onClick={onPick}
      title={note ? `${sib.name} — ${note}` : sib.name}
      style={{ display: 'flex', alignItems: 'center', gap: 8, height: 27, padding: '0 9px', borderRadius: 6, cursor: 'default', fontSize: 12, background: active ? 'var(--bg-hover)' : 'transparent', color: 'var(--text)' }}
    >
      {mark && <span style={{ flex: '0 0 auto', fontSize: 9, color: markColor }}>{mark}</span>}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: current ? 700 : 400 }}>
        {sib.name}
      </span>
      {current && <span style={{ flex: '0 0 auto', fontSize: 9.5, color: 'var(--text-faint)' }}>現在</span>}
      {note && <span style={{ flex: '0 0 auto', fontSize: 9.5, color: markColor }}>{note}</span>}
    </div>
  )
}
