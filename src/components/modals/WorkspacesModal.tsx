import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'

export default function WorkspacesModal() {
  const modal = useStore(s => s.modal)
  const workspaces = useStore(s => s.workspaces)
  const closeModal = useStore(s => s.closeModal)
  const saveWorkspaceAs = useStore(s => s.saveWorkspaceAs)
  const loadNamedWorkspace = useStore(s => s.loadNamedWorkspace)
  const openWorkspaceInNewWindow = useStore(s => s.openWorkspaceInNewWindow)
  const deleteNamedWorkspace = useStore(s => s.deleteNamedWorkspace)
  const defaultWorkspace = useStore(s => s.defaultWorkspace)
  const setDefaultWorkspace = useStore(s => s.setDefaultWorkspace)
  const [name, setName] = useState('')
  const [pendingOverwrite, setPendingOverwrite] = useState(false)

  if (modal !== 'workspaces') return null

  const nm = name.trim()
  const exists = nm.length > 0 && workspaces.includes(nm)

  const save = () => {
    if (!nm) return
    if (exists && !pendingOverwrite) { setPendingOverwrite(true); return }
    void saveWorkspaceAs(nm)
    setName('')
    setPendingOverwrite(false)
  }

  return (
    <>
      <div onMouseDown={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.32)' }} />
      <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>ワークスペース</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>ペイン配置と開いているフォルダーを保存・切替</div>
          </div>
          <div
            onClick={closeModal}
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'default', color: 'var(--text-faint)', fontSize: 13 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
          >✕</div>
        </div>

        {/* save-as row */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 6 }}>名前を付けて保存</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setPendingOverwrite(false) }}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(''); setPendingOverwrite(false) } }}
              onBlur={() => setPendingOverwrite(false)}
              placeholder="現在のレイアウト名を入力…"
              autoFocus
              style={{ flex: 1, height: 32, padding: '0 10px', borderRadius: 7, border: `1px solid ${exists ? 'var(--warn)' : 'var(--border-strong)'}`, background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12.5, outline: 'none' }}
            />
            <div
              onClick={save}
              style={{ height: 32, padding: '0 14px', borderRadius: 7, display: 'flex', alignItems: 'center', cursor: 'default', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: !nm ? 'var(--text-faint)' : pendingOverwrite ? 'var(--accent-contrast)' : exists ? 'var(--warn)' : 'var(--accent-contrast)', background: !nm ? 'var(--bg-active)' : pendingOverwrite ? 'var(--warn)' : exists ? 'var(--warn-soft)' : 'var(--accent)' }}
            >{pendingOverwrite ? 'もう一度クリックで上書き' : exists ? '同名を上書き保存' : '保存'}</div>
          </div>
          {exists && !pendingOverwrite && (
            <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 6 }}>「{nm}」は既に存在します。保存すると内容が置き換わります。</div>
          )}
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {workspaces.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
              保存されたワークスペースはありません
            </div>
          ) : (
            workspaces.map(ws => (
              <Row
                key={ws}
                name={ws}
                isDefault={ws === defaultWorkspace}
                onToggleDefault={() => setDefaultWorkspace(ws === defaultWorkspace ? null : ws)}
                onOpen={() => loadNamedWorkspace(ws)}
                onOpenInNewWindow={() => openWorkspaceInNewWindow(ws)}
                onUpdate={() => saveWorkspaceAs(ws)}
                onDelete={() => deleteNamedWorkspace(ws)}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

/**
 * A row's 開く/更新/削除 are all destructive (open discards the live
 * session; update and delete overwrite/erase saved data with no undo), so
 * each goes through the same inline two-step confirm: first click arms it
 * (button restates itself as a question), second click within the window
 * actually runs it. Clicking anywhere else — or just waiting — disarms it,
 * so nothing fires from a single accidental click.
 */
function ConfirmBtn({ label, confirmLabel, tone, onConfirm }: {
  label: string; confirmLabel: string; tone: 'accent' | 'danger'; onConfirm: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!confirming) return
    const cancel = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setConfirming(false) }
    const timer = setTimeout(() => setConfirming(false), 4000)
    window.addEventListener('mousedown', cancel, true)
    return () => { window.removeEventListener('mousedown', cancel, true); clearTimeout(timer) }
  }, [confirming])

  const color = tone === 'danger' ? 'var(--danger)' : 'var(--accent)'
  const soft = tone === 'danger' ? 'var(--danger-soft)' : 'var(--accent-soft)'

  return (
    <div
      ref={ref}
      onClick={e => { e.stopPropagation(); if (confirming) { setConfirming(false); onConfirm() } else setConfirming(true) }}
      title={confirming ? undefined : label}
      style={{ height: 26, padding: '0 11px', borderRadius: 6, display: 'flex', alignItems: 'center', cursor: 'default', fontSize: 11.5, fontWeight: 550, whiteSpace: 'nowrap', color: confirming ? 'var(--accent-contrast)' : color, background: confirming ? color : soft }}
    >{confirming ? confirmLabel : label}</div>
  )
}

function Row({ name, isDefault, onToggleDefault, onOpen, onOpenInNewWindow, onUpdate, onDelete }: {
  name: string; isDefault: boolean; onToggleDefault: () => void
  onOpen: () => void; onOpenInNewWindow: () => void; onUpdate: () => void; onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 8px', borderRadius: 7, background: hover ? 'var(--bg-hover)' : 'transparent' }}
    >
      <div
        onClick={onToggleDefault}
        title={isDefault ? '既定を解除（Ctrl+Nで新規ウィンドウの初期表示に使われます）' : 'Ctrl+Nの既定に設定'}
        style={{ width: 20, height: 20, flex: '0 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'default', fontSize: 13, color: isDefault ? 'var(--warn)' : 'var(--text-faint)' }}
        onMouseEnter={e => { if (!isDefault) e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { if (!isDefault) e.currentTarget.style.color = 'var(--text-faint)' }}
      >{isDefault ? '★' : '☆'}</div>
      <span style={{ width: 16, height: 14, flex: '0 0 16px', borderRadius: 3, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {/* Non-destructive — doesn't touch this window's live state at all, so no confirmation needed. */}
      <div
        onClick={onOpenInNewWindow}
        title="新規ウィンドウで開く（今の状態はそのまま）"
        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', fontSize: 12, color: 'var(--text-faint)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
      >🪟</div>
      <ConfirmBtn label="開く" confirmLabel="本当に開く？（今の状態は失われます）" tone="accent" onConfirm={onOpen} />
      <ConfirmBtn label="更新" confirmLabel="今の状態で上書き？" tone="accent" onConfirm={onUpdate} />
      <ConfirmBtn label="🗑" confirmLabel="削除する？" tone="danger" onConfirm={onDelete} />
    </div>
  )
}
