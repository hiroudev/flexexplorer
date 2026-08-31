// Self-check for parsePastedPath: `node src/utils/parsePastedPath.test.mjs`
// from the project root. No test framework — the parser is plain JS behind a
// type annotation, so it's loaded by stripping the signature.
import { readFileSync, writeFileSync } from 'fs'
const B = String.fromCharCode(92)
let src = readFileSync('src/utils/fileUtils.ts', 'utf8')
src = src.slice(src.indexOf('/** Leading tree-drawing'))
src = src.replace('export function parsePastedPath(text: string): string {', 'export function parsePastedPath(text) {')
const tmp = new URL('./.parsePastedPath.gen.mjs', import.meta.url)
writeFileSync(tmp, src)
const { parsePastedPath: p } = await import(tmp.href)

const U = B + B + 'hoge' + B + 'fuga'          // \hogeuga
const C = 'C:' + B + 'a' + B + 'b'
const cases = [
  [U + 'NL' + '└ファイル名.xlsx',            U + B + 'ファイル名.xlsx'],
  [U + 'NL' + '  ┗ ファイル名.xlsx',         U + B + 'ファイル名.xlsx'],
  [C + 'NL' + '├ 10:基本設計' + 'NL' + '  └ 資料.docx', C + B + '10:基本設計' + B + '資料.docx'],
  [C + B + 'c.txt',                              C + B + 'c.txt'],
  ['"' + C + B + 'c d.txt"',                     C + B + 'c d.txt'],
  [C + B + 'NL',                                 C],
  ['  ' + U + '  ' + 'NL' + 'NL' + '└ x.xlsx  ',  U + B + 'x.xlsx'],
  ['/mnt/data' + 'NL' + '└ a.csv',           '/mnt/data/a.csv'],
  ['',                                           ''],
]
let bad = 0
for (let [input, want] of cases) {
  input = input.split('NL').join(String.fromCharCode(10))
  const got = p(input)
  const ok = got === want
  if (!ok) bad++
  console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(input), '->', JSON.stringify(got), ok ? '' : '  want ' + JSON.stringify(want))
}
console.log(bad ? bad + ' FAILED' : 'all passed')
if (bad) process.exit(1)
