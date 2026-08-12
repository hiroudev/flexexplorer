import { useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'

type PathEntry = { path: string; label: string }
type Group = { title: string; items: PathEntry[] }

const lastSeg = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]+/).filter(Boolean).pop() || p

export default function GoToOverlay() {
  const goto = useStore(s => s.goto)
  const closeGoto = useStore(s => s.closeGoto)
  const gotoInput = useStore(s => s.gotoInput)
  const gotoSel = useStore(s => s.gotoSel)
  const navTo = useStore(s => s.navTo)
  const recentPaths = useStore(s => s.recentPaths)
  const bookmarks = useStore(s => s.bookmarks)
  const drives = useStore(s => s.drives)
  const home = useStore(s => s.home)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (goto.open) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [goto.open])

  if (!goto.open) return null

  const q = goto.q.trim().toLowerCase()

  // Build path groups from real state.
  const RECENT_PATHS: PathEntry[] = recentPaths.map(p => ({ path: p, label: lastSeg(p) }))
  const BOOKMARKS: PathEntry[] = bookmarks.map(b => ({ path: b.path, label: b.label }))
  const sys: PathEntry[] = []
  if (home) {
    const sep = home.includes('/') ? '/' : '\\'
    for (const [sub, label] of [['Desktop', 'デスクトップ'], ['Downloads', 'ダウンロード'], ['Documents', 'ドキュメント'], ['Pictures', 'ピクチャ']]) {
      sys.push({ path: home + sep + sub, label })
    }
  }
  drives.forEach(d => sys.push({ path: d.path, label: (d.name ? d.name + ' ' : '') + `(${d.letter})` }))
  const SYSTEM_PATHS = sys

  let groups: Group[] = []
  if (!q) {
    groups = [
      { title: '最近開いた場所', items: RECENT_PATHS },
      { title: 'ブックマーク', items: BOOKMARKS },
      { title: 'システムパス', items: SYSTEM_PATHS },
    ].filter(g => g.items.length > 0)
  } else {
    const all = [...RECENT_PATHS, ...BOOKMARKS, ...SYSTEM_PATHS]
    const seen = new Set<string>()
    const matches = all.filter(p => {
      if (seen.has(p.path)) return false
      seen.add(p.path)
      return p.path.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)
    })
    if (matches.length > 0) groups = [{ title: '候補', items: matches }]
  }

  const flat: PathEntry[] = groups.flatMap(g => g.items)
  const sel = Math.min(goto.sel, Math.max(0, flat.length - 1))

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { closeGoto(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); gotoSel(Math.min(sel + 1, flat.length - 1)); scrollTo(sel + 1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); gotoSel(Math.max(sel - 1, 0)); scrollTo(sel - 1) }
    if (e.key === 'Tab') {
      e.preventDefault()
      const cur = flat[sel]
      if (cur) gotoInput(cur.path)
    }
    if (e.key === 'Enter') {
      const path = goto.q.trim() || (flat[sel]?.path || '')
      if (path) navTo(path, e.shiftKey)
    }
  }

  const scrollTo = (next: number) => {
    const el = listRef.current?.querySelector(`[data-idx="${next}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }

  let flatIdx = 0

  return (
    <>
      <div onMouseDown={closeGoto} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.22)' }} />
      <div style={{
        position: 'fixed', left: '50%', top: 100, transform: 'translateX(-50%)',
        zIndex: 56, width: 520,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 10, boxShadow: '0 18px 55px var(--shadow)',
        fontFamily: 'var(--font)', overflow: 'hidden',
      }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: flat.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <span style={{ color: 'var(--text-faint)', fontSize: 12, fontFamily: 'var(--mono)' }}>⌖</span>
          <input
            ref={inputRef}
            value={goto.q}
            onChange={e => gotoInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="パスまたはフォルダ名を入力…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}
          />
          {goto.q && (
            <span
              onClick={() => gotoInput('')}
              style={{ fontSize: 10, color: 'var(--text-faint)', cursor: 'default', padding: '2px 5px', borderRadius: 3 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >✕</span>
          )}
        </div>

        {/* Suggestions */}
        {groups.length > 0 && (
          <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto' }}>
            {groups.map(grp => (
              <div key={grp.title}>
                <div style={{ padding: '6px 12px 3px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>{grp.title}</div>
                {grp.items.map(item => {
                  const idx = flatIdx++
                  const isSel = idx === sel
                  return (
                    <div
                      key={item.path}
                      data-idx={idx}
                      onClick={() => navTo(item.path)}
                      onMouseEnter={() => gotoSel(idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 12px', cursor: 'default', background: isSel ? 'var(--bg-active)' : 'transparent', borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent' }}
                    >
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>📁</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: isSel ? 550 : 400 }}>{item.label}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)', marginLeft: 8 }}>{item.path}</span>
                      </span>
                      {isSel && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--mono)', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Tab で補完</span>}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 14, padding: '7px 12px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-faint)' }}>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Enter</kbd> 移動</span>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Shift+Enter</kbd> 別パネルへ</span>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Tab</kbd> パスを補完</span>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Esc</kbd> 閉じる</span>
        </div>
      </div>
    </>
  )
}

import React from 'react'
