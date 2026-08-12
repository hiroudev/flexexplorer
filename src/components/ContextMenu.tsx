import { useState } from 'react'
import { useStore } from '../store/useStore'

const PIN_DEFS: Record<string, { label: string; dot: string }> = {
  vscode: { label: 'VS Code で開く', dot: '#2E6FD8' },
  copypath: { label: 'パスをコピー', dot: '#2F8F5B' },
  terminal: { label: 'ターミナルで開く', dot: '#6A5BD0' },
}

const SUB_ITEMS = [
  { icon: '<>', iconColor: '#2E6FD8', label: 'VS Code で開く' },
  { icon: '▶', iconColor: '#6A5BD0', label: 'ターミナルで開く' },
  { icon: '🗜', iconColor: '#B7791F', label: '圧縮 (ZIP)' },
  { icon: '⤴', iconColor: 'var(--text-muted)', label: '共有…' },
]

export default function ContextMenu() {
  const ctx = useStore(s => s.ctx)
  const closeCtx = useStore(s => s.closeCtx)
  const ctxSearch = useStore(s => s.ctxSearch)
  const pins = useStore(s => s.pins)
  const panes = useStore(s => s.panes)
  const openModal = useStore(s => s.openModal)
  const openFile = useStore(s => s.openFile)
  const openFolderTab = useStore(s => s.openFolderTab)
  const setInspector = useStore(s => s.toggleInspector)
  const showToast = useStore(s => s.showToast)
  const copyToClip = useStore(s => s.copyToClip)
  const cutToClip = useStore(s => s.cutToClip)
  const paste = useStore(s => s.paste)
  const deleteSelected = useStore(s => s.deleteSelected)
  const copyPathToClipboard = useStore(s => s.copyPathToClipboard)
  const addBookmark = useStore(s => s.addBookmark)
  const clip = useStore(s => s.clip)
  const shellProperties = useStore(s => s.shellProperties)
  const openWith = useStore(s => s.openWith)
  const revealInExplorer = useStore(s => s.revealInExplorer)
  const openInTerminal = useStore(s => s.openInTerminal)
  const openInVscode = useStore(s => s.openInVscode)
  const createShortcutForSel = useStore(s => s.createShortcutForSel)

  if (!ctx) return null

  const { x, y, pi, idx, q, sub } = ctx
  const tab = panes[pi].tabs[panes[pi].active]
  const f = tab.files[idx]
  const selCount = tab.sel.length
  const multi = selCount > 1
  const W = 232
  const px = Math.min(x, window.innerWidth - W - 8)
  const py = Math.max(8, Math.min(y, window.innerHeight - 600))
  const ql = (q || '').trim().toLowerCase()

  const pinnedItems = pins.map(id => ({ id, ...PIN_DEFS[id] })).filter(p => p.label)

  const runPin = (id: string, label: string) => {
    closeCtx()
    if (id === 'copypath') void copyPathToClipboard()
    else if (id === 'vscode') openInVscode()
    else if (id === 'terminal') openInTerminal()
    else showToast(label)
  }

  type MenuItem = { divider: true } | { divider?: false; icon: string; iconColor: string; label: string; key: string; arrow?: boolean; danger?: boolean; onClick: () => void }

  const items: MenuItem[] = []
  if (multi) {
    items.push({ icon: '⇆', iconColor: 'var(--accent)', label: '一括リネーム…', key: 'Ctrl+Shift+R', onClick: () => { closeCtx(); openModal('rename') } })
    items.push({ divider: true })
  }
  items.push({ icon: '▸', iconColor: 'var(--text-muted)', label: '開く', key: 'Enter', onClick: () => { closeCtx(); openFile(pi, idx) } })
  if (f?.folder) items.push({ icon: '＋', iconColor: 'var(--text-muted)', label: '新しいタブで開く', key: 'Space', onClick: () => { closeCtx(); openFolderTab(pi, f.name) } })
  else {
    items.push({ icon: '＋', iconColor: 'var(--text-muted)', label: 'Inspector で表示', key: 'Space', onClick: () => { closeCtx(); setInspector() } })
    items.push({ icon: '▤', iconColor: 'var(--text-muted)', label: 'プログラムから開く…', key: '', onClick: () => { closeCtx(); openWith() } })
  }
  if (f?.folder) items.push({ icon: '▶', iconColor: 'var(--text-muted)', label: 'ターミナルで開く', key: '', onClick: () => { closeCtx(); openInTerminal() } })
  items.push({ divider: true })
  items.push({ icon: '✂', iconColor: 'var(--text-muted)', label: '切り取り', key: 'Ctrl+X', onClick: () => { closeCtx(); cutToClip() } })
  items.push({ icon: '⎘', iconColor: 'var(--text-muted)', label: 'コピー', key: 'Ctrl+C', onClick: () => { closeCtx(); copyToClip() } })
  items.push({ icon: '⎙', iconColor: clip ? 'var(--accent)' : 'var(--text-faint)', label: clip ? `貼り付け (${clip.paths.length})` : '貼り付け', key: 'Ctrl+V', onClick: () => { closeCtx(); if (clip) void paste() } })
  items.push({ icon: '⧉', iconColor: 'var(--text-muted)', label: 'パスをコピー', key: 'Ctrl+Shift+C', onClick: () => { closeCtx(); void copyPathToClipboard() } })
  items.push({ divider: true })
  items.push({ icon: '🔗', iconColor: 'var(--text-muted)', label: 'ショートカットの作成', key: '', onClick: () => { closeCtx(); void createShortcutForSel() } })
  items.push({ icon: '✎', iconColor: 'var(--text-muted)', label: '名前の変更', key: 'F2', onClick: () => { closeCtx(); openModal('rename') } })
  items.push({ icon: '🗑', iconColor: 'var(--danger)', label: '削除', key: 'Del', danger: true, onClick: () => { closeCtx(); void deleteSelected() } })
  items.push({ divider: true })
  items.push({ icon: '◳', iconColor: 'var(--text-muted)', label: 'エクスプローラーで表示', key: '', onClick: () => { closeCtx(); revealInExplorer() } })
  items.push({ icon: '★', iconColor: '#B7791F', label: 'ブックマークに追加', key: '', onClick: () => { closeCtx(); addBookmark() } })
  items.push({ icon: '⋯', iconColor: 'var(--text-muted)', label: 'その他のアクション', key: '', arrow: true, onClick: () => useStore.setState(s => s.ctx ? { ctx: { ...s.ctx!, sub: !s.ctx!.sub } } : {}) })
  items.push({ divider: true })
  items.push({ icon: 'ℹ', iconColor: 'var(--text-muted)', label: 'プロパティ', key: 'Alt+Enter', onClick: () => { closeCtx(); shellProperties() } })

  const filtered = ql ? items.filter(it => 'divider' in it && it.divider ? false : !('label' in it) ? false : (it as { label: string }).label.toLowerCase().includes(ql)) : items
  const empty = ql && filtered.filter(it => !('divider' in it) || !it.divider).length === 0

  return (
    <>
      <div onMouseDown={closeCtx} onContextMenu={e => { e.preventDefault(); closeCtx() }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{ position: 'fixed', left: px, top: py, zIndex: 41, width: W, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 44px var(--shadow)', fontFamily: 'var(--font)' }}>
        {multi && <div style={{ padding: '7px 12px 6px', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{selCount} 件のファイルを選択中</div>}

        {/* search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, margin: '2px 5px 5px', padding: '0 9px', background: 'var(--bg-page)', border: '1px solid var(--border-strong)', borderRadius: 6 }}>
          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>⌕</span>
          <input
            value={q}
            onChange={e => ctxSearch(e.target.value)}
            placeholder="アクションを検索…"
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text)' }}
          />
        </div>

        {/* pinned */}
        {!ql && pinnedItems.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 7px 6px', flexWrap: 'wrap' }}>
              {pinnedItems.map(p => (
                <CtxPinnedBtn key={p.id} label={p.label} dot={p.dot} onClick={() => runPin(p.id, p.label)} />
              ))}
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '0 6px 4px' }} />
          </>
        )}

        {/* items */}
        <div style={{ maxHeight: 'min(560px, calc(100vh - 90px))', overflowY: 'auto' }}>
          {filtered.map((it, i) => {
            if ('divider' in it && it.divider) return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
            const item = it as { icon: string; iconColor: string; label: string; key: string; arrow?: boolean; danger?: boolean; onClick: () => void }
            return (
              <CtxItem
                key={item.label}
                icon={item.icon}
                iconColor={item.iconColor}
                label={item.label}
                shortcut={item.key}
                arrow={item.arrow}
                danger={item.danger}
                active={item.arrow && sub}
                onClick={item.onClick}
                onEnter={() => { if (!item.arrow && sub) useStore.setState(s => s.ctx ? { ctx: { ...s.ctx!, sub: false } } : {}) }}
              />
            )
          })}
          {empty && <div style={{ padding: 14, textAlign: 'center', fontSize: 11.5, color: 'var(--text-faint)' }}>一致なし</div>}
        </div>

        {/* submenu */}
        {sub && !ql && (
          <div style={{ position: 'absolute', left: W - 6, top: 150, width: 200, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)' }}>
            {SUB_ITEMS.map(it => (
              <CtxItem key={it.label} icon={it.icon} iconColor={it.iconColor} label={it.label} shortcut="" onClick={() => {
                closeCtx()
                if (it.label === 'VS Code で開く') openInVscode()
                else if (it.label === 'ターミナルで開く') openInTerminal()
                else showToast(it.label)
              }} onEnter={() => {}} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function CtxPinnedBtn({ label, dot, onClick }: { label: string; dot: string; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 9px', borderRadius: 6, cursor: 'default', fontSize: 11.5, color: hover ? 'var(--accent-contrast)' : 'var(--text)', background: hover ? 'var(--accent)' : 'var(--accent-soft)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />{label}
    </div>
  )
}

function CtxItem({ icon, iconColor, label, shortcut, arrow, danger, active, onClick, onEnter }: { icon: string; iconColor: string; label: string; shortcut: string; arrow?: boolean; danger?: boolean; active?: boolean; onClick: () => void; onEnter: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => { setHover(true); onEnter() }}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 11, height: 29, padding: '0 11px', borderRadius: 6, fontSize: 12.5, cursor: 'default', color: danger ? 'var(--danger)' : 'var(--text)', background: hover || active ? 'var(--bg-hover)' : 'transparent' }}
    >
      <span style={{ width: 15, flex: '0 0 15px', textAlign: 'center', color: iconColor, fontSize: 12 }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-faint)' }}>{shortcut}</span>
      {arrow && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>›</span>}
    </div>
  )
}
