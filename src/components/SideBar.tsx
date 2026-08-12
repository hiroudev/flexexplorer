import React, { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { isTauri, shellIconForPath, peekIconPath } from '../fs/bridge'

// Quick-access entries map Japanese labels to home-relative folder names.
const QUICK_ACCESS: { label: string; sub: string }[] = [
  { label: 'デスクトップ', sub: 'Desktop' },
  { label: 'ダウンロード', sub: 'Downloads' },
  { label: 'ドキュメント', sub: 'Documents' },
  { label: 'ピクチャ', sub: 'Pictures' },
]

function fmtCapacity(b: number): string {
  const gb = b / 1073741824
  if (gb >= 1024) return (gb / 1024).toFixed(1) + ' TB'
  if (gb >= 10) return Math.round(gb) + ' GB'
  return gb.toFixed(1) + ' GB'
}

/** Native shell icon for a real path (drive / special folder), cached by path. */
function usePathIcon(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? peekIconPath(path) : null))
  useEffect(() => {
    if (!path) { setUrl(null); return }
    const cached = peekIconPath(path)
    if (cached) { setUrl(cached); return }
    let cancelled = false
    shellIconForPath(path).then(u => { if (!cancelled && u) setUrl(u) })
    return () => { cancelled = true }
  }, [path])
  return url
}

function IconBox({ path, fallbackBg, fallbackBorder }: { path: string | null; fallbackBg: string; fallbackBorder: string }) {
  const url = usePathIcon(path)
  if (url) return <img src={url} alt="" draggable={false} style={{ width: 16, height: 16, flex: '0 0 16px', objectFit: 'contain' }} />
  return <span style={{ width: 15, height: 13, flex: '0 0 15px', borderRadius: 3, background: fallbackBg, border: `1px solid ${fallbackBorder}` }} />
}

function SidebarItem({ label, meta, path, fallbackBg, fallbackBorder, onClick, onRemove }: {
  label: string; meta?: string; path: string | null; fallbackBg: string; fallbackBorder: string; onClick: () => void; onRemove?: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      title={path || label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 9, height: 27, padding: '0 10px 0 16px', fontSize: 12.5, color: 'var(--text)', cursor: 'default', background: hover ? 'var(--bg-hover)' : 'transparent' }}
    >
      <IconBox path={path} fallbackBg={fallbackBg} fallbackBorder={fallbackBorder} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {meta && !hover && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>{meta}</span>}
      {onRemove && hover && (
        <span
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="ブックマークを削除"
          style={{ width: 16, height: 16, flex: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 11, color: 'var(--text-faint)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
        >✕</span>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: '10px 14px 5px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  )
}

export default function SideBar() {
  const sidebarW = useStore(s => s.sidebarW)
  const sidebarHidden = useStore(s => s.sidebarHidden)
  const drives = useStore(s => s.drives)
  const bookmarks = useStore(s => s.bookmarks)
  const home = useStore(s => s.home)
  const navPath = useStore(s => s.navPath)
  const navSidebar = useStore(s => s.navSidebar)
  const removeBookmark = useStore(s => s.removeBookmark)
  const startSidebarDrag = useStore(s => s.startSidebarDrag)

  const sep = home.includes('/') ? '/' : '\\'

  return (
    <div style={{ width: sidebarHidden ? 0 : sidebarW, flex: `0 0 ${sidebarHidden ? 0 : sidebarW}px`, position: 'relative', display: 'flex', flexDirection: 'column', background: 'var(--bg-sunken)', borderRight: sidebarHidden ? 'none' : '1px solid var(--border)', overflow: 'hidden', transition: 'flex-basis .18s, width .18s' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0', width: Math.max(180, sidebarW - 1) }}>
        {/* Quick access */}
        <Section title="クイックアクセス">
          {QUICK_ACCESS.map(it => (
            <SidebarItem
              key={it.label}
              label={it.label}
              path={home ? home + sep + it.sub : null}
              fallbackBg="var(--accent-soft)"
              fallbackBorder="var(--accent)"
              onClick={() => navSidebar(it.label)}
            />
          ))}
        </Section>

        {/* Bookmarks */}
        <Section title="ブックマーク">
          {bookmarks.length === 0 ? (
            <div style={{ padding: '4px 16px 6px', fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
              右クリック →「ブックマークに追加」で登録
            </div>
          ) : (
            bookmarks.map(b => (
              <SidebarItem
                key={b.path}
                label={b.label}
                path={b.path}
                fallbackBg="#B7791F22"
                fallbackBorder="#B7791F"
                onClick={() => navPath(b.path)}
                onRemove={() => removeBookmark(b.path)}
              />
            ))
          )}
        </Section>

        {/* Drives */}
        <Section title="ドライブ">
          {drives.length === 0 && !isTauri && (
            <div style={{ padding: '4px 16px 6px', fontSize: 11, color: 'var(--text-faint)' }}>（デスクトップアプリで表示）</div>
          )}
          {drives.map(d => {
            const used = d.total > 0 ? Math.min(100, Math.round((d.total - d.free) / d.total * 100)) : 0
            const label = (d.name ? d.name + ' ' : 'ローカル ディスク ') + `(${d.letter})`
            return (
              <DriveItem
                key={d.path}
                label={label}
                path={d.path}
                meta={d.total > 0 ? `${fmtCapacity(d.free)} 空き` : ''}
                used={used}
                onClick={() => navPath(d.path)}
              />
            )
          })}
        </Section>
      </div>
      {/* resize handle */}
      <DragHandle onMouseDown={e => { e.preventDefault(); startSidebarDrag(e.clientX) }} />
    </div>
  )
}

function DriveItem({ label, path, meta, used, onClick }: { label: string; path: string; meta: string; used: number; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      title={path}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '5px 14px 6px 16px', cursor: 'default', background: hover ? 'var(--bg-hover)' : 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <IconBox path={path} fallbackBg="var(--bg-active)" fallbackBorder="var(--border-strong)" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {meta && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>{meta}</span>}
      </div>
      {used > 0 && (
        <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', marginLeft: 25, overflow: 'hidden' }}>
          <div style={{ width: used + '%', height: '100%', borderRadius: 2, background: used > 90 ? 'var(--danger)' : 'var(--accent)' }} />
        </div>
      )}
    </div>
  )
}

function DragHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'absolute', top: 0, right: -2, width: 6, height: '100%', cursor: 'col-resize', zIndex: 5, background: hover ? 'linear-gradient(90deg,transparent,var(--accent),transparent)' : 'transparent' }}
    />
  )
}
