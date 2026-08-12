import { useState, type ReactNode } from 'react'
import { useStore } from '../store/useStore'
import { THEMES } from 'flex-design/themes/presets.js'
import LayoutMenu from './LayoutMenu'
import LayoutTabs from './LayoutTabs'

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '4px 11px', borderRadius: 5, cursor: 'default', fontSize: 11.5, fontWeight: active ? 650 : 500, color: active ? 'var(--accent-contrast)' : 'var(--text-muted)', background: active ? 'var(--accent)' : 'transparent' }}
    >{children}</div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false)
  return (
    <div title={title} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', color: hover ? 'var(--text)' : 'var(--text-muted)', background: hover ? 'var(--bg-hover)' : 'transparent' }}
    >{children}</div>
  )
}

export default function ToolBar() {
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)
  const openModal = useStore(s => s.openModal)
  const openPalette = useStore(s => s.openPalette)
  const openGoto = useStore(s => s.openGoto)
  const activePane = useStore(s => s.activePane)
  const navBack = useStore(s => s.navBack)
  const navForward = useStore(s => s.navForward)
  const navParent = useStore(s => s.navParent)

  const [renameHover, setRenameHover] = useState(false)
  const [cmdHover, setCmdHover] = useState(false)
  const [optHover, setOptHover] = useState(false)

  return (
    <div style={{ height: 44, flex: '0 0 44px', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: 'var(--bg-toolbar)', borderBottom: '1px solid var(--border)' }}>
      {/* Nav buttons */}
      <div style={{ display: 'flex', gap: 2 }}>
        <IconBtn title="戻る" onClick={() => navBack(activePane)}>←</IconBtn>
        <IconBtn title="進む" onClick={() => navForward(activePane)}>→</IconBtn>
        <IconBtn title="親フォルダへ" onClick={() => navParent(activePane)}>↑</IconBtn>
        <IconBtn title="GoTo (Ctrl+G)" onClick={openGoto}>⌖</IconBtn>
      </div>

      {/* Layout group tabs (Tablacus-style pane bundles) */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        <LayoutTabs />
      </div>

      {/* Rename btn */}
      <div
        onClick={() => openModal('rename')}
        onMouseEnter={() => setRenameHover(true)}
        onMouseLeave={() => setRenameHover(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 7, cursor: 'default', fontSize: 12, fontWeight: 550, color: renameHover ? 'var(--accent-contrast)' : 'var(--accent)', background: renameHover ? 'var(--accent)' : 'var(--accent-soft)' }}
      >⇆ 一括リネーム</div>

      {/* Palette btn */}
      <div
        onClick={openPalette}
        onMouseEnter={() => setCmdHover(true)}
        onMouseLeave={() => setCmdHover(false)}
        title="コマンドパレット (Ctrl+Shift+P)"
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 7, cursor: 'default', fontSize: 12, color: cmdHover ? 'var(--text)' : 'var(--text-muted)', background: cmdHover ? 'var(--bg-hover)' : 'var(--bg-page)', border: '1px solid var(--border-strong)' }}
      >❯ コマンド</div>

      <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

      {/* Pane layout */}
      <LayoutMenu />

      {/* Theme toggle (light/dark ベースの簡易切替。全テーマからの選択は オプション > 外観 で) */}
      <div style={{ display: 'flex', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 7, padding: 2, gap: 2 }}>
        <SegBtn active={(THEMES[theme]?.base ?? 'light') === 'light'} onClick={() => setTheme('flex-light')}>ライト</SegBtn>
        <SegBtn active={(THEMES[theme]?.base ?? 'light') === 'dark'} onClick={() => setTheme('flex-dark')}>ダーク</SegBtn>
      </div>

      {/* Options btn */}
      <div
        onClick={() => openModal('options')}
        onMouseEnter={() => setOptHover(true)}
        onMouseLeave={() => setOptHover(false)}
        title="オプション (Ctrl+,)"
        style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, cursor: 'default', color: optHover ? 'var(--text)' : 'var(--text-muted)', fontSize: 15, background: optHover ? 'var(--bg-hover)' : 'transparent' }}
      >⚙</div>
    </div>
  )
}
