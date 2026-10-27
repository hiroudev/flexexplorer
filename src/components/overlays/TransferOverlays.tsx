//! The dialogs that surround a copy/move: a confirmation before a destructive
//! action, the name-collision prompt, the progress bar for a transfer in
//! flight (with the cancel button that used to not exist at all), the
//! question when the window is closed mid-transfer, and the result report.

import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { fmt } from '../../utils/fileUtils'
import { copyText } from '../../fs/bridge'
import type { ConflictChoice } from '../../fs/bridge'
import type { TransferItem } from '../../types'

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

function Btn({ label, onClick, kind = 'normal', autoFocus }: { label: string; onClick: () => void; kind?: 'normal' | 'primary' | 'danger'; autoFocus?: boolean }) {
  const bg = kind === 'primary' ? 'var(--accent)' : kind === 'danger' ? 'var(--danger)' : 'transparent'
  const fg = kind === 'normal' ? 'var(--text)' : 'var(--accent-contrast)'
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      style={{ padding: '7px 15px', borderRadius: 7, cursor: 'default', fontSize: 12.5, fontWeight: 550, fontFamily: 'var(--font)', color: fg, background: bg, border: kind === 'normal' ? '1px solid var(--border-strong)' : '1px solid transparent' }}
    >{label}</button>
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
  const closeGuard = useStore(s => s.closeGuard)
  const answerCloseGuard = useStore(s => s.answerCloseGuard)
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

      {(closeGuard === 'wait' || closeGuard === 'cancel') && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-muted)' }}>
          <span style={{ flex: 1 }}>{closeGuard === 'wait' ? '終わったらウィンドウを閉じます' : '中止してからウィンドウを閉じます…'}</span>
          {closeGuard === 'wait' && (
            <button type="button" onClick={() => answerCloseGuard(null)} style={{ fontSize: 11.5, fontFamily: 'var(--font)', color: 'var(--text)', background: 'transparent', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border-strong)', cursor: 'default' }}>閉じない</button>
          )}
        </div>
      )}
    </div>
  )
}

/** Closing the window mid-transfer. Without this the window (and, for the
 * last one, the whole process) went away part-way through a move. */
export function CloseGuardDialog() {
  const closeGuard = useStore(s => s.closeGuard)
  const transfer = useStore(s => s.transfer)
  const answer = useStore(s => s.answerCloseGuard)
  if (closeGuard === 'saveFailed') {
    return (
      <Backdrop>
        <div role="alertdialog" aria-modal="true" aria-labelledby="close-guard-title" aria-describedby="close-guard-body">
          <Title><span id="close-guard-title">付箋メモを保存できませんでした</span></Title>
          <div id="close-guard-body" style={{ padding: '8px 18px 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            今閉じると、保存できなかった付箋メモの変更は失われます。
            閉じずに戻れば、次に編集したときにもう一度保存を試みます。
          </div>
          <Buttons>
            <Btn label="閉じない" kind="primary" onClick={() => answer(null)} autoFocus />
            <Btn label="保存せずに閉じる" kind="danger" onClick={() => answer('discard')} />
          </Buttons>
        </div>
      </Backdrop>
    )
  }
  if (closeGuard !== 'ask' || !transfer) return null
  const verb = transfer.mode === 'copy' ? 'コピー' : '移動'

  return (
    <Backdrop>
      <div role="alertdialog" aria-modal="true" aria-labelledby="close-guard-title" aria-describedby="close-guard-body">
        <Title><span id="close-guard-title">{verb}の途中です</span></Title>
        <div id="close-guard-body" style={{ padding: '8px 18px 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {transfer.done} / {transfer.total} 件まで済んでいます。今閉じると、残りは{verb}されません。
          {transfer.mode === 'move' && '移動済みのファイルは移動先に、まだのファイルは移動元に残ります。'}
        </div>
        <Buttons>
          <Btn label="閉じない" onClick={() => answer(null)} autoFocus />
          <Btn label="終わったら閉じる" kind="primary" onClick={() => answer('wait')} />
          <Btn label="中止して閉じる" kind="danger" onClick={() => answer('cancel')} />
        </Buttons>
      </div>
    </Backdrop>
  )
}

const RESULT_LABEL: Record<TransferItem['result'], { text: string; color: string }> = {
  failed: { text: '失敗', color: 'var(--danger)' },
  partial: { text: '途中まで', color: 'var(--warn)' },
  notrun: { text: '未実行', color: 'var(--text-muted)' },
  skipped: { text: 'スキップ', color: 'var(--text-muted)' },
  ok: { text: '完了', color: 'var(--good)' },
}
/** The colour goes on a dot, not the text: --warn and --good are too light
 * to read as 12px text on the panel. */
function ResultLabel({ r }: { r: TransferItem['result'] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: RESULT_LABEL[r].color, flex: 'none' }} />
      {RESULT_LABEL[r].text}
    </span>
  )
}
const ORDER: TransferItem['result'][] =['failed', 'partial', 'notrun', 'skipped', 'ok']
const isProblem = (r: TransferItem['result']) => r === 'failed' || r === 'partial' || r === 'notrun'

/** Everything that happened in the last copy/move, item by item. Opens by
 * itself when something failed, otherwise from the toast's 詳細 or the
 * command palette. */
export function TransferReportModal() {
  const modal = useStore(s => s.modal)
  const report = useStore(s => s.transferReport)
  const closeModal = useStore(s => s.closeModal)
  const showToast = useStore(s => s.showToast)
  const [onlyProblems, setOnlyProblems] = useState(true)
  // This stays mounted, so the last report's choice would otherwise stick.
  useEffect(() => setOnlyProblems(true), [report])
  if (modal !== 'transferReport' || !report) return null

  const count = (r: TransferItem['result']) => report.items.filter(i => i.result === r).length
  const anyProblem = report.items.some(i => isProblem(i.result))
  const rows = onlyProblems && anyProblem ? report.items.filter(i => isProblem(i.result)) : report.items
  const verb = report.mode === 'copy' ? 'コピー' : '移動'

  const copyAll = async () => {
    const lines = [
      `${verb}先\t${report.dest}`,
      `日時\t${report.at}`,
      '',
      '結果\t名前\t詳細',
      ...report.items.map(i => `${RESULT_LABEL[i.result].text}\t${i.name}\t${i.detail}`),
      ...(report.linkPaths.length ? ['', `${verb}しなかったリンク`, ...report.linkPaths] : []),
    ]
    showToast(await copyText(lines.join('\n')) ? '結果をコピーしました' : 'クリップボードに書き込めません')
  }

  return (
    <>
      <div onMouseDown={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.32)' }} />
      <div role="dialog" aria-modal="true" aria-labelledby="transfer-report-title" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, width: 'min(620px, calc(100vw - 32px))', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div id="transfer-report-title" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {verb}の結果{report.cancelled && '（中止）'}
          </div>
          <div title={report.dest} style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {report.at}　{verb}先: <span style={{ fontFamily: 'var(--mono)' }}>{report.dest}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, fontSize: 12, color: 'var(--text)' }}>
            {ORDER.filter(r => count(r)).map(r => (
              <span key={r}><ResultLabel r={r} /> {count(r)} 件</span>
            ))}
            {report.links > 0 && <span><span style={{ fontWeight: 650 }}>リンク</span> {report.links} 件は{verb}していません</span>}
          </div>
        </div>

        <div tabIndex={0} aria-label="項目ごとの結果" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
          {rows.map((i, n) => (
            <div key={n} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', gap: 10, padding: '5px 18px', fontSize: 12, lineHeight: 1.5 }}>
              <ResultLabel r={i.result} />
              <span style={{ minWidth: 0 }}>
                <span style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>{i.name}</span>
                {i.detail && <span style={{ display: 'block', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{i.detail}</span>}
              </span>
            </div>
          ))}
          {!rows.length && <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--text-muted)' }}>項目はありません</div>}
          {report.linkPaths.length > 0 && (
            <details style={{ padding: '8px 18px', fontSize: 12, color: 'var(--text)' }}>
              <summary style={{ cursor: 'default' }}>
                {verb}しなかったリンク（{report.links} 件{report.links > report.linkPaths.length ? `、先頭の ${report.linkPaths.length} 件を表示` : ''}）
              </summary>
              <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-muted)' }}>
                {report.linkPaths.map(p => <div key={p} style={{ overflowWrap: 'anywhere' }}>{p}</div>)}
              </div>
            </details>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
          {anyProblem && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
              <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
              問題のあった項目だけ表示
            </label>
          )}
          <div style={{ flex: 1 }} />
          <Btn label="結果をコピー" onClick={() => void copyAll()} />
          <Btn label="閉じる" kind="primary" onClick={closeModal} autoFocus />
        </div>
      </div>
    </>
  )
}
