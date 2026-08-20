//! "Generation" files: sets of files that are successive versions of the same
//! document, distinguished only by a date or revision stamp in the name —
//! `A_20260818.xlsx`, `A_20260818_01.xlsx`, `A_20260818a.xlsx`. The list can
//! then mark the newest member of each set, so the current version is obvious
//! without reading timestamps off every row.

import type { FileEntry, GenerationRule } from '../types'

/** Digits, optionally carrying a single-letter revision suffix (`20260818a`).
 * Everything matched here is what varies *between* generations, so removing it
 * is what makes two generations collapse onto the same key. */
const STAMP = /\d+[A-Za-z]?/g

/** Runs of separators left behind once the stamps are gone. */
const SEP_RUN = /[ _\-.]{2,}/g

/** The grouping key for a file name under the built-in automatic rule.
 * Extension is preserved, so `A_20260818.xlsx` and `A_20260818.pdf` stay apart. */
export function autoKey(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  const stripped = base.replace(STAMP, '').replace(SEP_RUN, '_')
  return (stripped + ext).toLowerCase()
}

/** The grouping key from the first matching user rule, or null if none match. */
export function ruleKey(name: string, rules: GenerationRule[]): string | null {
  for (const r of rules) {
    if (!r.on || !r.pattern) continue
    let re: RegExp
    try { re = new RegExp(r.pattern) } catch { continue }
    const m = re.exec(name)
    if (!m) continue
    // Capture groups name the *stable* part of the family; with none, the whole
    // match plays that role.
    const parts = m.length > 1 ? m.slice(1) : [m[0]]
    return r.id + ' ' + parts.map(p => (p ?? '').toLowerCase()).join(' ')
  }
  return null
}

/** Grouping key for one name: an explicit rule wins, else the automatic one. */
export function generationKey(name: string, rules: GenerationRule[]): string {
  return ruleKey(name, rules) ?? autoKey(name)
}

/** Comparable form of a "YYYY/MM/DD HH:mm" timestamp. Empty sorts lowest. */
function stamp(f: FileEntry): string {
  return f.m || ''
}

/** Indices of the newest file in every generation group of `files`.
 *
 * Newest means the latest modified time; ties fall back to the name in
 * descending order, which makes `…a` lose to `…b` as you'd expect. Groups with
 * only one member are not marked — there's no older sibling to distinguish it
 * from, so highlighting it would just be noise. */
export function latestGenerationIndices(files: FileEntry[], rules: GenerationRule[]): Set<number> {
  const groups = new Map<string, number[]>()
  files.forEach((f, i) => {
    if (f.folder) return
    const key = generationKey(f.name, rules)
    const g = groups.get(key)
    if (g) g.push(i)
    else groups.set(key, [i])
  })

  const out = new Set<number>()
  for (const idx of groups.values()) {
    if (idx.length < 2) continue
    let best = idx[0]
    for (const i of idx.slice(1)) {
      const a = stamp(files[i])
      const b = stamp(files[best])
      if (a > b || (a === b && files[i].name > files[best].name)) best = i
    }
    out.add(best)
  }
  return out
}

/** Preview of how `files` would be grouped, for the settings UI: one entry per
 * group with more than one member, newest first within each. */
export function previewGroups(files: FileEntry[], rules: GenerationRule[]): { key: string; names: string[] }[] {
  const groups = new Map<string, FileEntry[]>()
  for (const f of files) {
    if (f.folder) continue
    const key = generationKey(f.name, rules)
    const g = groups.get(key)
    if (g) g.push(f)
    else groups.set(key, [f])
  }
  return [...groups.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({
      key,
      names: [...v]
        .sort((a, b) => (stamp(b).localeCompare(stamp(a)) || b.name.localeCompare(a.name)))
        .map(f => f.name),
    }))
}
