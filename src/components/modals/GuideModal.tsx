//! ヘルプ > 使いこなしガイド. Content lives in src/guide.ts as markdown and is
//! rendered with `marked`, which the inspector already depends on — a guide is
//! prose, and prose in JSX is only harder to edit.

import { useMemo } from 'react'
import { marked } from 'marked'
import { useStore } from '../../store/useStore'
import { GUIDE_MD } from '../../guide'

export default function GuideModal() {
  const modal = useStore(s => s.modal)
  const closeModal = useStore(s => s.closeModal)
  const html = useMemo(() => marked.parse(GUIDE_MD, { async: false }) as string, [])

  if (modal !== 'guide') return null

  return (
    <>
      <div onClick={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--shadow)' }} />
      <div
        style={{ position: 'fixed', inset: '5vh 50% 5vh 50%', width: 'min(820px, 92vw)', transform: 'translateX(-50%)', left: '50%', right: 'auto', zIndex: 51, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)', overflow: 'hidden', fontFamily: 'var(--font)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', borderBottom: '1px solid var(--border)', flex: '0 0 auto' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>使いこなしガイド</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>エクスプローラーとの違いが出るところだけ</span>
          <div style={{ flex: 1 }} />
          <span
            onClick={closeModal}
            title="閉じる (Esc)"
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', fontSize: 12, color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >✕</span>
        </div>

        <div className="fx-guide" style={{ flex: 1, overflowY: 'auto', padding: '4px 26px 26px' }}>
          <style>{GUIDE_CSS}</style>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </>
  )
}

/** Scoped to .fx-guide so it can't leak into the rest of the app. */
const GUIDE_CSS = `
.fx-guide { color: var(--text); font-size: 13px; line-height: 1.85; }
.fx-guide h2 {
  font-size: 14.5px; font-weight: 700; margin: 26px 0 10px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border);
}
.fx-guide h2:first-child { margin-top: 14px; }
.fx-guide p { margin: 9px 0; }
.fx-guide ul, .fx-guide ol { margin: 9px 0; padding-left: 22px; }
.fx-guide li { margin: 4px 0; }
.fx-guide strong { font-weight: 700; color: var(--text); }
.fx-guide code {
  font-family: var(--mono); font-size: 11.5px;
  background: var(--bg-sunken); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 5px;
}
.fx-guide pre {
  background: var(--bg-page); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px 14px; overflow-x: auto; margin: 10px 0;
}
.fx-guide pre code { background: none; border: none; padding: 0; font-size: 11.5px; line-height: 1.7; }
.fx-guide blockquote {
  margin: 12px 0; padding: 9px 14px;
  border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0;
  background: var(--accent-soft); color: var(--text-muted); font-size: 12.5px;
}
.fx-guide blockquote p { margin: 0; }
.fx-guide table { border-collapse: collapse; margin: 10px 0; font-size: 12.5px; }
.fx-guide th, .fx-guide td { border: 1px solid var(--border); padding: 5px 12px; text-align: left; }
.fx-guide th { background: var(--bg-sunken); font-weight: 650; }
`
