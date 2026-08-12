import { useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { OptTab, AppearanceOptions } from '../../types'
import { THEME_LIST, THEMES } from 'flex-design/themes/presets.js'
import type { FlexTheme } from 'flex-design/themes/presets.js'
import { loadCustomThemes, saveCustomTheme, deleteCustomTheme } from 'flex-design/runtime/theme.js'
import { parseFlexThemeFile, serializeFlexThemeFile } from 'flex-design/theme-forge/schema.js'
import { ThemePreview } from 'flex-design/components'
import ThemeDesignerModal from './ThemeDesignerModal'

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const NAV: { id: OptTab; label: string; icon: string }[] = [
  { id: 'appearance', label: '外観', icon: '◑' },
  { id: 'shortcuts', label: 'ショートカット', icon: '⌨' },
  { id: 'files', label: 'ファイル表示', icon: '👁' },
  { id: 'default', label: 'デフォルト動作', icon: '⚙' },
  { id: 'win', label: 'Windows 統合', icon: '⊞' },
  { id: 'advanced', label: '詳細設定', icon: '⚗' },
]

const ACCENT_PRESETS = [
  '#2E6FD8', '#6A5BD0', '#2F8F5B', '#C0473E', '#2A8C9E', '#B7791F', '#c0359e', '#888888'
]

const SHORTCUT_GROUPS = [
  { title: 'ナビゲーション', items: [['nav.up','上の項目へ','↑'],['nav.down','下の項目へ','↓'],['nav.parent','親フォルダへ','Alt+↑'],['nav.back','戻る','Alt+←'],['nav.forward','進む','Alt+→'],['nav.open','開く / フォルダへ','Enter'],['nav.newtab','新しいタブ','Ctrl+T'],['nav.closetab','タブを閉じる','Ctrl+W'],['cmd.goto','GoTo','Ctrl+G'],['view.split','ペインを切替','Ctrl+\\']] },
  { title: '表示', items: [['view.inspector','Inspector を開閉','Space'],['cmd.palette','コマンドパレット','Ctrl+Shift+P'],['cmd.options','オプション','Ctrl+,'],['view.density','表示密度を切替','Ctrl+Shift+D'],['view.theme','テーマを切替','Ctrl+Shift+L'],['view.sidebar','サイドバーを開閉','Ctrl+B']] },
  { title: '編集', items: [['edit.copy','コピー','Ctrl+C'],['edit.cut','切り取り','Ctrl+X'],['edit.paste','貼り付け','Ctrl+V'],['edit.rename','名前の変更','F2'],['edit.bulk','一括リネーム','Ctrl+Shift+R'],['edit.delete','削除','Del'],['edit.copypath','パスをコピー','Ctrl+Shift+C']] },
  { title: '検索', items: [['find.filter','フィルタ検索','Ctrl+F'],['find.global','グローバル検索','Ctrl+Shift+F']] },
]

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      style={{ height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid var(--border-strong)', background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12.5, outline: 'none', cursor: 'default' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{ width: 34, height: 18, borderRadius: 9, background: value ? 'var(--accent)' : 'var(--border-strong)', position: 'relative', cursor: 'default', transition: 'background .15s', flex: '0 0 34px' }}
    >
      <span style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flex: '0 0 auto' }}>{children}</div>
    </div>
  )
}

function Section({ title }: { title: string }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', textTransform: 'uppercase', marginTop: 18, marginBottom: 6 }}>{title}</div>
}

function AppearanceTab() {
  const opt = useStore(s => s.opt)
  const setOpt = useStore(s => s.setOpt)
  const setOptTheme = useStore(s => s.setOptTheme)

  const [refresh, setRefresh] = useState(0)
  const bump = () => setRefresh(r => r + 1)
  const customThemes = useMemo(() => loadCustomThemes(), [refresh])
  const [designerOpen, setDesignerOpen] = useState(false)
  const [importErrors, setImportErrors] = useState<string[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function importCustomTheme(theme: FlexTheme) {
    if (customThemes.some(t => t.key === theme.key)) {
      if (!window.confirm(`同名のテーマ「${theme.label}」が既にあります。上書きしますか？`)) return
    }
    saveCustomTheme(theme)
    setOptTheme(theme.key)
    bump()
    setImportErrors(null)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = parseFlexThemeFile(String(reader.result))
      if (!result.ok) { setImportErrors(result.errors); return }
      importCustomTheme(result.theme)
    }
    reader.readAsText(file)
  }

  function exportCustomTheme(theme: FlexTheme) {
    const json = serializeFlexThemeFile({ theme, meta: { name: theme.label, sub: theme.sub } })
    downloadJson(`${theme.key.replace(/^custom:/, '')}.flextheme.json`, json)
  }

  function removeCustomTheme(theme: FlexTheme) {
    if (!window.confirm(`テーマ「${theme.label}」を削除しますか？`)) return
    deleteCustomTheme(theme.key)
    if (opt.theme === theme.key) setOptTheme('flex-light')
    bump()
  }

  return (
    <div>
      <Section title="テーマ" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 4 }}>
        {THEME_LIST.map(t => {
          const tt = THEMES[t.key]
          const active = opt.theme === t.key
          return (
            <div
              key={t.key}
              onClick={() => setOptTheme(t.key)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'), background: active ? 'var(--accent-soft)' : 'var(--bg-page)', cursor: 'default' }}
            >
              <ThemePreview theme={tt} style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid ' + tt.border }} />
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', marginTop: 6 }}>{t.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.sub}</div>
            </div>
          )
        })}
      </div>

      {customThemes.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 10, marginBottom: 6 }}>カスタムテーマ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 4 }}>
            {customThemes.map(tt => {
              const active = opt.theme === tt.key
              return (
                <div
                  key={tt.key}
                  onClick={() => setOptTheme(tt.key)}
                  style={{ position: 'relative', padding: 8, borderRadius: 6, border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'), background: active ? 'var(--accent-soft)' : 'var(--bg-page)', cursor: 'default' }}
                >
                  <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
                    <span title="書き出し" onClick={e => { e.stopPropagation(); exportCustomTheme(tt) }} style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-faint)', borderRadius: 3 }}>⭳</span>
                    <span title="削除" onClick={e => { e.stopPropagation(); removeCustomTheme(tt) }} style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-faint)', borderRadius: 3 }}>✕</span>
                  </div>
                  <ThemePreview theme={tt} style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid ' + tt.border }} />
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tt.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tt.sub || 'カスタムテーマ'}</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 4 }}>
        <SmallBtn onClick={() => setDesignerOpen(true)}>＋ テーマを作成…</SmallBtn>
        <SmallBtn onClick={() => fileInputRef.current?.click()}>インポート…</SmallBtn>
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: 'none' }} />
      </div>
      {importErrors && (
        <div style={{ marginTop: 4, marginBottom: 4, padding: '8px 10px', borderRadius: 6, background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 11 }}>
          {importErrors.map((e, i) => <div key={i}>・{e}</div>)}
        </div>
      )}
      {designerOpen && (
        <ThemeDesignerModal
          restoreThemeKey={opt.theme}
          onClose={() => setDesignerOpen(false)}
          onSave={({ theme }) => { importCustomTheme(theme); setDesignerOpen(false) }}
        />
      )}

      <Row label="アクセントカラー">
        <div style={{ display: 'flex', gap: 4 }}>
          {ACCENT_PRESETS.map(c => (
            <div
              key={c}
              onClick={() => setOpt('accent', c)}
              style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'default', border: opt.accent === c ? '2px solid var(--text)' : '2px solid transparent', boxSizing: 'border-box', transition: 'border .1s' }}
            />
          ))}
          <div
            onClick={() => setOpt('accent', null)}
            title="デフォルト"
            style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--border-strong)', cursor: 'default', border: opt.accent === null ? '2px solid var(--text)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-faint)' }}
          >✕</div>
        </div>
      </Row>

      <Section title="レイアウト" />
      <Row label="フォントサイズ">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{opt.fontSize}px</span>
          <input
            type="range" min={11} max={16} value={opt.fontSize}
            onChange={e => setOpt('fontSize', parseInt(e.target.value) as AppearanceOptions['fontSize'])}
            style={{ width: 90, accentColor: 'var(--accent)' }}
          />
        </div>
      </Row>
      <Row label="行の高さ">
        <Select value={opt.rowHeight} onChange={v => setOpt('rowHeight', v)} options={[
          { value: 'compact', label: 'コンパクト (28px)' },
          { value: 'standard', label: 'スタンダード (32px)' },
          { value: 'loose', label: 'ゆったり (38px)' },
        ]} />
      </Row>
      <Row label="アイコンサイズ">
        <Select value={String(opt.iconSize)} onChange={v => setOpt('iconSize', parseInt(v) as 16 | 24 | 32)} options={[
          { value: '16', label: '小 (16px)' },
          { value: '24', label: '中 (24px)' },
          { value: '32', label: '大 (32px)' },
        ]} />
      </Row>
      <Row label="角丸">
        <Select value={opt.radius} onChange={v => setOpt('radius', v)} options={[
          { value: 'sharp', label: 'なし' },
          { value: 'medium', label: '中 (推奨)' },
          { value: 'round', label: '大きめ' },
        ]} />
      </Row>

      <Section title="表示効果" />
      <Row label="ゼブラストライプ" desc="偶数行に薄い背景色を適用">
        <Toggle value={opt.zebra} onChange={v => setOpt('zebra', v)} />
      </Row>
      <Row label="非アクティブペインを薄く" desc="フォーカス外のペインを半透明表示">
        <Toggle value={opt.dimInactive} onChange={v => setOpt('dimInactive', v)} />
      </Row>
      <Row label="アニメーション">
        <Select value={opt.anim} onChange={v => setOpt('anim', v)} options={[
          { value: 'on', label: '有効' },
          { value: 'reduce', label: '最小限' },
          { value: 'off', label: '無効' },
        ]} />
      </Row>
    </div>
  )
}

function ShortcutsTab() {
  const binds = useStore(s => s.binds)
  const capturing = useStore(s => s.capturing)
  const startCapture = useStore(s => s.startCapture)
  const captureKey = useStore(s => s.captureKey)
  const [filter, setFilter] = useState('')
  const fl = filter.trim().toLowerCase()

  const allBindValues = Object.values(binds)
  const conflicts = new Set(allBindValues.filter((v, i) => allBindValues.indexOf(v) !== i))

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="ショートカットを検索…"
          style={{ width: '100%', height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {capturing && (
        <div
          style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 12, color: 'var(--accent)' }}
          onKeyDown={e => { e.preventDefault(); e.stopPropagation(); const parts = []; if (e.ctrlKey) parts.push('Ctrl'); if (e.altKey) parts.push('Alt'); if (e.shiftKey) parts.push('Shift'); if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift') parts.push(e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key); if (parts.length) captureKey(parts.join('+')) }}
          tabIndex={0}
          autoFocus
        >
          キーを押してください… (Esc でキャンセル)
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', padding: '5px 10px', background: 'var(--bg-sunken)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>アクション</span>
          <span>ショートカット</span>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {SHORTCUT_GROUPS.map(grp => {
            const rows = grp.items.filter(([,label]) => !fl || label.toLowerCase().includes(fl))
            if (rows.length === 0) return null
            return (
              <div key={grp.title}>
                <div style={{ padding: '5px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-faint)', textTransform: 'uppercase', background: 'var(--bg-page)' }}>{grp.title}</div>
                {rows.map(([id, label]) => {
                  const bind = binds[id] || ''
                  const isCapturing = capturing === id
                  const hasConflict = bind && conflicts.has(bind)
                  return (
                    <div
                      key={id}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 100px', padding: '5px 10px', fontSize: 12.5, borderBottom: '1px solid var(--border)', alignItems: 'center', background: isCapturing ? 'var(--accent-soft)' : 'transparent' }}
                    >
                      <span style={{ color: 'var(--text)' }}>{label}</span>
                      <span
                        onClick={() => startCapture(id)}
                        title="クリックして変更"
                        style={{ fontFamily: 'var(--mono)', fontSize: 11, color: hasConflict ? 'var(--danger)' : 'var(--accent)', background: isCapturing ? 'var(--accent)' : 'var(--bg-page)', border: `1px solid ${isCapturing ? 'var(--accent)' : 'var(--border-strong)'}`, borderRadius: 4, padding: '2px 7px', cursor: 'default', whiteSpace: 'nowrap', display: 'inline-block' }}
                      >{isCapturing ? '…' : (bind || '—')}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <SmallBtn onClick={() => useStore.getState().exportShortcuts()}>エクスポート</SmallBtn>
        <SmallBtn onClick={() => useStore.getState().importShortcuts()}>インポート</SmallBtn>
        <SmallBtn onClick={() => useStore.getState().resetOptCategory('shortcuts')} danger>リセット</SmallBtn>
      </div>
    </div>
  )
}

function FilesTab() {
  const adv = useStore(s => s.adv)
  const toggleAdv = useStore(s => s.toggleAdv)
  return (
    <div>
      <Section title="表示" />
      <Row label="隠しファイルを表示" desc="ドットから始まるファイルとシステムファイル">
        <Toggle value={adv.hidden} onChange={() => toggleAdv('hidden')} />
      </Row>
      <Row label="拡張子を常に表示" desc="既知の種類でも拡張子を表示する">
        <Toggle value={adv.alwaysExt} onChange={() => toggleAdv('alwaysExt')} />
      </Row>
    </div>
  )
}

function DefaultTab() {
  const adv = useStore(s => s.adv)
  const toggleAdv = useStore(s => s.toggleAdv)
  return (
    <div>
      <Section title="操作" />
      <Row label="シングルクリックで開く" desc="ダブルクリックの代わりにシングルクリックで開く">
        <Toggle value={adv.singleClick} onChange={() => toggleAdv('singleClick')} />
      </Row>
      <Row label="削除前に確認" desc="ゴミ箱へ移動する前に確認ダイアログを表示">
        <Toggle value={adv.confirmDelete} onChange={() => toggleAdv('confirmDelete')} />
      </Row>
      <Row label="前回のタブを復元" desc="起動時に前回開いていたタブを復元">
        <Toggle value={adv.restore} onChange={() => toggleAdv('restore')} />
      </Row>
    </div>
  )
}

function WinTab() {
  const adv = useStore(s => s.adv)
  const toggleAdv = useStore(s => s.toggleAdv)
  return (
    <div>
      <Section title="Windows 統合" />
      <Row label="エクスプローラーの右クリックメニューに追加" desc="フォルダの右クリックから FlexExplorer で開く">
        <Toggle value={adv.explorerCtx} onChange={() => toggleAdv('explorerCtx')} />
      </Row>
      <Row label="クイック起動に追加" desc="タスクバーにアイコンをピン留め">
        <Toggle value={adv.quickLaunch} onChange={() => toggleAdv('quickLaunch')} />
      </Row>
      <Row label="ジャンプリストに最近開いたフォルダを表示" desc="タスクバーの右クリックに表示">
        <Toggle value={adv.jumpType} onChange={() => toggleAdv('jumpType')} />
      </Row>
    </div>
  )
}

function AdvancedTab() {
  const adv = useStore(s => s.adv)
  const toggleAdv = useStore(s => s.toggleAdv)
  return (
    <div>
      <Section title="パフォーマンス" />
      <Row label="GPU アクセラレーション" desc="ハードウェアレンダリングを使用 (要再起動)">
        <Toggle value={adv.gpu} onChange={() => toggleAdv('gpu')} />
      </Row>
      <div style={{ marginTop: 24, padding: '12px 14px', borderRadius: 7, border: '1px dashed var(--border-strong)', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>FlexExplorer</strong> v0.1.0 — Tauri 2 / React 18
      </div>
    </div>
  )
}

function SmallBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ height: 26, padding: '0 10px', borderRadius: 5, border: `1px solid ${danger ? 'var(--danger)' : 'var(--border-strong)'}`, fontSize: 11.5, cursor: 'default', display: 'flex', alignItems: 'center', color: danger ? 'var(--danger)' : hover ? 'var(--text)' : 'var(--text-muted)', background: hover ? 'var(--bg-hover)' : 'transparent' }}
    >{children}</div>
  )
}

import React from 'react'

export default function OptionsModal() {
  const modal = useStore(s => s.modal)
  const optTab = useStore(s => s.optTab)
  const setOptTab = useStore(s => s.setOptTab)
  const closeModal = useStore(s => s.closeModal)
  const resetOptCategory = useStore(s => s.resetOptCategory)
  const anim = useStore(s => s.opt.anim)

  if (modal !== 'options') return null

  const tabContent: Record<OptTab, React.ReactNode> = {
    appearance: <AppearanceTab />,
    shortcuts: <ShortcutsTab />,
    files: <FilesTab />,
    default: <DefaultTab />,
    win: <WinTab />,
    advanced: <AdvancedTab />,
  }

  return (
    <>
      <div
        onMouseDown={closeModal}
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.32)' }}
      />
      <div style={{
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 51, width: 760, height: 580,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)',
        display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)',
        overflow: 'hidden',
        transition: anim === 'off' ? 'none' : undefined,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', flex: '0 0 auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>オプション設定</div>
          <div
            onClick={closeModal}
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'default', color: 'var(--text-faint)', fontSize: 13 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
          >✕</div>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left nav */}
          <div style={{ width: 176, flex: '0 0 176px', background: 'var(--bg-sunken)', borderRight: '1px solid var(--border)', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map(n => {
              const active = optTab === n.id
              return (
                <NavItem key={n.id} icon={n.icon} label={n.label} active={active} onClick={() => setOptTab(n.id)} />
              )
            })}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px' }}>
            {tabContent[optTab]}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '10px 20px', borderTop: '1px solid var(--border)', flex: '0 0 auto' }}>
          <SmallBtn onClick={() => resetOptCategory(optTab)} danger>カテゴリをリセット</SmallBtn>
          <div style={{ flex: 1 }} />
          <PrimaryBtn onClick={closeModal}>閉じる</PrimaryBtn>
        </div>
      </div>
    </>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 14px', cursor: 'default', fontSize: 12.5, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : hover ? 'var(--text)' : 'var(--text-muted)', background: active ? 'var(--accent-soft)' : hover ? 'var(--bg-hover)' : 'transparent', borderRight: active ? '2px solid var(--accent)' : '2px solid transparent' }}
    >
      <span style={{ width: 15, textAlign: 'center', fontSize: 13 }}>{icon}</span>
      {label}
    </div>
  )
}

function PrimaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ height: 30, padding: '0 16px', borderRadius: 6, cursor: 'default', fontSize: 12.5, fontWeight: 550, display: 'flex', alignItems: 'center', color: 'var(--accent-contrast)', background: hover ? 'var(--accent-hover)' : 'var(--accent)' }}
    >{children}</div>
  )
}
