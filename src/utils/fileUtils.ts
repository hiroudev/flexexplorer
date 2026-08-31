import type { FileEntry, IconInfo, PaneTab, RenameRule } from '../types'

export function fmt(b: number | undefined): string {
  if (b == null) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(2) + ' MB'
}

export function iconOf(file: FileEntry): IconInfo {
  if (file.folder) {
    return { folder: true, color: file.dim ? 'var(--text-faint)' : 'var(--accent)', soft: 'transparent', label: '' }
  }
  const e = (file.ext || '').toLowerCase()
  const map: Record<string, string> = {
    ts: '#2E6FD8', tsx: '#2E6FD8', js: '#2E6FD8', jsx: '#2E6FD8',
    json: '#2E6FD8', html: '#2E6FD8', css: '#2E6FD8',
    md: '#5B6B86', txt: '#5B6B86',
    docx: '#4A5BC4', doc: '#4A5BC4',
    xlsx: '#2F8F5B', csv: '#2F8F5B',
    pptx: '#6A5BD0',
    pdf: '#C0473E',
    png: '#2A8C9E', jpg: '#2A8C9E', jpeg: '#2A8C9E', gif: '#2A8C9E', webp: '#2A8C9E',
  }
  const c = map[e] || '#7C89A2'
  return { folder: false, color: c, soft: c + '22', label: (e || '•').toUpperCase().slice(0, 4) }
}

export function splitName(file: FileEntry): { base: string; ext: string } {
  if (file.folder) return { base: file.name, ext: '' }
  const i = file.name.lastIndexOf('.')
  if (i > 0) return { base: file.name.slice(0, i), ext: file.name.slice(i) }
  return { base: file.name, ext: '' }
}

export function visibleIndices(tab: PaneTab, search: string, showHidden = true): number[] {
  const q = search.trim().toLowerCase()
  const out: number[] = []
  tab.files.forEach((f, i) => {
    if (f.hidden && !showHidden) return
    if (!q || f.name.toLowerCase().includes(q)) out.push(i)
  })
  const key = tab.sortKey
  if (!key) return out
  const dir = tab.sortDir === -1 ? -1 : 1
  const files = tab.files
  const cmp = (ai: number, bi: number): number => {
    const a = files[ai], b = files[bi]
    if (!!a.folder !== !!b.folder) return a.folder ? -1 : 1 // folders first, always
    if (key === 'size') return dir * ((a.size || 0) - (b.size || 0))
    if (key === 'date') return dir * (a.m || '').localeCompare(b.m || '')
    return dir * a.name.localeCompare(b.name, 'ja')
  }
  return [...out].sort(cmp)
}

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 }
  return h >>> 0
}

export function fmtDate(file: FileEntry, source: string, fmt: string): string {
  const mm = (source === 'created' ? (file.c || file.m) : file.m) || '2026/01/01 00:00'
  const [d, t] = mm.split(' ')
  const [Y, Mo, Da] = d.split('/')
  const [H, Mi] = (t || '00:00').split(':')
  if (fmt === 'YYYYMMDD') return '' + Y + Mo + Da
  if (fmt === 'YYYY-MM-DD_HHmm') return Y + '-' + Mo + '-' + Da + '_' + H + Mi
  return Y + '-' + Mo + '-' + Da
}

export function uidFor(file: FileEntry, idx: number, mode: string): string {
  const h = hashStr(file.name + '#' + idx)
  const hex = h.toString(16).padStart(8, '0')
  if (mode === 'uuid') {
    const h2 = hashStr(file.name + '@' + idx).toString(16).padStart(8, '0')
    return hex + '-' + h2.slice(0, 4) + '-' + h2.slice(4, 8)
  }
  return hex.slice(0, 6)
}

export function previewText(file: FileEntry): string {
  if (file.pv === 'readme') return '# webapp\n\n社内向けプロジェクト管理ツールのフロントエンド。\nTauri 2.0 + React + TypeScript。\n\n## セットアップ\n\n    npm install\n    npm run dev\n\n## ディレクトリ\n\n- src/        … アプリ本体\n- src/store/  … Zustand ストア\n- public/     … 静的アセット'
  if (file.pv === 'memo') return '# ' + file.name.replace(/\.md$/, '') + '\n\n日時: ' + file.m + '\n出席: 田中 / 佐藤 / 鈴木\n\n## 決定事項\n- ファイル名の文字化け対策を最優先\n- 分割パネル + Inspector を MVP に含める\n- ショートカットは設定画面でカスタム可\n\n## ToDo\n- [ ] 一括リネームの正規表現対応\n- [ ] ダークテーマの調整'
  if (file.pv === 'json') return '{\n  "name": "webapp",\n  "version": "0.3.1",\n  "private": true,\n  "scripts": {\n    "dev": "vite",\n    "build": "tsc && vite build"\n  },\n  "dependencies": {\n    "react": "^18.3.0",\n    "zustand": "^4.5.0"\n  }\n}'
  if (file.pv === 'sheet') return '       A            B          C\n1   品目         数量       金額\n2   ライセンス    12      1,440,000\n3   サポート       1        320,000\n4   合計                  1,760,000'
  if (file.pv === 'text') return 'TODO:\n- 請求書の送付 (6/30まで)\n- スクショの整理\n- 議事録の共有'
  return ''
}

/** Apply an ordered list of rename rules to files, returning the new names. */
export function applyRules(files: FileEntry[], rules: RenameRule[]): string[] {
  return files.map((file, idx) => {
    const name = file.name
    const dot = name.lastIndexOf('.')
    let base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (const r of rules) {
      if (!r.on) continue
      if (r.type === 'replace' && r.find) {
        if (r.regex) { try { base = base.replace(new RegExp(r.find, 'g'), r.repl || '') } catch { } }
        else { base = base.split(r.find).join(r.repl || '') }
      } else if (r.type === 'affix') {
        base = (r.prefix || '') + base + (r.suffix || '')
      } else if (r.type === 'seq') {
        const d = Math.max(1, Math.min(8, parseInt(r.digits || '1', 10) || 1))
        base = base + (r.sep || '') + String((parseInt(r.start || '0', 10) || 0) + idx).padStart(d, '0')
      } else if (r.type === 'date') {
        base = base + (r.sep || '') + fmtDate(file, r.source || 'modified', r.fmt || 'YYYY-MM-DD')
      } else if (r.type === 'uid') {
        base = base + (r.sep || '') + uidFor(file, idx, r.mode || 'short')
      }
    }
    return base + ext
  })
}

/** Leading tree-drawing decoration on a pasted line: box characters, ASCII
 * fallbacks, bullets, and the indentation around them. */
const TREE_PREFIX = /^[\s\u3000|+\-*.]*[└┗├┣│┃─━┌┏|`+\-*]+[\s\u3000─━]*/

/** Turns pasted text into one absolute path.
 *
 * Paths get quoted, wrapped and drawn as trees on the way through chat and
 * documents, so what lands on the clipboard is rarely a bare path:
 *
 *     \hoge\fuga
 *     └ファイル名.xlsx
 *
 * Every line after the first is treated as one level deeper and appended with
 * its decoration stripped. Indentation depth is deliberately ignored: the
 * shapes people actually paste are a single chain, and guessing at depth would
 * turn a wrong guess into a wrong folder. */
export function parsePastedPath(text: string): string {
  const lines = text.split(/\r?\n/)
    .map(l => l.replace(TREE_PREFIX, '').trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
  if (!lines.length) return ''
  const [head, ...rest] = lines
  const sep = head.includes('/') && !head.includes('\\') ? '/' : '\\'
  return [head.replace(/[\\\/]+$/, ''), ...rest].join(sep)
}
