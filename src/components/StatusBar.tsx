import { useStore } from '../store/useStore'
import { THEMES } from 'flex-design/themes/presets.js'
import { fmt } from '../utils/fileUtils'

export default function StatusBar() {
  const activePane = useStore(s => s.activePane)
  const panes = useStore(s => s.panes)
  const theme = useStore(s => s.theme)

  const p = panes[activePane]
  const tab = p.tabs[p.active]
  const totalSize = tab.files.reduce((a, f) => a + (f.size || 0), 0)

  return (
    <div style={{ height: 26, flex: '0 0 26px', display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px', background: 'var(--bg-titlebar)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
      <span>{tab.files.length} 個の項目</span>
      <span>{tab.sel.length} 個を選択</span>
      <span>{fmt(totalSize) || '0 B'}</span>
      <div style={{ flex: 1 }} />
      <span style={{ color: 'var(--accent)' }}>●</span>
      <span>ペイン {activePane + 1}</span>
      <span>{THEMES[theme]?.label ?? theme}</span>
    </div>
  )
}
