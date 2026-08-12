import { useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'

const ALL_COMMANDS = [
  { id: 'view.inspector', label: 'Inspector を開閉', cat: '表示', key: 'Space' },
  { id: 'cmd.palette', label: 'コマンドパレットを開く', cat: '表示', key: 'Ctrl+Shift+P' },
  { id: 'cmd.options', label: 'オプションを開く', cat: '表示', key: 'Ctrl+,' },
  { id: 'cmd.goto', label: 'GoTo パスへ移動', cat: 'ナビゲーション', key: 'Ctrl+G' },
  { id: 'view.sidebar', label: 'サイドバーを開閉', cat: '表示', key: 'Ctrl+B' },
  { id: 'view.theme', label: 'テーマを切替', cat: '表示', key: 'Ctrl+Shift+L' },
  { id: 'view.density', label: '表示密度を切替', cat: '表示', key: 'Ctrl+Shift+D' },
  { id: 'view.split', label: 'ペインを切替', cat: 'ナビゲーション', key: 'Ctrl+\\' },
  { id: 'nav.up', label: '上の項目へ', cat: 'ナビゲーション', key: '↑' },
  { id: 'nav.down', label: '下の項目へ', cat: 'ナビゲーション', key: '↓' },
  { id: 'nav.parent', label: '親フォルダへ', cat: 'ナビゲーション', key: 'Alt+↑' },
  { id: 'nav.back', label: '戻る', cat: 'ナビゲーション', key: 'Alt+←' },
  { id: 'nav.forward', label: '進む', cat: 'ナビゲーション', key: 'Alt+→' },
  { id: 'nav.open', label: '開く / フォルダへ', cat: 'ナビゲーション', key: 'Enter' },
  { id: 'nav.newtab', label: '新しいタブ', cat: 'ナビゲーション', key: 'Ctrl+T' },
  { id: 'nav.closetab', label: 'タブを閉じる', cat: 'ナビゲーション', key: 'Ctrl+W' },
  { id: 'edit.copy', label: 'コピー', cat: '編集', key: 'Ctrl+C' },
  { id: 'edit.cut', label: '切り取り', cat: '編集', key: 'Ctrl+X' },
  { id: 'edit.paste', label: '貼り付け', cat: '編集', key: 'Ctrl+V' },
  { id: 'edit.rename', label: '名前の変更', cat: '編集', key: 'F2' },
  { id: 'edit.bulk', label: '一括リネーム…', cat: '編集', key: 'Ctrl+Shift+R' },
  { id: 'edit.delete', label: '削除', cat: '編集', key: 'Del' },
  { id: 'edit.copypath', label: 'パスをコピー', cat: '編集', key: 'Ctrl+Shift+C' },
  { id: 'find.filter', label: 'フィルタ検索', cat: '検索', key: 'Ctrl+F' },
  { id: 'find.global', label: 'グローバル検索', cat: '検索', key: 'Ctrl+Shift+F' },
]

export default function CommandPalette() {
  const palette = useStore(s => s.palette)
  const recent = useStore(s => s.recent)
  const binds = useStore(s => s.binds)
  const closePalette = useStore(s => s.closePalette)
  const paletteInput = useStore(s => s.paletteInput)
  const paletteSel = useStore(s => s.paletteSel)
  const runCommand = useStore(s => s.runCommand)
  const showToast = useStore(s => s.showToast)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (palette.open) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [palette.open])

  if (!palette.open) return null

  const q = palette.q.trim().toLowerCase()

  type PaletteItem = { id: string; label: string; cat: string; key: string }

  let groups: { title: string; items: PaletteItem[] }[] = []

  if (!q) {
    const recentCmds = recent.map(id => ALL_COMMANDS.find(c => c.id === id)).filter(Boolean) as PaletteItem[]
    if (recentCmds.length > 0) groups.push({ title: '最近使用', items: recentCmds })

    const cats = ['表示', 'ナビゲーション', '編集', '検索']
    cats.forEach(cat => {
      const items = ALL_COMMANDS.filter(c => c.cat === cat)
      if (items.length > 0) groups.push({ title: cat, items })
    })
  } else {
    const matches = ALL_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.id.includes(q) || c.cat.includes(q))
    if (matches.length > 0) groups = [{ title: '検索結果', items: matches }]
  }

  const flat: PaletteItem[] = groups.flatMap(g => g.items)
  const sel = Math.min(palette.sel, flat.length - 1)

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { closePalette(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel(Math.min(sel + 1, flat.length - 1)); scrollToSel(sel + 1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel(Math.max(sel - 1, 0)); scrollToSel(sel - 1) }
    if (e.key === 'Enter' && flat[sel]) { execute(flat[sel].id) }
  }

  const scrollToSel = (next: number) => {
    const el = listRef.current?.querySelector(`[data-idx="${next}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }

  const execute = (id: string) => {
    runCommand(id)
    // Run side-effects based on id
    const s = useStore.getState()
    const ap = s.activePane
    if (id === 'view.inspector') s.toggleInspector()
    else if (id === 'view.sidebar') s.toggleSidebar()
    else if (id === 'view.theme') s.toggleTheme()
    else if (id === 'cmd.goto') s.openGoto()
    else if (id === 'cmd.options') s.openModal('options')
    else if (id === 'edit.bulk') s.openModal('rename')
    else if (id === 'edit.rename') s.openModal('rename')
    else if (id === 'nav.newtab') s.newTab(ap)
    else if (id === 'nav.closetab') { const p = s.panes[ap]; s.closeTab(ap, p.active) }
    else if (id === 'nav.parent') s.navParent(ap)
    else if (id === 'nav.back') s.navBack(ap)
    else if (id === 'nav.forward') s.navForward(ap)
    else if (id === 'nav.up') s.moveSel(-1)
    else if (id === 'nav.down') s.moveSel(1)
    else if (id === 'nav.open') { const t = s.panes[ap].tabs[s.panes[ap].active]; s.openFile(ap, t.focus) }
    else if (id === 'edit.copy') s.copyToClip()
    else if (id === 'edit.cut') s.cutToClip()
    else if (id === 'edit.paste') void s.paste()
    else if (id === 'edit.delete') void s.deleteSelected()
    else if (id === 'edit.copypath') void s.copyPathToClipboard()
    else if (id === 'find.filter') { if (s.searchMode !== 'filter') s.toggleSearchMode() }
    else if (id === 'find.global') { if (s.searchMode !== 'global') s.toggleSearchMode() }
    else showToast(ALL_COMMANDS.find(c => c.id === id)?.label || id)
  }

  let flatIdx = 0

  return (
    <>
      <div onMouseDown={closePalette} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.28)' }} />
      <div style={{
        position: 'fixed', left: '50%', top: 80, transform: 'translateX(-50%)',
        zIndex: 56, width: 580,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 11, boxShadow: '0 20px 60px var(--shadow)',
        fontFamily: 'var(--font)', overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-faint)', fontSize: 14, fontFamily: 'var(--mono)' }}>❯</span>
          <input
            ref={inputRef}
            value={palette.q}
            onChange={e => paletteInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="コマンドを検索…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: 13.5, color: 'var(--text)' }}
          />
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>Esc</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto', padding: '4px 0' }}>
          {groups.length === 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>一致するコマンドがありません</div>
          )}
          {groups.map(grp => (
            <div key={grp.title}>
              <div style={{ padding: '6px 14px 3px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>{grp.title}</div>
              {grp.items.map(cmd => {
                const idx = flatIdx++
                const isSel = idx === sel
                const bind = binds[cmd.id] || cmd.key
                return (
                  <div
                    key={cmd.id}
                    data-idx={idx}
                    onClick={() => execute(cmd.id)}
                    onMouseEnter={() => paletteSel(idx)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 14px', cursor: 'default', background: isSel ? 'var(--bg-active)' : 'transparent', borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent' }}
                  >
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>{cmd.cat}</span>
                    {bind && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>{bind}</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{ display: 'flex', gap: 14, padding: '7px 14px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-faint)' }}>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>↑↓</kbd> 選択</span>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Enter</kbd> 実行</span>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Esc</kbd> 閉じる</span>
        </div>
      </div>
    </>
  )
}

import React from 'react'
