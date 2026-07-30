/**
 * Asks the browser not to evict this origin's storage.
 *
 * Without this the origin is "best-effort": OPFS works and survives restarts,
 * but the browser is free to clear it when the disk runs short. The bundled
 * collections would be rebuilt, so nothing is lost there — the casualties are
 * the games someone played and the PGN files they imported, neither of which the
 * app can recreate.
 *
 * Granting is at the browser's discretion, not ours. Chrome weighs how much the
 * site is used, whether it is bookmarked or installed; Firefox asks the user.
 * A refusal is therefore an ordinary outcome and has to be reported rather than
 * assumed away, which is why this returns the answer instead of just calling it.
 *
 * `persist()` exists only on Window — `persisted()` and `estimate()` are
 * available in workers, but the request itself is not, so this cannot move into
 * the database worker alongside the rest of the storage code.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage

  // Absent in older browsers, and in any non-secure context.
  if (storage === undefined || typeof storage.persist !== 'function') return false

  try {
    // Already granted on a previous visit: asking again would be a second
    // permission prompt for something the user has settled.
    if (await storage.persisted()) return true
    return await storage.persist()
  } catch {
    // A refusal and a browser that throws instead of refusing mean the same
    // thing here: the storage is evictable.
    return false
  }
}
