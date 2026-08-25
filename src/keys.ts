//! Keyboard shortcut plumbing: one vocabulary for naming key combos, and the
//! table that maps a bindable action id to what it actually does.
//!
//! Before this existed, `binds` in the store was display-only — the Options >
//! ショートカット list showed combos that nothing consulted, while App.tsx ran
//! its own hard-coded `if (e.key === …)` chain. Rebinding therefore appeared to
//! do nothing. Both the capture UI and the runtime handler now go through
//! `comboOf`, so what the list shows is what actually fires.

import type { StoreApi } from 'zustand'
import type { AppState } from './types'

type Store = AppState & Record<string, any>

/** Human-readable name for the non-modifier half of a combo. */
export function keyName(key: string): string {
  switch (key) {
    case ' ': return 'Space'
    case 'ArrowUp': return '↑'
    case 'ArrowDown': return '↓'
    case 'ArrowLeft': return '←'
    case 'ArrowRight': return '→'
    case 'Delete': return 'Del'
    case 'Escape': return 'Esc'
    default: return key.length === 1 ? key.toUpperCase() : key
  }
}

/** True for the modifier keys themselves, which can't stand alone as a combo. */
export function isModifierKey(key: string): boolean {
  return key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta'
}

/** Canonical name for a key event, e.g. "Ctrl+Shift+P", "Alt+↑", "F2".
 * Modifier order is fixed (Ctrl, Alt, Shift) so equal combos compare equal. */
export function comboOf(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (isModifierKey(e.key)) return parts.join('+')
  parts.push(keyName(e.key))
  return parts.join('+')
}

/** Moves DOM focus into the toolbar search box (see TitleBar's SearchBox). */
function focusSearchBox() {
  const el = document.querySelector<HTMLInputElement>('input[data-search-input]')
  el?.focus()
  el?.select()
}

const DENSITIES: AppState['opt']['rowHeight'][] = ['compact', 'standard', 'loose']

/** What each bindable action does. Keys here must match the ids listed in
 * SHORTCUT_GROUPS (useStore.ts) — that list is what the Options UI renders. */
export const ACTIONS: Record<string, (st: Store) => void> = {
  // navigation
  'nav.up': st => st.moveSel(-1),
  'nav.down': st => st.moveSel(1),
  'nav.parent': st => st.navParent(st.activePane),
  'nav.back': st => st.navBack(st.activePane),
  'nav.forward': st => st.navForward(st.activePane),
  'nav.refresh': st => {
    const t = st.panes[st.activePane].tabs[st.panes[st.activePane].active]
    void st.navigate(st.activePane, t.path, { push: false })
  },
  'nav.open': st => {
    const t = st.panes[st.activePane].tabs[st.panes[st.activePane].active]
    st.openFile(st.activePane, t.focus)
  },
  'nav.newtab': st => st.newTab(st.activePane),
  'nav.closetab': st => st.closeTab(st.activePane, st.panes[st.activePane].active),
  'nav.address': st => st.startAddressEdit(st.activePane),
  'cmd.goto': st => st.openGoto(),

  // view
  'view.inspector': st => st.toggleInspector(),
  'cmd.palette': st => st.openPalette(),
  'cmd.options': st => st.openModal('options'),
  'cmd.workspaces': st => st.openModal('workspaces'),
  'win.new': st => void st.openWorkspaceInNewWindow(st.defaultWorkspace ?? undefined),
  'view.density': st => {
    const i = DENSITIES.indexOf(st.opt.rowHeight)
    st.setOpt('rowHeight', DENSITIES[(i + 1) % DENSITIES.length])
  },
  'view.theme': st => st.toggleTheme(),
  'view.sidebar': st => st.toggleSidebar(),

  // panes
  'view.split': st => st.cyclePane(1),
  'pane.swap': st => st.swapPanes(),
  'pane.addright': st => st.addPaneRight(),
  'pane.adddown': st => st.addPaneDown(),
  'pane.close': st => st.closePane(st.activePane),

  // layout groups / tabs
  'group.prev': st => st.cycleLayoutGroup(-1),
  'group.next': st => st.cycleLayoutGroup(1),
  'group.reopen': st => st.reopenClosedLayoutGroup(),
  'tab.prev': st => st.cycleTab(st.activePane, -1),
  'tab.next': st => st.cycleTab(st.activePane, 1),
  'tab.reopen': st => st.reopenClosedTab(),

  // selection
  'edit.selectall': st => st.selectAll(),
  'edit.invertsel': st => st.invertSelection(),
  'edit.clearsel': st => st.clearSelection(),
  'view.hidden': st => st.toggleAdv('hidden'),

  // editing
  'edit.copy': st => st.copyToClip(),
  'edit.cut': st => st.cutToClip(),
  'edit.paste': st => void st.paste(),
  'edit.rename': st => {
    // A lone selection renames inline; a multi-selection has no inline form,
    // so it goes to the bulk tool instead.
    const ap = st.activePane
    const t = st.panes[ap].tabs[st.panes[ap].active]
    if (t.sel.length === 1) st.startRename(ap, t.sel[0])
    else st.openModal('rename')
  },
  'edit.bulk': st => st.openModal('rename'),
  'edit.delete': st => void st.deleteSelected(),
  'edit.copypath': st => void st.copyPathToClipboard(),
  'edit.note': st => st.addNote(),
  'edit.props': st => st.shellProperties(),

  // search
  'find.filter': st => { if (st.searchMode !== 'filter') st.toggleSearchMode(); focusSearchBox() },
  'find.global': st => { if (st.searchMode !== 'global') st.toggleSearchMode(); focusSearchBox() },
}

/** Builds combo → action id from the user's current bindings. Later entries
 * win on a duplicate combo, matching the conflict warning shown in Options. */
export function bindingMap(binds: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>()
  for (const [id, combo] of Object.entries(binds)) {
    if (combo && ACTIONS[id]) m.set(combo, id)
  }
  return m
}

/** Runs the action bound to `combo`, if any. Returns whether it handled it. */
export function runBinding(
  combo: string,
  binds: Record<string, string>,
  store: StoreApi<AppState>,
): boolean {
  const id = bindingMap(binds).get(combo)
  if (!id) return false
  ACTIONS[id](store.getState() as Store)
  return true
}
