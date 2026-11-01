// Self-check for the note save queue:
//   node --experimental-strip-types --no-warnings src/utils/writeQueue.test.mjs
// Two flushes at once (× pressed twice while a note saves) used to loop on
// microtasks for ever; the timeout below would then never fire.
import { writeQueue } from './writeQueue.ts'

let bad = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : `-> ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
const hang = new Promise(r => setTimeout(() => r('hang'), 1000))

{
  const q = writeQueue()
  let runs = 0
  const run = async () => { runs++; return true }
  const both = Promise.all([q.flush(run, () => false), q.flush(run, () => false)])
  eq('two flushes at once both finish', await Promise.race([both, hang]), [true, true])
  eq('they share one round', runs, 1)
}

{
  // A write queued while the flush runs is waited for.
  const q = writeQueue()
  const log = []
  const run = async () => { log.push('flush'); if (log.length === 1) q.push(async () => { log.push('late'); return false }); return true }
  eq('late write is waited for', await Promise.race([q.flush(run, () => false), hang]), true)
  eq('flushed again after it', log, ['flush', 'late', 'flush'])
}

{
  // busy() keeps it going until nothing is pending.
  const q = writeQueue()
  let pending = 2
  const r = await Promise.race([q.flush(async () => { pending--; return true }, () => pending > 0), hang])
  eq('waits for pending', [r, pending], [true, 0])
  // and a later flush starts a new round
  let n = 0
  await q.flush(async () => { n++; return true }, () => false)
  eq('next flush runs again', n, 1)
}

if (bad) { console.log(`\n${bad} failed`); process.exit(1) }
console.log('\nall passed')
process.exit(0)
