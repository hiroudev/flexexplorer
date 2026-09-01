// Self-check for the generation grouping rules:
//   node src/utils/generations.test.mjs
// No test framework — the module is plain JS behind type annotations, so it is
// loaded by stripping them.
import { readFileSync, writeFileSync } from 'fs'

let src = readFileSync('src/utils/generations.ts', 'utf8')
src = src
  .replace(/^import type .*$/m, '')
  .replace(': string): string {', ') {')
  .replace('(name: string, rules: GenerationRule[]): string | null {', '(name, rules) {')
  .replace('(name: string, rules: GenerationRule[]): string {', '(name, rules) {')
  .replace('(f: FileEntry): string {', '(f) {')
  .replace('(files: FileEntry[], rules: GenerationRule[]): Set<number> {', '(files, rules) {')
  .replace("(files: FileEntry[], rules: GenerationRule[]): { key: string; names: string[] }[] {", '(files, rules) {')
  .replace('new Map<string, number[]>()', 'new Map()')
  .replace('new Map<string, FileEntry[]>()', 'new Map()')
  .replace('new Set<number>()', 'new Set()')
  .replace('let re: RegExp', 'let re')
const tmp = new URL('./.generations.gen.mjs', import.meta.url)
writeFileSync(tmp, src)
const g = await import(tmp.href)

let bad = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : `-> ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
const same = (a, b) => g.autoKey(a) === g.autoKey(b)

// the shapes this feature exists for
eq('A_date == A_date_rev', same('A_20260818.xlsx', 'A_20260818_01.xlsx'), true)
eq('A_date == A_date_letter', same('A_20260818.xlsx', 'A_20260818a.xlsx'), true)
eq('A_date == A_date_letter_rev', same('A_20260818.xlsx', 'A_20260818a_02.xlsx'), true)
eq('A != B', same('A_20260818.xlsx', 'B_20260818.xlsx'), false)
eq('extension separates', same('A_20260818.xlsx', 'A_20260818.pdf'), false)

// names that merely contain a digit are NOT versions of each other
eq('会議室1 != 会議室2', same('会議室1_予約.txt', '会議室2_予約.txt'), false)
eq('P3X != P4Y', same('P3X.log', 'P4Y.log'), false)
eq('1.txt != 2.txt', same('1.txt', '2.txt'), false)

// newest of a set
const files = [
  { name: 'A_20260818.xlsx',    m: '2026/08/18 10:00' },
  { name: 'A_20260818a.xlsx',   m: '2026/08/19 09:00' },
  { name: 'A_20260818a_02.xlsx',m: '2026/08/20 11:00' },
  { name: 'B_20260818.xlsx',    m: '2026/09/01 08:00' },
]
eq('latest picks the newest of the set', [...g.latestGenerationIndices(files, [])], [2])
eq('a lone file is not marked', [...g.latestGenerationIndices([files[3]], [])], [])

// preview ranks the same way the highlight does
const groups = g.previewGroups(files, [])
eq('preview lists the newest first', groups.map(x => x.names[0]), ['A_20260818a_02.xlsx'])

console.log(bad ? bad + ' FAILED' : 'all passed')
if (bad) process.exit(1)
