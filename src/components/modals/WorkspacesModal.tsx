import { useState } from 'react'
import { useStore } from '../../store/useStore'

export default function WorkspacesModal() {
  const modal = useStore(s => s.modal)
  const workspaces = useStore(s => s.workspaces)
  const closeModal = useStore(s => s.closeModal)
  const saveWorkspaceAs = useStore(s => s.saveWorkspaceAs)
  const loadNamedWorkspace = useStore(s => s.loadNamedWorkspace)
  const deleteNamedWorkspace = useStore(s => s.deleteNamedWorkspace)
  const [name, setName] = useState('')

  if (modal !== 'workspaces') return null

  const save = () => { const n = name.trim(); if (n) { void saveWorkspaceAs(n); setName('') } }

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

        {/* save row */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            placeholder="現在のレイアウト名を入力…"
            autoFocus
            style={{ flex: 1, height: 32, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12.5, outline: 'none' }}
          />
          <div
            onClick={save}
            style={{ height: 32, padding: '0 14px', borderRadius: 7, display: 'flex', alignItems: 'center', cursor: 'default', fontSize: 12.5, fontWeight: 600, color: name.trim() ? 'var(--accent-contrast)' : 'var(--text-faint)', background: name.trim() ? 'var(--accent)' : 'var(--bg-active)' }}
          >保存</div>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {workspaces.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
              保存されたワークスペースはありません
            </div>
          ) : (
            workspaces.map(ws => (
              <Row key={ws} name={ws} onOpen={() => loadNamedWorkspace(ws)} onDelete={() => deleteNamedWorkspace(ws)} />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function Row({ name, onOpen, onDelete }: { name: string; onOpen: () => void; onDelete: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 8px', borderRadius: 7, background: hover ? 'var(--bg-hover)' : 'transparent' }}
    >
      <span style={{ width: 16, height: 14, flex: '0 0 16px', borderRadius: 3, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <div
        onClick={onOpen}
        style={{ height: 26, padding: '0 11px', borderRadius: 6, display: 'flex', alignItems: 'center', cursor: 'default', fontSize: 11.5, fontWeight: 550, color: 'var(--accent)', background: 'var(--accent-soft)' }}
      >開く</div>
      <div
        onClick={onDelete}
        title="削除"
        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', fontSize: 12, color: 'var(--text-faint)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
      >🗑</div>
    </div>
  )
}
