import { useState, useEffect, useRef, type MouseEvent } from 'react'
import { useStore } from '../store/useStore'
import { isTauri, winMinimize, winToggleMaximize, winClose, winStartDragging } from '../fs/bridge'

function SearchBox() {
  const search = useStore(s => s.search)
  const searchMode = useStore(s => s.searchMode)
  const setSearch = useStore(s => s.setSearch)
  const toggleSearchMode = useStore(s => s.toggleSearchMode)
  const runGlobalSearch = useStore(s => s.runGlobalSearch)
  const [focus, setFocus] = useState(false)
  const placeholder = searchMode === 'filter' ? 'このフォルダ内をフィルタ…  (Ctrl+F)' : 'すべての場所を検索…  (Ctrl+Shift+F)'

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{ width: '100%', maxWidth: 420, display: 'flex', alignItems: 'center', gap: 7, height: 25, padding: '0 9px', background: 'var(--bg-page)', border: `1px solid ${focus ? 'var(--accent)' : 'var(--border-strong)'}`, borderRadius: 6 }}
    >
      <span style={{ position: 'relative', width: 12, height: 12, flex: '0 0 12px' }}>
        <span style={{ position: 'absolute', width: 8, height: 8, border: '1.4px solid var(--text-faint)', borderRadius: '50%' }} />
        <span style={{ position: 'absolute', left: 7, top: 7, width: 4.5, height: 1.4, background: 'var(--text-faint)', transform: 'rotate(45deg)', transformOrigin: 'left' }} />
      </span>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={e => { if (e.key === 'Enter' && searchMode === 'global') { e.preventDefault(); runGlobalSearch() } }}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: 11.5, color: 'var(--text)' }}
      />
      <div
        onClick={toggleSearchMode}
        title="フィルタ / グローバル検索"
        style={{ fontSize: 9.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, cursor: 'default', flex: '0 0 auto', color: searchMode === 'global' ? 'var(--accent-contrast)' : 'var(--accent)', background: searchMode === 'global' ? 'var(--accent)' : 'var(--accent-soft)' }}
      >{searchMode === 'filter' ? 'フィルタ' : 'グローバル'}</div>
    </div>
  )
}

type MenuItem = { type: 'sep' } | { type: 'item'; label: string; key?: string; danger?: boolean; run: () => void }

function buildMenus(): { title: string; items: MenuItem[] }[] {
  const s = useStore.getState
  const ap = () => s().activePane
  return [
    {
      title: 'ファイル', items: [
        { type: 'item', label: '新しいタブ', key: 'Ctrl+T', run: () => s().newTab(ap()) },
        { type: 'item', label: '新しいフォルダー', run: () => void s().createNewFolder() },
        { type: 'item', label: 'タブを閉じる', key: 'Ctrl+W', run: () => s().closeTab(ap(), s().panes[ap()].active) },
        { type: 'item', label: '閉じたタブを復元', key: 'Ctrl+Shift+T', run: () => s().reopenClosedTab() },
        { type: 'item', label: 'ピン留め以外のタブを閉じる', run: () => s().cleanTabs(ap()) },
        { type: 'sep' },
        { type: 'item', label: 'ワークスペース…', key: 'Ctrl+Shift+S', run: () => s().openModal('workspaces') },
        { type: 'item', label: '閉じたグループを復元', key: 'Ctrl+Shift+G', run: () => s().reopenClosedLayoutGroup() },
        { type: 'sep' },
        { type: 'item', label: '終了', danger: true, run: () => { if (isTauri) void winClose(); else s().showToast('終了') } },
      ],
    },
    {
      title: '編集', items: [
        { type: 'item', label: 'コピー', key: 'Ctrl+C', run: () => s().copyToClip() },
        { type: 'item', label: '切り取り', key: 'Ctrl+X', run: () => s().cutToClip() },
        { type: 'item', label: '貼り付け', key: 'Ctrl+V', run: () => void s().paste() },
        { type: 'sep' },
        { type: 'item', label: '名前の変更', key: 'F2', run: () => s().openModal('rename') },
        { type: 'item', label: '一括リネーム…', key: 'Ctrl+Shift+R', run: () => s().openModal('rename') },
        { type: 'item', label: '削除', key: 'Del', danger: true, run: () => void s().deleteSelected() },
        { type: 'sep' },
        { type: 'item', label: 'パスをコピー', key: 'Ctrl+Shift+C', run: () => void s().copyPathToClipboard() },
      ],
    },
    {
      title: '表示', items: [
        { type: 'item', label: 'サイドバーを開閉', key: 'Ctrl+B', run: () => s().toggleSidebar() },
        { type: 'item', label: 'Inspector を開閉', key: 'Space', run: () => s().toggleInspector() },
        { type: 'item', label: 'テーマを切替', key: 'Ctrl+Shift+L', run: () => s().toggleTheme() },
        { type: 'sep' },
        { type: 'item', label: 'オプション…', key: 'Ctrl+,', run: () => s().openModal('options') },
      ],
    },
    {
      title: '移動', items: [
        { type: 'item', label: '戻る', run: () => s().navBack(ap()) },
        { type: 'item', label: '進む', run: () => s().navForward(ap()) },
        { type: 'item', label: '親フォルダーへ', key: 'Alt+↑', run: () => s().navParent(ap()) },
        { type: 'sep' },
        { type: 'item', label: 'ペインを切替', key: 'Tab', run: () => s().cyclePane(1) },
        { type: 'item', label: 'ペインを入れ替え', key: 'Ctrl+Shift+X', run: () => s().swapPanes() },
        { type: 'sep' },
        { type: 'item', label: 'パスを直接入力', key: 'Ctrl+L', run: () => s().startAddressEdit(ap()) },
        { type: 'sep' },
        { type: 'item', label: 'ブックマークに追加', run: () => s().addBookmark() },
        { type: 'item', label: 'GoTo…', key: 'Ctrl+G', run: () => s().openGoto() },
      ],
    },
    {
      title: 'ヘルプ', items: [
        { type: 'item', label: 'コマンドパレット', key: 'Ctrl+Shift+P', run: () => s().openPalette() },
        { type: 'sep' },
        { type: 'item', label: 'FlexExplorer について', run: () => s().showToast('FlexExplorer v0.1.0') },
      ],
    },
  ]
}

function WinBtn({ label, title, onClick, danger }: { label: string; title: string; onClick: () => void; danger?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ width: 46, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', fontSize: danger ? 12 : 13, background: hover ? (danger ? 'var(--danger)' : 'var(--bg-hover)') : 'transparent', color: hover && danger ? '#fff' : 'var(--text-muted)' }}
    >{label}</div>
  )
}

export default function TitleBar() {
  const showToast = useStore(s => s.showToast)
  const maximized = useStore(s => s.maximized)
  const setMaximized = useStore(s => s.setMaximized)
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const menus = buildMenus()

  useEffect(() => {
    if (openMenu === null) return
    const close = () => setOpenMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [openMenu])

  const onMinimize = () => { if (isTauri) void winMinimize(); else showToast('最小化') }
  const onMaximize = () => {
    if (isTauri) { void winToggleMaximize(); setMaximized(!maximized) }
    else showToast('最大化')
  }
  const onClose = () => { if (isTauri) void winClose(); else showToast('ウィンドウを閉じる') }

  // Native window dragging consumes the dblclick event, so detect a
  // double-click manually on mousedown and toggle maximize instead of dragging.
  const lastDownRef = useRef(0)
  const onDragRegion = (e: MouseEvent) => {
    if (!isTauri || e.button !== 0) return
    const now = Date.now()
    if (now - lastDownRef.current < 350) {
      lastDownRef.current = 0
      void winToggleMaximize()
      setMaximized(!maximized)
      return
    }
    lastDownRef.current = now
    void winStartDragging()
  }

  return (
    <div
      onMouseDown={onDragRegion}
      style={{
        height: 36, flex: '0 0 36px', display: 'flex', alignItems: 'center',
        background: 'var(--bg-titlebar)', borderBottom: '1px solid var(--border)',
        paddingLeft: 12, userSelect: 'none',
      }}>
      {/* Menu bar */}
      <div onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 1, fontSize: 12, color: 'var(--text-muted)', position: 'relative' }}>
        {menus.map((m, i) => (
          <div key={m.title} style={{ position: 'relative' }}>
            <span
              onMouseDown={e => { e.stopPropagation(); setOpenMenu(openMenu === i ? null : i) }}
              onMouseEnter={() => { if (openMenu !== null) setOpenMenu(i) }}
              style={{ display: 'inline-block', padding: '4px 9px', borderRadius: 5, cursor: 'default', background: openMenu === i ? 'var(--bg-active)' : 'transparent', color: openMenu === i ? 'var(--text)' : 'var(--text-muted)' }}
            >{m.title}</span>
            {openMenu === i && (
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{ position: 'absolute', top: 26, left: 0, zIndex: 60, minWidth: 220, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 14px 40px var(--shadow)' }}
              >
                {m.items.map((it, j) => it.type === 'sep'
                  ? <div key={j} style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
                  : <MenuRow key={j} label={it.label} shortcut={it.key} danger={it.danger} onClick={() => { setOpenMenu(null); it.run() }} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, padding: '0 10px' }}>
        <SearchBox />
      </div>
      <div onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} style={{ display: 'flex', height: '100%', alignItems: 'stretch' }}>
        <WinBtn label="─" title="最小化" onClick={onMinimize} />
        <WinBtn label={maximized ? '❐' : '▢'} title="最大化" onClick={onMaximize} />
        <WinBtn label="✕" title="閉じる" onClick={onClose} danger />
      </div>
    </div>
  )
}

function MenuRow({ label, shortcut, danger, onClick }: { label: string; shortcut?: string; danger?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 18, height: 28, padding: '0 11px', borderRadius: 6, cursor: 'default', fontSize: 12.5, color: danger ? 'var(--danger)' : 'var(--text)', background: hover ? (danger ? 'var(--danger-soft)' : 'var(--bg-hover)') : 'transparent' }}
    >
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
      {shortcut && <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-faint)' }}>{shortcut}</span>}
    </div>
  )
}
