// Self-check for nameProblem: `node src/utils/fileName.test.mjs` from the
// project root. No test framework — the module is plain JS behind a type
// annotation, so it's loaded by stripping the signature.
import { readFileSync, writeFileSync } from 'fs'

let src = readFileSync('src/utils/fileName.ts', 'utf8')
src = src.replace('export function nameProblem(name: string): string | null {', 'export function nameProblem(name) {')
writeFileSync('src/utils/.fileName.gen.mjs', src)
const { nameProblem } = await import('./.fileName.gen.mjs')

const B = String.fromCharCode(92)
const cases = [
  ['報告書_v2.xlsx', true],
  ['a.b.c', true],
  ['.gitignore', true],
  ['CONFIG.txt', true],
  ['com10', true],
  ['', false],
  ['.', false],
  ['..', false],
  ['..' + B + 'archive' + B + 'a.txt', false],
  ['sub/a.txt', false],
  ['a:b', false],
  ['what?', false],
  ['name.', false],
  ['name ', false],
  ['CON', false],
  ['nul.txt', false],
  ['Lpt1.log', false],
  ['x'.repeat(256), false],
]

let failed = 0
for (const [name, ok] of cases) {
  const got = nameProblem(name) === null
  const pass = got === ok
  if (!pass) failed++
  console.log(pass ? 'ok  ' : 'FAIL', JSON.stringify(name.length > 40 ? name.slice(0, 20) + '…' : name), ok ? 'allowed' : 'refused')
}
if (failed) { console.log(failed + ' failed'); process.exit(1) }
console.log('all passed')
