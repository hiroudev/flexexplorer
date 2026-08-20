import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import type { LayoutGroup } from '../types'

/** Drag payload markers. A group tab accepts two kinds of drop: another group
 * tab (reorder), and a pane dragged off its tab bar (move it into this group). */
const GROUP_MIME = 'application/x-flex-group'
export const PANE_MIME = 'application/x-flex-pane'

/** One group tab: click to switch, double-click to rename inline, ✕ to close,
 * drag to reorder. */
function GroupTab({ group, index, active, closable, onSwitch, onClose, onRename, onReorder, onPaneDrop }: {
  group: LayoutGroup; index: number; active: boolean; closable: boolean
  onSwitch: () => void; onClose: () => void; onRename: (name: string) => void
  onReorder: (src: number, dest: number) => void
  onPaneDrop: (pi: number) => void
}) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(group.name)
  const [dropSide, setDropSide] = useState<'before' | 'after' | 'into' | null>(null)
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
      draggable={!editing}
      onDragStart={e => {
        e.dataTransfer.setData(GROUP_MIME, String(index))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={e => {
        const types = e.dataTransfer.types
        if (types.includes(PANE_MIME)) {
          // A pane lands *in* the group, so there's no before/after to pick.
          e.preventDefault()
          setDropSide('into')
        } else if (types.includes(GROUP_MIME)) {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          setDropSide(e.clientX < r.left + r.width / 2 ? 'before' : 'after')
        }
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={e => {
        const side = dropSide
        setDropSide(null)
        const paneRaw = e.dataTransfer.getData(PANE_MIME)
        if (paneRaw) { e.preventDefault(); onPaneDrop(Number(paneRaw)); return }
        const groupRaw = e.dataTransfer.getData(GROUP_MIME)
        if (!groupRaw) return
        e.preventDefault()
        onReorder(Number(groupRaw), side === 'after' ? index + 1 : index)
      }}
      onClick={onSwitch}
      onDoubleClick={() => { setVal(group.name); setEditing(true) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={group.name + '（ダブルクリックで名前変更・ドラッグで並べ替え）'}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 5px 0 11px', borderRadius: 7, cursor: 'default',
        maxWidth: 168, flex: '0 1 auto', minWidth: 0,
        color: active ? 'var(--accent-contrast)' : 'var(--text-muted)',
        background: dropSide === 'into' ? 'var(--accent-soft)' : active ? 'var(--accent)' : hover ? 'var(--bg-hover)' : 'transparent',
        border: dropSide === 'into' ? '1px dashed var(--accent)' : active ? 'none' : '1px solid var(--border-strong)',
      }}
    >
      {(dropSide === 'before' || dropSide === 'after') && (
        <span style={{ position: 'absolute', top: 2, bottom: 2, [dropSide === 'before' ? 'left' : 'right']: -2, width: 2, borderRadius: 1, background: 'var(--accent)' }} />
      )}
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
  const reorderLayoutGroups = useStore(s => s.reorderLayoutGroups)
  const movePaneToGroup = useStore(s => s.movePaneToGroup)
  const [addHover, setAddHover] = useState(false)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {layouts.map((g, i) => (
        <GroupTab
          key={g.id}
          group={g}
          index={i}
          active={i === activeLayout}
          closable={layouts.length > 1}
          onSwitch={() => switchLayoutGroup(i)}
          onClose={() => closeLayoutGroup(i)}
          onRename={name => renameLayoutGroup(i, name)}
          onReorder={(src, dest) => reorderLayoutGroups(src, dest)}
          onPaneDrop={pi => movePaneToGroup(pi, i)}
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
