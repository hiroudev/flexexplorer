import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import type { LayoutGroup } from '../types'

/** One group tab: click to switch, double-click to rename inline, ✕ to close. */
function GroupTab({ group, active, closable, onSwitch, onClose, onRename }: {
  group: LayoutGroup; active: boolean; closable: boolean
  onSwitch: () => void; onClose: () => void; onRename: (name: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select() } }, [editing])

  const commit = () => {
    setEditing(false)
    const nm = val.trim()
    if (nm && nm !== group.name) onRename(nm)
    else setVal(group.name)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setVal(group.name); setEditing(false) }
        }}
        onBlur={commit}
        style={{ width: 100, height: 26, border: '1px solid var(--accent)', outline: 'none', borderRadius: 6, background: 'var(--bg-page)', color: 'var(--text)', fontSize: 12, padding: '0 8px' }}
      />
    )
  }

  return (
    <div
      onClick={onSwitch}
      onDoubleClick={() => { setVal(group.name); setEditing(true) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={group.name + '（ダブルクリックで名前変更）'}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 5px 0 11px', borderRadius: 7, cursor: 'default',
        maxWidth: 168, flex: '0 1 auto', minWidth: 0,
        color: active ? 'var(--accent-contrast)' : 'var(--text-muted)',
        background: active ? 'var(--accent)' : hover ? 'var(--bg-hover)' : 'transparent',
        border: active ? 'none' : '1px solid var(--border-strong)',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: active ? 650 : 500 }}>{group.name}</span>
      {closable && (
        <span
          onClick={e => { e.stopPropagation(); onClose() }}
          style={{ width: 15, height: 15, flex: '0 0 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 10, opacity: hover || active ? 0.85 : 0 }}
          onMouseEnter={e => (e.currentTarget.style.background = active ? 'rgba(0,0,0,.18)' : 'var(--bg-active)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >✕</span>
      )}
    </div>
  )
}

export default function LayoutTabs() {
  const layouts = useStore(s => s.layouts)
  const activeLayout = useStore(s => s.activeLayout)
  const switchLayoutGroup = useStore(s => s.switchLayoutGroup)
  const addLayoutGroup = useStore(s => s.addLayoutGroup)
  const closeLayoutGroup = useStore(s => s.closeLayoutGroup)
  const renameLayoutGroup = useStore(s => s.renameLayoutGroup)
  const [addHover, setAddHover] = useState(false)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {layouts.map((g, i) => (
        <GroupTab
          key={g.id}
          group={g}
          active={i === activeLayout}
          closable={layouts.length > 1}
          onSwitch={() => switchLayoutGroup(i)}
          onClose={() => closeLayoutGroup(i)}
          onRename={name => renameLayoutGroup(i, name)}
        />
      ))}
      <div
        onClick={addLayoutGroup}
        onMouseEnter={() => setAddHover(true)}
        onMouseLeave={() => setAddHover(false)}
        title="新しいグループ（ペイン配置を束ねるタブ）"
        style={{ width: 26, height: 26, flex: '0 0 26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', color: addHover ? 'var(--text)' : 'var(--text-faint)', background: addHover ? 'var(--bg-hover)' : 'transparent', fontSize: 15 }}
      >+</div>
    </div>
  )
}
