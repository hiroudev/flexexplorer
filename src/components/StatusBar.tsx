import { useStore, visibleSelection } from '../store/useStore'
import { THEMES } from 'flex-design/themes/presets.js'
import { fmt } from '../utils/fileUtils'

export default function StatusBar() {
  const activePane = useStore(s => s.activePane)
  const panes = useStore(s => s.panes)
  const theme = useStore(s => s.theme)
  const search = useStore(s => s.search)
  const searchMode = useStore(s => s.searchMode)
  const adv = useStore(s => s.adv)

  const p = panes[activePane]
  const tab = p.tabs[p.active]
  const folderSize = tab.files.reduce((a, f) => a + (f.size || 0), 0)
  // What's selected is the number people actually want here; the folder total
  // is kept alongside it rather than replaced.
  // What operations will act on: the selection that's actually on screen.
  const sel = visibleSelection(tab, { search, searchMode, adv })
  const selSize = sel.reduce((a, i) => a + (tab.files[i]?.size || 0), 0)
  const selFolders = sel.filter(i => tab.files[i]?.folder).length

  return (
    <div style={{ height: 26, flex: '0 0 26px', display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px', background: 'var(--bg-titlebar)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
      <span>{tab.files.length} 個の項目</span>
      <span>{fmt(folderSize) || '0 B'}</span>
      {sel.length > 0 && (
        <span style={{ color: 'var(--accent)' }}>
          {sel.length} 個を選択 / {fmt(selSize) || '0 B'}
          {/* Folder sizes aren't counted, so say so rather than under-report. */}
          {selFolders > 0 && `（フォルダ ${selFolders} 個を除く）`}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <span style={{ color: 'var(--accent)' }}>●</span>
      <span>ペイン {activePane + 1}</span>
      <span>{THEMES[theme]?.label ?? theme}</span>
    </div>
  )
}
