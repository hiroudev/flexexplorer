import { useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'

/**
 * Popped by the global quick-open hotkey (default Ctrl+Alt+O, see
 * useStore's registerQuickOpenHotkey) — works even when FlexExplorer doesn't
 * have focus. A single path input; submitting opens it in a fresh pane
 * inside the "tmp" layout group, same as a BlueWind/Win+R relaunch.
 */
export default function QuickOpenOverlay() {
  const open = useStore(s => s.quickOpen.open)
  const closeQuickOpen = useStore(s => s.closeQuickOpen)
  const submitQuickOpen = useStore(s => s.submitQuickOpen)
  const hotkey = useStore(s => s.quickOpenHotkey)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  if (!open) return null

  return (
    <>
      <div onMouseDown={closeQuickOpen} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.28)' }} />
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%,-50%)',
          zIndex: 71, width: 560, maxWidth: '90vw',
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)',
          fontFamily: 'var(--font)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
          <span style={{ color: 'var(--accent)', fontSize: 15 }}>⚡</span>
          <input
            ref={inputRef}
            defaultValue=""
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) submitQuickOpen(v) }
              if (e.key === 'Escape') closeQuickOpen()
            }}
            placeholder="開くフォルダのパスを入力または貼り付け…"
            spellCheck={false}
            autoComplete="off"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-faint)' }}>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Enter</kbd> tmpグループの新規ペインで開く</span>
          <span><kbd style={{ fontFamily: 'var(--mono)' }}>Esc</kbd> キャンセル</span>
          <span style={{ marginLeft: 'auto' }}>{hotkey} で呼び出し</span>
        </div>
      </div>
    </>
  )
}
