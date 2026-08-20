//! The three dialogs that surround a copy/move: a confirmation before a
//! destructive action, the name-collision prompt, and the progress bar for a
//! transfer in flight (with the cancel button that used to not exist at all).

import { useStore } from '../../store/useStore'
import { fmt } from '../../utils/fileUtils'
import type { ConflictChoice } from '../../fs/bridge'

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--shadow)' }}>
      <div style={{ minWidth: 380, maxWidth: 560, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 20px 60px var(--shadow)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '14px 18px 0', fontSize: 13.5, fontWeight: 650, color: 'var(--text)' }}>{children}</div>
}

function Buttons({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--border)', marginTop: 14 }}>{children}</div>
}

function Btn({ label, onClick, kind = 'normal' }: { label: string; onClick: () => void; kind?: 'normal' | 'primary' | 'danger' }) {
  const bg = kind === 'primary' ? 'var(--accent)' : kind === 'danger' ? 'var(--danger)' : 'transparent'
  const fg = kind === 'normal' ? 'var(--text)' : 'var(--accent-contrast)'
  return (
    <div
      onClick={onClick}
      style={{ padding: '7px 15px', borderRadius: 7, cursor: 'default', fontSize: 12.5, fontWeight: 550, color: fg, background: bg, border: kind === 'normal' ? '1px solid var(--border-strong)' : 'none' }}
    >{label}</div>
  )
}

/** 設定 > デフォルト動作 > 削除前に確認 — shown before anything goes to the bin. */
export function ConfirmDialog() {
  const confirm = useStore(s => s.confirm)
  const closeConfirm = useStore(s => s.closeConfirm)
  const acceptConfirm = useStore(s => s.acceptConfirm)
  if (!confirm) return null

  return (
    <Backdrop>
      <Title>{confirm.title}</Title>
      <div style={{ padding: '8px 18px 0', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', lineHeight: 1.7 }}>
        {confirm.body}
      </div>
      <Buttons>
        <Btn label="キャンセル" onClick={closeConfirm} />
        <Btn label={confirm.okLabel} kind="danger" onClick={() => void acceptConfirm()} />
      </Buttons>
    </Backdrop>
  )
}

/** Name collisions. Previously a colliding paste silently became "名前 (2)". */
export function ConflictDialog() {
  const conflict = useStore(s => s.conflict)
  const resolveConflict = useStore(s => s.resolveConflict)
  if (!conflict) return null

  const pick = (c: ConflictChoice) => void resolveConflict(c)
  const verb = conflict.mode === 'copy' ? 'コピー' : '移動'

  return (
    <Backdrop>
      <Title>同じ名前の項目が {conflict.names.length} 件あります</Title>
      <div style={{ padding: '8px 18px 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        {verb}先にすでに存在します。どうしますか？
        <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text)', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
          {conflict.names.slice(0, 30).map(n => <div key={n}>{n}</div>)}
          {conflict.names.length > 30 && <div style={{ color: 'var(--text-faint)' }}>… 他 {conflict.names.length - 30} 件</div>}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)' }}>
          選んだ動作は、この {conflict.names.length} 件すべてに適用されます。
        </div>
      </div>
      <Buttons>
        <Btn label="キャンセル" onClick={() => void resolveConflict(null)} />
        <Btn label="スキップ" onClick={() => pick('skip')} />
        <Btn label="両方残す" onClick={() => pick('keepboth')} />
        <Btn label="上書き" kind="danger" onClick={() => pick('overwrite')} />
      </Buttons>
    </Backdrop>
  )
}

/** Progress for a running transfer. Appears bottom-right rather than as a
 * modal, so the rest of the window stays usable while a big copy runs. */
export function TransferProgressBar() {
  const transfer = useStore(s => s.transfer)
  const cancelTransfer = useStore(s => s.cancelTransfer)
  if (!transfer) return null

  const pct = transfer.bytesTotal > 0
    ? Math.min(100, Math.round((transfer.bytesDone / transfer.bytesTotal) * 100))
    : transfer.total > 0 ? Math.min(100, Math.round((transfer.done / transfer.total) * 100)) : 0

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 40, zIndex: 55, width: 330, padding: '12px 14px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 40px var(--shadow)', fontFamily: 'var(--font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
          {transfer.mode === 'copy' ? 'コピー中' : '移動中'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {transfer.done} / {transfer.total} 件
        </span>
        <div style={{ flex: 1 }} />
        <span
          onClick={cancelTransfer}
          title="中止"
          style={{ fontSize: 11.5, color: 'var(--danger)', cursor: 'default', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border-strong)' }}
        >中止</span>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-sunken)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .12s linear' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 7, fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{transfer.current}</span>
        <span>{fmt(transfer.bytesDone)} / {fmt(transfer.bytesTotal)}</span>
      </div>
    </div>
  )
}
