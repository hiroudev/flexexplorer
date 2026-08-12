import { useStore } from '../store/useStore'

export default function Toast() {
  const toast = useStore(s => s.toast)
  const undo = useStore(s => s.undo)
  const doUndo = useStore(s => s.doUndo)

  if (!toast) return null

  return (
    <div style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--text)', color: 'var(--bg-panel)', fontSize: 12.5, padding: '10px 16px', borderRadius: 8, boxShadow: '0 10px 30px var(--shadow)', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
      <span>{toast}</span>
      {undo && (
        <span
          onClick={doUndo}
          style={{ fontWeight: 650, color: 'var(--bg-panel)', background: 'rgba(255,255,255,.16)', padding: '3px 10px', borderRadius: 5, cursor: 'default' }}
        >↩ 元に戻す</span>
      )}
    </div>
  )
}
