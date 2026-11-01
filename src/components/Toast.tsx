import { useStore } from '../store/useStore'

export default function Toast() {
  const toast = useStore(s => s.toast)
  const undo = useStore(s => s.undo)
  const doUndo = useStore(s => s.doUndo)

  // The live region stays mounted so screen readers hear each new message.
  return (
    <div role="status" aria-live="polite">
      {toast && (
        <div style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--text)', color: 'var(--bg-panel)', fontSize: 12.5, padding: '10px 16px', borderRadius: 8, boxShadow: '0 10px 30px var(--shadow)', fontFamily: 'var(--font)', width: 'max-content', maxWidth: 'min(720px, calc(100vw - 32px))', overflowWrap: 'anywhere' }}>
          <span>{toast}</span>
          {undo && (
            <button
              type="button"
              onClick={doUndo}
              style={{ fontWeight: 650, fontSize: 12.5, fontFamily: 'var(--font)', color: 'var(--bg-panel)', background: 'rgba(255,255,255,.16)', padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'default', whiteSpace: 'nowrap', flex: '0 0 auto' }}
            >{undo.kind === 'group' ? '↩ 元に戻す' : undo.label}</button>
          )}
        </div>
      )}
    </div>
  )
}
