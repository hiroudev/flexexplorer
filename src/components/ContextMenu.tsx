import { useState } from 'react'
import { useStore } from '../store/useStore'
import { noteKey, joinPath } from '../fs/bridge'

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

// TortoiseSVN's own shell submenu, reproduced with the commands used most —
// each just shells out to TortoiseProc.exe /command:<cmd> (see external.rs).
const SVN_ITEMS: { icon: string; iconColor: string; label: string; cmd: string }[] = [
  { icon: '⇄', iconColor: '#6A5BD0', label: '差分 (Diff)', cmd: 'diff' },
  { icon: '↑', iconColor: '#2F8F5B', label: 'コミット…', cmd: 'commit' },
  { icon: '↓', iconColor: '#2E6FD8', label: '更新', cmd: 'update' },
  { icon: '☰', iconColor: 'var(--text-muted)', label: 'ログを表示', cmd: 'log' },
  { icon: '↺', iconColor: 'var(--danger)', label: '元に戻す (Revert)', cmd: 'revert' },
  { icon: '＋', iconColor: 'var(--text-muted)', label: '追加', cmd: 'add' },
  { icon: '🗀', iconColor: 'var(--text-muted)', label: 'リポジトリブラウザ', cmd: 'repobrowser' },
]

// "新規" submenu, shown when right-clicking empty list space. Office items are
// built from Explorer's own registered blank templates (see the Rust
// `shellnew` module) rather than an empty file — a 0-byte .xlsx/.docx/.pptx
// isn't valid and the app would just refuse to open it.
const NEW_ITEMS: { icon: string; iconColor: string; label: string; kind: string }[] = [
  { icon: '📁', iconColor: 'var(--text-muted)', label: 'フォルダー', kind: 'folder' },
  { icon: '📄', iconColor: 'var(--text-muted)', label: 'テキスト ドキュメント', kind: 'txt' },
  { icon: '📊', iconColor: '#2F8F5B', label: 'Excel ワークシート', kind: 'xlsx' },
  { icon: '📝', iconColor: '#2E6FD8', label: 'Word 文書', kind: 'docx' },
  { icon: '📽', iconColor: '#C0473E', label: 'PowerPoint プレゼンテーション', kind: 'pptx' },
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
  const createPathShortcutTextForSel = useStore(s => s.createPathShortcutTextForSel)
  const createShortcutForFolder = useStore(s => s.createShortcutForFolder)
  const showOsContextMenuForSel = useStore(s => s.showOsContextMenuForSel)
  const createNewItem = useStore(s => s.createNewItem)
  const duplicateSelectedAsDatedCopy = useStore(s => s.duplicateSelectedAsDatedCopy)
  const startRename = useStore(s => s.startRename)
  const shellNew = useStore(s => s.shellNew)
  const addNote = useStore(s => s.addNote)
  const notes = useStore(s => s.notes)
  const extTools = useStore(s => s.extTools)
  const runTortoiseSvn = useStore(s => s.runTortoiseSvn)
  const runWinMerge = useStore(s => s.runWinMerge)

  if (!ctx) return null

  const { x, y, pi, idx, q, sub } = ctx
  const tab = panes[pi].tabs[panes[pi].active]
  const isBg = idx === -1
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

  type MenuItem = { divider: true } | { divider?: false; icon: string; iconColor: string; label: string; key: string; arrow?: boolean; subId?: string; danger?: boolean; onClick: () => void }

  const hasNote = !!notes[noteKey(tab.path)]
  const openSub = (id: string) => useStore.setState(s => s.ctx ? { ctx: { ...s.ctx!, sub: s.ctx!.sub === id ? null : id } } : {})
  // Absolute paths this menu operates on — the selection if there is one,
  // otherwise (background click) the folder itself.
  const targetAbs = () => (isBg ? [joinPath(tab.path)] : tab.sel.map(i => tab.files[i]).filter(Boolean).map(fl => fl.abs || joinPath([...tab.path, fl.name])))

  const items: MenuItem[] = []
  if (isBg) {
    // Empty list space: no target file, so only folder-level actions apply.
    // The "新規" list opens on hover (no extra click) — same directness as the
    // native menu, without going through "Windows のメニューを表示…".
    items.push({ icon: '✚', iconColor: 'var(--accent)', label: '新規', key: '', arrow: true, subId: 'new', onClick: () => openSub('new') })
    items.push({ divider: true })
    items.push({ icon: '⎙', iconColor: clip ? 'var(--accent)' : 'var(--text-faint)', label: clip ? `貼り付け (${clip.paths.length})` : '貼り付け', key: 'Ctrl+V', onClick: () => { closeCtx(); if (clip) void paste() } })
    items.push({ divider: true })
    items.push({ divider: true })
    // Same pair as the item menu, but aimed at the folder being shown — the
    // text variant records this folder's own path (see createShortcutForFolder).
    items.push({ icon: '📝', iconColor: 'var(--text-muted)', label: 'このフォルダのショートカットテキストを作成', key: '', onClick: () => { closeCtx(); void createShortcutForFolder(true) } })
    items.push({ icon: '🔗', iconColor: 'var(--text-muted)', label: 'このフォルダのショートカットを作成', key: '', onClick: () => { closeCtx(); void createShortcutForFolder(false) } })
    items.push({ divider: true })
    items.push({ icon: '📌', iconColor: 'var(--warn)', label: hasNote ? '付箋メモを表示' : 'このフォルダに付箋メモ', key: 'Ctrl+M', onClick: () => { closeCtx(); addNote() } })
    items.push({ icon: '★', iconColor: '#B7791F', label: 'ブックマークに追加', key: '', onClick: () => { closeCtx(); addBookmark() } })
    if (extTools.tortoiseSvn) {
      items.push({ icon: '🐢', iconColor: '#2F8F5B', label: 'TortoiseSVN', key: '', arrow: true, subId: 'svn', onClick: () => openSub('svn') })
    }
  } else {
    if (multi) {
      items.push({ icon: '⇆', iconColor: 'var(--accent)', label: '一括リネーム…', key: 'Ctrl+Shift+R', onClick: () => { closeCtx(); openModal('rename') } })
      items.push({ divider: true })
    }
    items.push({ icon: '▸', iconColor: 'var(--text-muted)', label: '開く', key: 'Enter', onClick: () => { closeCtx(); openFile(pi, idx) } })
    // Explorer's own "新規" verb, surfaced directly under 開く instead of only
    // through "Windows のメニューを表示…" (Office types open an unsaved copy).
    if (!multi && f && !f.folder) items.push({ icon: '✚', iconColor: 'var(--accent)', label: '新規', key: '', onClick: () => { closeCtx(); shellNew() } })
    if (f?.folder) items.push({ icon: '＋', iconColor: 'var(--text-muted)', label: '新しいタブで開く', key: 'Space', onClick: () => { closeCtx(); openFolderTab(pi, f.name) } })
    else {
      items.push({ icon: '＋', iconColor: 'var(--text-muted)', label: 'Inspector で表示', key: 'Space', onClick: () => { closeCtx(); setInspector() } })
      items.push({ icon: '▤', iconColor: 'var(--text-muted)', label: 'プログラムから開く…', key: '', onClick: () => { closeCtx(); openWith() } })
    }
    if (f?.folder) items.push({ icon: '▶', iconColor: 'var(--text-muted)', label: 'ターミナルで開く', key: '', onClick: () => { closeCtx(); openInTerminal() } })
    if (!multi && f?.folder) {
      const childHasNote = !!notes[noteKey([...tab.path, f.name])]
      items.push({ icon: '📌', iconColor: 'var(--warn)', label: childHasNote ? '付箋メモを編集' : 'このフォルダに付箋メモ', key: '', onClick: () => { closeCtx(); openFolderTab(pi, f.name); addNote([...tab.path, f.name]) } })
    }
    items.push({ divider: true })
    items.push({ icon: '✂', iconColor: 'var(--text-muted)', label: '切り取り', key: 'Ctrl+X', onClick: () => { closeCtx(); cutToClip() } })
    items.push({ icon: '⎘', iconColor: 'var(--text-muted)', label: 'コピー', key: 'Ctrl+C', onClick: () => { closeCtx(); copyToClip() } })
    items.push({ icon: '⎙', iconColor: clip ? 'var(--accent)' : 'var(--text-faint)', label: clip ? `貼り付け (${clip.paths.length})` : '貼り付け', key: 'Ctrl+V', onClick: () => { closeCtx(); if (clip) void paste() } })
    items.push({ icon: '⧉', iconColor: 'var(--text-muted)', label: 'パスをコピー', key: 'Ctrl+Shift+C', onClick: () => { closeCtx(); void copyPathToClipboard() } })
    if (!multi && f && !f.folder) {
      items.push({ icon: '🕓', iconColor: 'var(--text-muted)', label: 'コピーを日付付きで保存', key: '', onClick: () => { closeCtx(); void duplicateSelectedAsDatedCopy() } })
    }
    items.push({ divider: true })
    // "ショートカットテキストの作成" (パスを書いた.txt) が既定。実体の.lnkが
    // 通用しない対象(クラウド同期フォルダ等)でも確実に使えるため。
    // 一般的な.lnkショートカットが要る場合は下の「ショートカットの作成」で。
    items.push({ icon: '📝', iconColor: 'var(--text-muted)', label: 'ショートカットテキストの作成', key: '', onClick: () => { closeCtx(); void createPathShortcutTextForSel() } })
    items.push({ icon: '🔗', iconColor: 'var(--text-muted)', label: 'ショートカットの作成', key: '', onClick: () => { closeCtx(); void createShortcutForSel() } })
    // Single item → inline edit in the list. A multi-selection already has
    // 一括リネーム at the top of this menu, so it isn't repeated here.
    if (!multi) items.push({ icon: '✎', iconColor: 'var(--text-muted)', label: '名前の変更', key: 'F2', onClick: () => { closeCtx(); startRename(pi, idx) } })
    items.push({ icon: '🗑', iconColor: 'var(--danger)', label: '削除', key: 'Del', danger: true, onClick: () => { closeCtx(); void deleteSelected() } })
    items.push({ divider: true })
    items.push({ icon: '◳', iconColor: 'var(--text-muted)', label: 'エクスプローラーで表示', key: '', onClick: () => { closeCtx(); revealInExplorer() } })
    if (!multi) {
      items.push({ icon: '⊞', iconColor: 'var(--text-muted)', label: 'Windows のメニューを表示…', key: '', onClick: () => { const cx = x, cy = y; closeCtx(); void showOsContextMenuForSel(cx, cy) } })
    }
    items.push({ icon: '★', iconColor: '#B7791F', label: 'ブックマークに追加', key: '', onClick: () => { closeCtx(); addBookmark() } })
    if (extTools.tortoiseSvn) {
      items.push({ icon: '🐢', iconColor: '#2F8F5B', label: 'TortoiseSVN', key: '', arrow: true, subId: 'svn', onClick: () => openSub('svn') })
    }
    if (extTools.winmerge && selCount <= 3) {
      items.push({ icon: '⇄', iconColor: '#6A5BD0', label: selCount === 2 ? 'WinMergeで比較' : 'WinMergeで開く', key: '', onClick: () => { const paths = targetAbs(); closeCtx(); void runWinMerge(paths) } })
    }
    items.push({ icon: '⋯', iconColor: 'var(--text-muted)', label: 'その他のアクション', key: '', arrow: true, subId: 'more', onClick: () => openSub('more') })
    items.push({ divider: true })
    items.push({ icon: 'ℹ', iconColor: 'var(--text-muted)', label: 'プロパティ', key: 'Alt+Enter', onClick: () => { closeCtx(); shellProperties() } })
  }

  const filtered = ql ? items.filter(it => 'divider' in it && it.divider ? false : !('label' in it) ? false : (it as { label: string }).label.toLowerCase().includes(ql)) : items
  const empty = ql && filtered.filter(it => !('divider' in it) || !it.divider).length === 0

  // Vertical offset for a submenu, so it opens flush with the row that
  // triggered it regardless of how many items sit above it in this menu.
  const ROW_H = 29, DIVIDER_H = 9
  const subTopFor = (id: string): number => {
    let top = 37 /* search box */ + (!ql && pinnedItems.length > 0 ? 43 : 0) + (multi ? 27 : 0)
    for (const it of filtered) {
      if ('divider' in it && it.divider) { top += DIVIDER_H; continue }
      if (it.subId === id) break
      top += ROW_H
    }
    return top
  }

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
            const item = it as { icon: string; iconColor: string; label: string; key: string; arrow?: boolean; subId?: string; danger?: boolean; onClick: () => void }
            return (
              <CtxItem
                key={item.label}
                icon={item.icon}
                iconColor={item.iconColor}
                label={item.label}
                shortcut={item.key}
                arrow={item.arrow}
                danger={item.danger}
                active={!!item.subId && sub === item.subId}
                onClick={item.onClick}
                onEnter={() => {
                  // Hovering a different arrow item swaps which submenu is
                  // open (no extra click); hovering a plain item closes one.
                  if (item.subId) { if (sub !== item.subId) openSub(item.subId) }
                  else if (!item.arrow && sub) useStore.setState(s => s.ctx ? { ctx: { ...s.ctx!, sub: null } } : {})
                }}
              />
            )
          })}
          {empty && <div style={{ padding: 14, textAlign: 'center', fontSize: 11.5, color: 'var(--text-faint)' }}>一致なし</div>}
        </div>

        {/* submenus — each opens flush with the row that triggered it */}
        {sub === 'new' && !ql && (
          <div style={{ position: 'absolute', left: W - 6, top: subTopFor('new'), width: 220, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)' }}>
            {NEW_ITEMS.map(it => (
              <CtxItem key={it.kind} icon={it.icon} iconColor={it.iconColor} label={it.label} shortcut="" onClick={() => {
                closeCtx()
                void createNewItem(it.kind)
              }} onEnter={() => {}} />
            ))}
          </div>
        )}
        {sub === 'svn' && !ql && (
          <div style={{ position: 'absolute', left: W - 6, top: subTopFor('svn'), width: 200, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)' }}>
            {SVN_ITEMS.map(it => (
              <CtxItem key={it.cmd} icon={it.icon} iconColor={it.iconColor} label={it.label} shortcut="" onClick={() => {
                const paths = targetAbs()
                closeCtx()
                void runTortoiseSvn(it.cmd, paths)
              }} onEnter={() => {}} />
            ))}
          </div>
        )}
        {sub === 'more' && !ql && (
          <div style={{ position: 'absolute', left: W - 6, top: subTopFor('more'), width: 200, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)' }}>
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
