import React, { useEffect, useState } from 'react'
import { marked } from 'marked'
import { useStore } from '../store/useStore'
import { iconOf, previewText, fmt } from '../utils/fileUtils'
import {
  isTauri, isRealPath, readTextPreview, readXlsxPreview, openPath,
  shellIcon, peekIcon, assetUrl, joinPath, splitPath,
} from '../fs/bridge'
import type { FileEntry, PaneTab } from '../types'

const KIND_MAP: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript JSX', js: 'JavaScript', json: 'JSON', md: 'Markdown',
  txt: 'テキスト', py: 'Python', docx: 'Word 文書', xlsx: 'Excel ブック', xls: 'Excel ブック',
  pptx: 'PowerPoint', pdf: 'PDF 文書', png: 'PNG 画像', jpg: 'JPEG 画像', jpeg: 'JPEG 画像',
  gif: 'GIF 画像', webp: 'WebP 画像', html: 'HTML', css: 'CSS', csv: 'CSV',
}

type PreviewKind = 'folder' | 'image' | 'pdf' | 'markdown' | 'sheet' | 'text' | 'none'

function previewKind(file: FileEntry | undefined): PreviewKind {
  if (!file) return 'none'
  if (file.folder) return 'folder'
  switch (file.pv) {
    case 'image': return 'image'
    case 'pdf': return 'pdf'
    case 'markdown': return 'markdown'
    case 'sheet': return 'sheet'
    case 'text': case 'json': case 'memo': case 'readme': return 'text'
    default: return 'none'
  }
}

function metaOf(file: FileEntry | undefined, tab: PaneTab) {
  if (!file) return { name: '—', meta: '', path: '', iconColor: 'var(--text-faint)', iconSoft: 'transparent', iconLabel: '' }
  const ic = iconOf(file)
  const path = tab.path.join(' \\ ') + ' \\ ' + file.name
  const kind = file.folder ? 'フォルダー' : (KIND_MAP[(file.ext || '').toLowerCase()] || ((file.ext || 'ファイル').toUpperCase() + ' ファイル'))
  const meta = file.folder ? (kind + (file.m ? ' · ' + file.m : '')) : (kind + ' · ' + fmt(file.size) + (file.m ? ' · ' + file.m : ''))
  return { name: file.name, meta, path, iconColor: ic.color, iconSoft: ic.soft, iconLabel: file.folder ? 'DIR' : ic.label }
}

export default function Inspector() {
  const inspectorOpen = useStore(s => s.inspectorOpen)
  const inspectorW = useStore(s => s.inspectorW)
  const anim = useStore(s => s.opt.anim)
  const toggleInspector = useStore(s => s.toggleInspector)
  const startInspectorDrag = useStore(s => s.startInspectorDrag)
  const showToast = useStore(s => s.showToast)
  const activePane = useStore(s => s.activePane)
  const panes = useStore(s => s.panes)

  const p = panes[activePane]
  const tab = p.tabs[p.active]
  const file = tab.files[tab.focus] || tab.files[0]
  const m = metaOf(file, tab)
  const kind = previewKind(file)

  const realPath = isTauri && (isRealPath(tab.path) || !!file?.abs)
  const segs = file ? (file.abs ? splitPath(file.abs) : [...tab.path, file.name]) : []
  const abs = segs.length ? joinPath(segs) : ''

  // Load preview content (text/markdown/sheet) or asset URL (image/pdf).
  const [text, setText] = useState('')
  const [asset, setAsset] = useState('')
  useEffect(() => {
    setText(''); setAsset('')
    if (!file || file.folder) return
    if (!realPath) { const t = previewText(file); if (t) setText(t); return }
    let cancelled = false
    if (kind === 'image' || kind === 'pdf') {
      assetUrl(abs).then(u => { if (!cancelled) setAsset(u) })
    } else if (kind === 'sheet') {
      readXlsxPreview(segs).then(t => { if (!cancelled) setText(t) }).catch(() => { if (!cancelled) setText('（プレビューを読み込めませんでした）') })
    } else if (kind === 'text' || kind === 'markdown') {
      readTextPreview(segs).then(t => { if (!cancelled) setText(t) }).catch(() => { if (!cancelled) setText('') })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abs, kind, realPath])

  // Native shell icon (large) for the header.
  const [iconUrl, setIconUrl] = useState<string | null>(file ? peekIcon(file.name, !!file.folder, true) : null)
  useEffect(() => {
    if (!file) { setIconUrl(null); return }
    const cached = peekIcon(file.name, !!file.folder, true)
    if (cached) { setIconUrl(cached); return }
    let cancelled = false
    shellIcon(file.name, !!file.folder, true).then(u => { if (!cancelled && u) setIconUrl(u) })
    return () => { cancelled = true }
  }, [file?.name, file?.folder])

  const openWithDefault = () => {
    if (realPath && file) openPath(segs).catch(err => showToast('開けません: ' + String(err)))
    else showToast('既定のアプリで開く: ' + m.name)
  }

  const mdHtml = kind === 'markdown' && text ? (marked.parse(text, { async: false }) as string) : ''

  return (
    <div style={{ position: 'relative', flex: `0 0 ${inspectorOpen ? inspectorW : 0}px`, width: inspectorOpen ? inspectorW : 0, transition: anim === 'off' ? 'none' : 'flex-basis .2s cubic-bezier(.4,0,.2,1), width .2s cubic-bezier(.4,0,.2,1)', overflow: 'hidden' }}>
      <InspectorResizeHandle onMouseDown={e => { e.preventDefault(); startInspectorDrag(e.clientX) }} />
      <div style={{ width: inspectorW, minWidth: 300, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, flex: '0 0 34px', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inspector</span>
          <span
            onClick={toggleInspector}
            title="Space で開閉"
            style={{ fontSize: 11, color: 'var(--text-faint)', cursor: 'default', padding: '2px 6px', borderRadius: 4 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
          >Space ✕</span>
        </div>

        {/* content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 14 }}>
            {iconUrl
              ? <img src={iconUrl} alt="" draggable={false} style={{ width: 34, height: 34, flex: '0 0 34px', objectFit: 'contain' }} />
              : <span style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 7, background: m.iconSoft, border: `1px solid ${m.iconColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: m.iconColor }}>{m.iconLabel}</span>}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.35, wordBreak: 'break-word' }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--mono)' }}>{m.meta}</div>
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)', wordBreak: 'break-all', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 9px', marginBottom: 14 }}>{m.path}</div>

          {kind === 'folder' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>このフォルダーを開くには Enter またはダブルクリック</div>
          )}

          {kind === 'image' && (
            asset
              ? <div style={{ borderRadius: 8, border: '1px solid var(--border)', backgroundImage: 'repeating-linear-gradient(45deg,var(--bg-page),var(--bg-page) 9px,var(--bg-sunken) 9px,var(--bg-sunken) 18px)', padding: 8, display: 'flex', justifyContent: 'center' }}>
                  <img src={asset} alt={m.name} style={{ maxWidth: '100%', maxHeight: 340, objectFit: 'contain', borderRadius: 4 }} />
                </div>
              : <PreviewLoading />
          )}

          {kind === 'pdf' && (
            asset
              ? <iframe title={m.name} src={asset} style={{ width: '100%', height: 420, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
              : <PreviewLoading />
          )}

          {kind === 'markdown' && (
            mdHtml
              ? <div
                  style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--text)', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', maxHeight: 420, overflow: 'auto', wordBreak: 'break-word' }}
                  className="md-preview"
                  dangerouslySetInnerHTML={{ __html: mdHtml }}
                />
              : <PreviewLoading />
          )}

          {(kind === 'text' || kind === 'sheet') && (
            <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.65, color: 'var(--text)', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, whiteSpace: 'pre', overflow: 'auto', maxHeight: 420 }}>{text || ' '}</pre>
          )}

          {kind === 'none' && (
            <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 8, padding: '26px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 12, marginBottom: 12 }}>この形式はインラインプレビューに非対応です</div>
              <div
                onClick={openWithDefault}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 550, color: 'var(--accent-contrast)', background: 'var(--accent)', padding: '7px 14px', borderRadius: 7, cursor: 'default' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
              >既定のアプリで開く</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewLoading() {
  return <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-faint)' }}>読み込み中…</div>
}

function InspectorResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = React.useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'absolute', top: 0, left: -2, width: 6, height: '100%', cursor: 'col-resize', zIndex: 5, background: hover ? 'linear-gradient(90deg,transparent,var(--accent),transparent)' : 'transparent' }}
    />
  )
}
