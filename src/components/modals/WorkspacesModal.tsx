import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { isComposing } from '../../keys'
import { cleanWorkspaceName } from '../../utils/bundle'

/** A workspace file picked with 読み込む, waiting on what to do about a
 * workspace of the same name. */
type Incoming = { name: string; data: object; exists: boolean; altName: string }

export default function WorkspacesModal() {
  const modal = useStore(s => s.modal)
  const workspaces = useStore(s => s.workspaces)
  const info = useStore(s => s.workspaceInfo)
  const dir = useStore(s => s.workspaceDir)
  const closeModal = useStore(s => s.closeModal)
  const saveWorkspaceAs = useStore(s => s.saveWorkspaceAs)
  const loadNamedWorkspace = useStore(s => s.loadNamedWorkspace)
  const openWorkspaceInNewWindow = useStore(s => s.openWorkspaceInNewWindow)
  const deleteNamedWorkspace = useStore(s => s.deleteNamedWorkspace)
  const defaultWorkspace = useStore(s => s.defaultWorkspace)
  const setDefaultWorkspace = useStore(s => s.setDefaultWorkspace)
  const exportWorkspaceFile = useStore(s => s.exportWorkspaceFile)
  const exportAllWorkspaces = useStore(s => s.exportAllWorkspaces)
  const refreshWorkspaces = useStore(s => s.refreshWorkspaces)
  const openWorkspaceFolder = useStore(s => s.openWorkspaceFolder)
  const readWorkspaceFile = useStore(s => s.readWorkspaceFile)
  const saveImportedWorkspace = useStore(s => s.saveImportedWorkspace)
  const [name, setName] = useState('')
  const [pendingOverwrite, setPendingOverwrite] = useState(false)
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  /** Files chosen together, still to go after the one being asked about. */
  const [queue, setQueue] = useState<File[]>([])
  const [exportingAll, setExportingAll] = useState(false)
  /** A batch is being read and saved (or waits on a confirm): a second one
   * picked meanwhile would share `incoming`/`queue` and lose files. */
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (modal !== 'workspaces') return null

  const nm = name.trim()
  // The file the save really writes (save_workspace in workspaces.rs): a
  // listed name as it is, else the name made safe — "CON" goes to "_CON",
  // and an existing one in any letter case is replaced.
  const target = !nm ? '' : workspaces.includes(nm) ? nm : (cleanWorkspaceName(nm) || 'workspace')
  const exists = !!target && workspaces.some(w => w.toLowerCase() === target.toLowerCase())

  const save = () => {
    if (!nm) return
    if (exists && !pendingOverwrite) { setPendingOverwrite(true); return }
    void saveWorkspaceAs(nm)
    setName('')
    setPendingOverwrite(false)
  }

  // One file after another, so a name taken by an earlier one in the same
  // batch is asked about too; a clash stops here until it is answered.
  const pickFiles = async (files: File[]) => {
    setImporting(true)
    for (let i = 0; i < files.length; i++) {
      const r = await readWorkspaceFile(files[i], files.length === 1)
      if (!r) continue
      // Stays `importing` until the question is answered.
      if (r.exists) { setIncoming(r); setQueue(files.slice(i + 1)); return }
      await saveImportedWorkspace(r.name, r.data, false)
    }
    setQueue([])
    setImporting(false)
    document.getElementById('ws-import')?.focus()
  }
  const answer = async (save: { as: string; overwrite: boolean } | null) => {
    const r = incoming!
    setIncoming(null)
    if (save) await saveImportedWorkspace(save.as, r.data, save.overwrite)
    await pickFiles(queue)
  }

  return (
    <>
      <div onMouseDown={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.32)' }} />
      <div id="workspaces-modal" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, width: 'min(520px, calc(100vw - 32px))', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
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
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>名前を付けて保存</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              aria-label="保存するワークスペースの名前"
              onChange={e => { setName(e.target.value); setPendingOverwrite(false) }}
              onKeyDown={e => { if (isComposing(e)) return; if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(''); setPendingOverwrite(false) } }}
              onBlur={() => setPendingOverwrite(false)}
              placeholder="現在のレイアウト名を入力…"
              autoFocus
              style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', borderRadius: 7, border: `1px solid ${exists ? 'var(--warn)' : 'var(--border-strong)'}`, background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12.5, outline: 'none' }}
            />
            <div
              onClick={save}
              style={{ height: 32, padding: '0 14px', borderRadius: 7, display: 'flex', alignItems: 'center', cursor: 'default', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: !nm ? 'var(--text-muted)' : pendingOverwrite ? 'var(--accent-contrast)' : exists ? 'var(--text)' : 'var(--accent-contrast)', border: exists && !pendingOverwrite ? '1px solid var(--warn)' : '1px solid transparent', boxSizing: 'border-box', background: !nm ? 'var(--bg-active)' : pendingOverwrite ? 'var(--warn)' : exists ? 'var(--warn-soft)' : 'var(--accent)' }}
            >{pendingOverwrite ? 'もう一度クリックで上書き' : exists ? '同名を上書き保存' : '保存'}</div>
          </div>
          {target && target !== nm && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, overflowWrap: 'anywhere' }}>ファイル名に使えない形のため、「{target}」として保存します。</div>
          )}
          {exists && !pendingOverwrite && (
            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 6, overflowWrap: 'anywhere' }}><span aria-hidden="true" style={{ color: 'var(--warn)' }}>⚠ </span>「{target}」は既に存在します。保存すると内容が置き換わります。</div>
          )}
        </div>

        {/* where the files are: one <name>.json each, which another PC can use as it is */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <div>
            保存先: <code style={{ fontFamily: 'var(--mono)', color: 'var(--text)', overflowWrap: 'anywhere' }}>{dir || '…'}</code>
          </div>
          <div>1件が <code style={{ fontFamily: 'var(--mono)' }}>名前.json</code> の1ファイルです。別の PC のこのフォルダに置くと、そのまま一覧に出ます。</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <Btn onClick={openWorkspaceFolder} title="保存先のフォルダをエクスプローラーで開く">フォルダを開く</Btn>
            <Btn onClick={() => void refreshWorkspaces()} title="フォルダに置いたファイルを一覧に出す">一覧を更新</Btn>
            <Btn id="ws-import" onClick={() => fileRef.current?.click()} disabled={importing} title="ワークスペースのファイル（.json、いくつでも）を選んで保存先に取り込む">読み込む…</Btn>
            <Btn
              onClick={() => { setExportingAll(true); void exportAllWorkspaces().finally(() => setExportingAll(false)) }}
              disabled={exportingAll || workspaces.length === 0}
              title="すべてを 名前.json ずつ、「ダウンロード」の新しいフォルダに書き出す"
            >{exportingAll ? '書き出し中…' : 'すべて書き出す'}</Btn>
            <input ref={fileRef} type="file" multiple accept=".json,application/json" aria-label="読み込むワークスペースのファイル" style={{ display: 'none' }}
              onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void pickFiles(fs) }} />
          </div>
          {incoming && (
            <div role="alert" style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--warn-soft)', border: '1px solid var(--warn)', color: 'var(--text)' }}>
              <div style={{ overflowWrap: 'anywhere' }}>「{incoming.name}」は既にあります。どうしますか？{queue.length > 0 && `（このあと ${queue.length}件）`}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                <Btn onClick={() => void answer({ as: incoming.name, overwrite: true })} tone="warn">上書きする</Btn>
                <Btn onClick={() => void answer({ as: incoming.altName, overwrite: false })}>別名（{incoming.altName}）で保存</Btn>
                <Btn onClick={() => void answer(null)}>{queue.length ? 'これは取り込まない' : 'やめる'}</Btn>
                {queue.length > 0 && <Btn onClick={() => { setIncoming(null); setQueue([]); setImporting(false) }}>残りもやめる</Btn>}
              </div>
            </div>
          )}
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {workspaces.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              保存されたワークスペースはありません
            </div>
          ) : (
            workspaces.map(ws => (
              <Row
                key={ws}
                name={ws}
                info={info[ws]}
                isDefault={ws === defaultWorkspace}
                onToggleDefault={() => setDefaultWorkspace(ws === defaultWorkspace ? null : ws)}
                onOpen={() => loadNamedWorkspace(ws)}
                onOpenInNewWindow={() => openWorkspaceInNewWindow(ws)}
                onUpdate={() => saveWorkspaceAs(ws)}
                onDelete={() => deleteNamedWorkspace(ws)}
                onExport={() => void exportWorkspaceFile(ws)}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function Btn({ id, onClick, title, tone, disabled, children }: { id?: string; onClick: () => void; title?: string; tone?: 'warn'; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{ height: 26, padding: '0 10px', borderRadius: 6, border: `1px solid ${tone === 'warn' ? 'var(--warn)' : 'var(--border-strong)'}`, cursor: 'default', fontSize: 11.5, fontFamily: 'var(--font)', whiteSpace: 'nowrap', color: 'var(--text)', background: tone === 'warn' ? 'var(--warn-soft)' : 'var(--bg-page)', opacity: disabled ? 0.5 : 1 }}
    >{children}</button>
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
function ConfirmBtn({ label, confirmLabel, tone, onConfirm, disabled }: {
  label: string; confirmLabel: string; tone: 'accent' | 'danger'; onConfirm: () => void; disabled?: boolean
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
  // --accent itself is too light to read on --accent-soft (3.8:1).
  const text = tone === 'danger' ? 'var(--danger)' : 'var(--accent-hover)'
  const soft = tone === 'danger' ? 'var(--danger-soft)' : 'var(--accent-soft)'

  return (
    <div
      ref={ref}
      aria-disabled={disabled || undefined}
      onClick={e => { e.stopPropagation(); if (disabled) return; if (confirming) { setConfirming(false); onConfirm() } else setConfirming(true) }}
      title={confirming ? undefined : label}
      style={{ height: 26, padding: '0 11px', borderRadius: 6, display: 'flex', alignItems: 'center', cursor: 'default', fontSize: 11.5, fontWeight: 550, whiteSpace: 'nowrap', color: confirming ? 'var(--accent-contrast)' : text, background: confirming ? color : soft, opacity: disabled ? 0.45 : 1 }}
    >{confirming ? confirmLabel : label}</div>
  )
}

function Row({ name, info, isDefault, onToggleDefault, onOpen, onOpenInNewWindow, onUpdate, onDelete, onExport }: {
  name: string; info?: { broken?: string; unc: string[]; missingDrives: string[] }; isDefault: boolean; onToggleDefault: () => void
  onOpen: () => void; onOpenInNewWindow: () => void; onUpdate: () => void; onDelete: () => void; onExport: () => void
}) {
  const [hover, setHover] = useState(false)
  const broken = info?.broken
  const notes = broken ? [] : [
    ...(info?.unc.length ? [`共有フォルダ ${info.unc.join(' ')}`] : []),
    ...(info?.missingDrives.length ? [`この PC に無いドライブ ${info.missingDrives.join(' ')}`] : []),
  ]
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '4px 8px', borderRadius: 7, background: hover ? 'var(--bg-hover)' : 'transparent' }}
    >
      <div
        onClick={broken ? undefined : onToggleDefault}
        title={broken ? undefined : isDefault ? '既定を解除（Ctrl+Nで新規ウィンドウの初期表示に使われます）' : 'Ctrl+Nの既定に設定'}
        style={{ width: 20, height: 20, flex: '0 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'default', fontSize: 13, color: isDefault ? 'var(--warn)' : 'var(--text-faint)', visibility: broken && !isDefault ? 'hidden' : undefined }}
        onMouseEnter={e => { if (!isDefault) e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { if (!isDefault) e.currentTarget.style.color = 'var(--text-faint)' }}
      >{isDefault ? '★' : '☆'}</div>
      <span style={{ width: 16, height: 14, flex: '0 0 16px', borderRadius: 3, background: broken ? 'var(--danger-soft)' : 'var(--accent-soft)', border: `1px solid ${broken ? 'var(--danger)' : 'var(--accent)'}` }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
        {broken && <span style={{ display: 'block', fontSize: 11, color: 'var(--danger)', overflowWrap: 'anywhere' }}>開けません: {broken}</span>}
        {notes.length > 0 && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>⚠ {notes.join('、')}</span>}
      </span>
      {/* Non-destructive — doesn't touch this window's live state at all, so no confirmation needed. */}
      {!broken && (
        <div
          onClick={onOpenInNewWindow}
          title="新規ウィンドウで開く（今の状態はそのまま）"
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', fontSize: 12, color: 'var(--text-faint)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
        >🪟</div>
      )}
      {/* Also non-destructive: writes a copy to the Downloads folder. */}
      {!broken && (
        <button
          type="button"
          onClick={onExport}
          title={`「${name}.json」を「ダウンロード」フォルダに書き出す（別の PC の保存先にそのまま置けます）`}
          style={{ height: 26, padding: '0 9px', borderRadius: 6, border: 'none', cursor: 'default', fontSize: 11.5, fontFamily: 'var(--font)', whiteSpace: 'nowrap', color: 'var(--text-muted)', background: 'transparent' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
        >書き出す</button>
      )}
      <ConfirmBtn label="開く" confirmLabel="本当に開く？（今の状態は失われます）" tone="accent" onConfirm={onOpen} disabled={!!broken} />
      <ConfirmBtn label="更新" confirmLabel="今の状態で上書き？" tone="accent" onConfirm={onUpdate} />
      <ConfirmBtn label="🗑" confirmLabel="削除する？" tone="danger" onConfirm={onDelete} />
    </div>
  )
}
