// Replace-in-place writer for the small JSON files this plugin keeps.
//
// Windows refuses to replace a file that another handle holds open (EPERM) and can
// also fail when two processes race the same target. The old inline copy retried
// nothing, so a single transient failure lost the update. Retry briefly, then fall
// back to overwriting the target directly: our writers are serialized, so the bytes
// still land whole, and losing the update is worse than a tiny non-atomic window.
import { writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

const TRANSIENT_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES'])
const wait = (ms) => {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* worker or main: just continue */ }
}

/**
 * Write `text` to `file` via a temporary + rename, retrying the transient Windows
 * failures and falling back to an in-place write instead of dropping the data.
 * Throws only for errors that will not resolve by retrying (e.g. ENOENT on the dir).
 */
export function writeFileAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  try { writeFileSync(tmp, text) } catch { writeFileSync(file, text); return }
  for (let attempt = 0; ; attempt++) {
    try { renameSync(tmp, file); return } catch (error) {
      if (!TRANSIENT_RENAME.has(error?.code)) { try { unlinkSync(tmp) } catch { /* best effort */ } ; throw error }
      if (attempt >= 5) {
        try { writeFileSync(file, text) } finally { try { unlinkSync(tmp) } catch { /* best effort */ } }
        return
      }
      wait(10 * 2 ** attempt)
    }
  }
}
