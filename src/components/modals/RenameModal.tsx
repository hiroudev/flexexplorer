import React, { useRef } from 'react'
import { useStore } from '../../store/useStore'
import { iconOf, applyRules, uidFor } from '../../utils/fileUtils'
import type { RenameRule, FileEntry } from '../../types'

const TYPE_META: Record<string, { label: string; icon: string; color: string; soft: string }> = {
  replace: { label: 'テキスト置換', icon: 'aA', color: '#2E6FD8', soft: '#2E6FD822' },
  affix: { label: 'プレフィックス / サフィックス', icon: '±', color: '#2F8F5B', soft: '#2F8F5B22' },
  seq: { label: '連番', icon: '#', color: '#6A5BD0', soft: '#6A5BD022' },
  date: { label: '日付挿入', icon: '☷', color: '#B7791F', soft: '#B7791F22' },
  uid: { label: 'ユニークID', icon: '⬡', color: '#2A8C9E', soft: '#2A8C9E22' },
}

function sw(on: boolean): React.CSSProperties {
  return { width: 34, height: 19, borderRadius: 10, background: on ? 'var(--accent)' : 'var(--border-strong)', position: 'relative', cursor: 'default', transition: 'background .15s', flex: '0 0 34px' }
}
function kn(on: boolean): React.CSSProperties {
  return { position: 'absolute', top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }
}
function seg(active: boolean): React.CSSProperties {
  return { padding: '3px 9px', borderRadius: 4, cursor: 'default', fontSize: 11, fontWeight: active ? 650 : 500, color: active ? 'var(--accent-contrast)' : 'var(--text-muted)', background: active ? 'var(--accent)' : 'transparent' }
}
function inputStyle(err = false): React.CSSProperties {
  return { flex: 1, height: 28, border: `1px solid ${err ? 'var(--danger)' : 'var(--border-strong)'}`, borderRadius: 6, background: 'var(--bg-panel)', padding: '0 9px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', outline: 'none' }
}

function DiffSpan({ before, after, isAfter }: { before: string; after: string; isAfter: boolean }) {
  const a = before, b = after
  const max = Math.min(a.length, b.length)
  let p = 0; while (p < max && a[p] === b[p]) p++
  let suf = 0; while (suf < (a.length - p) && suf < (b.length - p) && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++

  if (isAfter) {
    const mid = b.slice(p, b.length - suf)
    return <span>
      <span style={{ color: 'var(--text)' }}>{b.slice(0, p)}</span>
      {mid && <span style={{ color: 'var(--good)', background: 'var(--good-soft)', fontWeight: 700, borderRadius: 2 }}>{mid}</span>}
      <span style={{ color: 'var(--text)' }}>{b.slice(b.length - suf)}</span>
    </span>
  }
  const mid = a.slice(p, a.length - suf)
  return <span>
    <span style={{ color: 'var(--text-muted)' }}>{a.slice(0, p)}</span>
    {mid && <span style={{ color: 'var(--danger)', textDecoration: 'line-through', opacity: 0.7 }}>{mid}</span>}
    <span style={{ color: 'var(--text-muted)' }}>{a.slice(a.length - suf)}</span>
  </span>
}

export default function RenameModal() {
  const modal = useStore(s => s.modal)
  const rules = useStore(s => s.rename.rules)
  const addOpen = useStore(s => s.rename.addOpen)
  const closeModal = useStore(s => s.closeModal)
  const addRule = useStore(s => s.addRule)
  const removeRule = useStore(s => s.removeRule)
  const updateRule = useStore(s => s.updateRule)
  const moveRule = useStore(s => s.moveRule)
  const reorderRule = useStore(s => s.reorderRule)
  const toggleAddMenu = useStore(s => s.toggleAddMenu)
  const applyRename = useStore(s => s.applyRename)
  const activePane = useStore(s => s.activePane)
  const panes = useStore(s => s.panes)

  const dragRuleRef = useRef<string | null>(null)

  if (modal !== 'rename') return null

  const tab = panes[activePane].tabs[panes[activePane].active]
  let targets = tab.sel.map(i => tab.files[i]).filter(f => f && !f.folder)
  if (targets.length <= 1) targets = tab.files.filter(f => !f.folder)

  const afters = applyRules(targets, rules)
  const counts: Record<string, number> = {}
  afters.forEach(a => { counts[a] = (counts[a] || 0) + 1 })
  let conflictCount = 0
  Object.values(counts).forEach(n => { if (n > 1) conflictCount += n })
  const hasConflict = conflictCount > 0

  return (
    <div data-screen-label="一括リネーム" onMouseDown={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,16,30,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 820, maxWidth: '95vw', height: 660, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 680 }}>一括リネーム</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>対象 {targets.length} 件 · ルールは上から順に適用</div>
          </div>
          <CloseBtn onClick={closeModal} />
        </div>

        {/* rules area */}
        <div style={{ flex: '0 0 auto', maxHeight: '42%', overflowY: 'auto', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rules.map(r => (
              <RuleCard
                key={r.id}
                rule={r}
                onToggle={() => updateRule(r.id, { on: !r.on })}
                onRemove={() => removeRule(r.id)}
                onUp={() => moveRule(r.id, -1)}
                onDown={() => moveRule(r.id, 1)}
                onChange={patch => updateRule(r.id, patch)}
                onDragStart={() => { dragRuleRef.current = r.id }}
                onDrop={() => { if (dragRuleRef.current) reorderRule(dragRuleRef.current, r.id); dragRuleRef.current = null }}
              />
            ))}
          </div>
          {/* add button */}
          <div style={{ position: 'relative', marginTop: 10 }}>
            <div
              onClick={toggleAddMenu}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 13px', borderRadius: 7, cursor: 'default', fontSize: 12, fontWeight: 550, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px dashed var(--accent)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-contrast)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--accent)' }}
            >＋ ルールを追加</div>
            {addOpen && (
              <div style={{ position: 'absolute', bottom: 36, left: 0, zIndex: 5, width: 240, padding: 5, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 12px 36px var(--shadow)' }}>
                {Object.entries(TYPE_META).map(([type, m]) => (
                  <AddOption key={type} icon={m.icon} label={m.label} color={m.color} soft={m.soft} onClick={() => addRule(type as RenameRule['type'])} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* preview */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-sunken)' }}>
            <span>プレビュー（{targets.length} 件）</span>
            {hasConflict && <span style={{ color: 'var(--warn)', background: 'var(--warn-soft)', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>⚠ 競合 {conflictCount} 件</span>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '3px 0' }}>
            {targets.map((f, i) => {
              const after = afters[i]
              const dup = counts[after] > 1
              const ic = iconOf(f)
              const dotB = f.name.lastIndexOf('.'); const baseB = dotB > 0 ? f.name.slice(0, dotB) : f.name; const extB = dotB > 0 ? f.name.slice(dotB) : ''
              const dotA = after.lastIndexOf('.'); const baseA = dotA > 0 ? after.slice(0, dotA) : after; const extA = dotA > 0 ? after.slice(dotA) : ''
              return (
                <div key={f.name + i} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 18px 1fr auto', alignItems: 'center', gap: 9, padding: '5px 18px', background: dup ? 'var(--warn-soft)' : 'transparent', borderBottom: '1px solid var(--col-divider)' }}>
                  <span style={{ width: 15, height: 15, flex: '0 0 15px', borderRadius: 3, background: ic.soft, border: `1px solid ${ic.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 6.5, fontWeight: 700, color: ic.color }}>{ic.label}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                    <DiffSpan before={baseB} after={baseA} isAfter={false} /><span style={{ color: 'var(--text-faint)' }}>{extB}</span>
                  </span>
                  <span style={{ color: 'var(--accent)', textAlign: 'center', flex: '0 0 18px' }}>→</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                    <DiffSpan before={baseB} after={baseA} isAfter={true} /><span style={{ color: 'var(--text-faint)' }}>{extA}</span>
                  </span>
                  {dup && <span style={{ flex: '0 0 auto', color: 'var(--warn)', fontSize: 10.5, fontWeight: 600 }}>競合</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Enter で実行 · Esc で閉じる</div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={closeModal} style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 7, cursor: 'default', fontSize: 12.5, color: 'var(--text)', background: 'var(--bg-page)', border: '1px solid var(--border-strong)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-page)'}
            >キャンセル</button>
            <button
              onClick={applyRename}
              disabled={hasConflict}
              style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 18px', borderRadius: 7, cursor: hasConflict ? 'default' : 'default', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-contrast)', background: hasConflict ? 'var(--text-faint)' : 'var(--accent)', border: 'none', pointerEvents: hasConflict ? 'none' : 'auto' }}
            >{hasConflict ? '競合を解消してください' : `${targets.length} 件をリネーム`}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', color: 'var(--text-muted)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)' }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
    >✕</div>
  )
}

function AddOption({ icon, label, color, soft, onClick }: { icon: string; label: string; color: string; soft: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, height: 30, padding: '0 9px', borderRadius: 6, cursor: 'default', fontSize: 12.5 }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <span style={{ width: 20, height: 20, flex: '0 0 20px', borderRadius: 5, background: soft, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{icon}</span>
      {label}
    </div>
  )
}

function RuleCard({ rule, onToggle, onRemove, onUp, onDown, onChange, onDragStart, onDrop }: {
  rule: RenameRule; onToggle: () => void; onRemove: () => void; onUp: () => void; onDown: () => void; onChange: (p: Partial<RenameRule>) => void; onDragStart: () => void; onDrop: () => void
}) {
  const m = TYPE_META[rule.type]
  let findErr = false
  if (rule.type === 'replace' && rule.regex && rule.find) { try { new RegExp(rule.find) } catch { findErr = true } }
  const uidSample = rule.type === 'uid' ? uidFor({ name: 'sample.txt' } as FileEntry, 0, rule.mode || 'short') : ''

  return (
    <div draggable onDragStart={onDragStart} onDragOver={e => e.preventDefault()} onDrop={onDrop}
      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 11px', opacity: rule.on ? 1 : 0.55, boxShadow: '0 1px 2px var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: rule.on ? 9 : 0 }}>
        <span title="ドラッグで並び替え" style={{ cursor: 'grab', color: 'var(--text-faint)', fontSize: 13, letterSpacing: -2 }}>⠿</span>
        <span style={{ width: 20, height: 20, flex: '0 0 20px', borderRadius: 5, background: m.soft, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{m.icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.label}</span>
        <div style={{ flex: 1 }} />
        <SmBtn onClick={onUp}>▲</SmBtn>
        <SmBtn onClick={onDown}>▼</SmBtn>
        <div onClick={onToggle} style={sw(rule.on)}><span style={kn(rule.on)} /></div>
        <SmBtn onClick={onRemove} danger>✕</SmBtn>
      </div>
      {rule.on && (
        <>
          {rule.type === 'replace' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 29 }}>
              <input value={rule.find || ''} onChange={e => onChange({ find: e.target.value })} placeholder="検索" style={{ ...inputStyle(findErr) }} />
              <span style={{ color: 'var(--text-faint)' }}>→</span>
              <input value={rule.repl || ''} onChange={e => onChange({ repl: e.target.value })} placeholder="置換" style={{ ...inputStyle() }} />
              <div onClick={() => onChange({ regex: !rule.regex })} title="正規表現"
                style={{ width: 30, height: 28, flex: '0 0 30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'default', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: rule.regex ? 'var(--accent-contrast)' : 'var(--text-muted)', background: rule.regex ? 'var(--accent)' : 'var(--bg-panel)', border: `1px solid ${findErr ? 'var(--danger)' : rule.regex ? 'var(--accent)' : 'var(--border-strong)'}` }}
              >.*</div>
            </div>
          )}
          {rule.type === 'affix' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 29 }}>
              <input value={rule.prefix || ''} onChange={e => onChange({ prefix: e.target.value })} placeholder="先頭に追加" style={{ ...inputStyle() }} />
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>…名前…</span>
              <input value={rule.suffix || ''} onChange={e => onChange({ suffix: e.target.value })} placeholder="末尾に追加" style={{ ...inputStyle() }} />
            </div>
          )}
          {rule.type === 'seq' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 29, fontSize: 11.5, color: 'var(--text-muted)' }}>
              <span>区切り</span><input value={rule.sep || ''} onChange={e => onChange({ sep: e.target.value })} style={{ width: 46, height: 28, border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-panel)', padding: '0 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', outline: 'none', textAlign: 'center' }} />
              <span>開始</span><input value={rule.start || ''} onChange={e => onChange({ start: e.target.value })} style={{ width: 56, height: 28, border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-panel)', padding: '0 9px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', outline: 'none' }} />
              <span>桁数</span><input value={rule.digits || ''} onChange={e => onChange({ digits: e.target.value })} style={{ width: 56, height: 28, border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-panel)', padding: '0 9px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', outline: 'none' }} />
            </div>
          )}
          {rule.type === 'date' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 29, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-muted)' }}>
              <SegControl opts={[['modified', '更新日'], ['created', '作成日']]} value={rule.source || 'modified'} onChange={v => onChange({ source: v as 'modified' | 'created' })} />
              <SegControl opts={[['YYYY-MM-DD', 'YYYY-MM-DD'], ['YYYYMMDD', 'YYYYMMDD'], ['YYYY-MM-DD_HHmm', '+時刻']]} value={rule.fmt || 'YYYY-MM-DD'} onChange={v => onChange({ fmt: v })} />
            </div>
          )}
          {rule.type === 'uid' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 29, fontSize: 11.5, color: 'var(--text-muted)' }}>
              <SegControl opts={[['short', '短縮ハッシュ'], ['uuid', 'UUID']]} value={rule.mode || 'short'} onChange={v => onChange({ mode: v as 'short' | 'uuid' })} />
              <span>例: {uidSample}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SmBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <div onClick={onClick} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'default', color: 'var(--text-faint)', fontSize: 11 }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--danger-soft)' : 'var(--bg-hover)'; e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-faint)' }}
    >{children}</div>
  )
}

function SegControl({ opts, value, onChange }: { opts: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
      {opts.map(([v, label]) => (
        <div key={v} onClick={() => onChange(v)} style={seg(value === v)}>{label}</div>
      ))}
    </div>
  )
}
