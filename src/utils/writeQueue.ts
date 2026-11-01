// Writes that must happen one after another, and a flush that waits until
// none is left. Pure, so `node --experimental-strip-types
// src/utils/writeQueue.test.mjs` can run the case that used to hang.

export function writeQueue() {
  let tail: Promise<boolean> = Promise.resolve(true)
  let flushing: Promise<boolean> | null = null
  return {
    /** Queues `run` behind everything already queued. */
    push(run: () => Promise<boolean>) {
      tail = tail.then(run, run)
    },
    /** Runs `run` behind the queue, and again while something new was queued
     * meanwhile or `busy()` says more is on its way; false when any round
     * was. A call made while one is running gets that one's promise: two
     * loops each waiting for the queue to be theirs used to take it from
     * each other for ever, on microtasks alone, so the UI froze. */
    flush(run: () => Promise<boolean>, busy: () => boolean): Promise<boolean> {
      if (flushing) return flushing
      flushing = (async () => {
        let ok = true
        try {
          for (;;) {
            const mine = (tail = tail.then(run, run))
            ok = (await mine) && ok
            if (tail === mine && !busy()) return ok
          }
        } finally { flushing = null }
      })()
      return flushing
    },
  }
}
