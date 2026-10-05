/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

/**
 * The offline shell.
 *
 * Everything else about this app already survives being offline: the games live
 * in SQLite on OPFS, the engine and both wasm binaries are same-origin files,
 * and nothing crosses the network at runtime except the app's own assets. The
 * one thing that did not survive was the shell itself — close the tab on a
 * train and the next visit got the browser's offline page. This worker closes
 * exactly that gap, and nothing more.
 *
 * What is cached, and why — the split is the design:
 *
 * - **Precached at install**: the document, the hashed JS/CSS, and the SQLite
 *   runtime (wasm + its workers, ~1.3 MB). Without SQLite the app cannot open
 *   its own database, so offline without it is not a smaller app but a broken
 *   one.
 * - **Cached on first use**: Stockfish (~1.8 MB). Someone who only browses the
 *   archive never runs the engine, and precaching it would nearly double the
 *   install for a feature they may not touch. After the first game it is local.
 * - **Never cached**: `/games/*.pgn`. Read once on first visit, loaded into the
 *   database, dead bytes afterwards — the archive serves from OPFS, not from
 *   these files. Caching them would store 2 MB that nothing reads twice.
 *
 * Update strategy: network-first for the document, cache-first for everything
 *   hashed. Asset names carry their content hash, so a stale asset cannot be
 *   served against a new document; the document itself must always be offered
 *   fresh, or a cached broken shell could never be fixed by deploying. There is
 *   deliberately no skipWaiting: the database lock is per-tab, and yanking a
 *   live game to activate an update is worse than waiting for the next load.
 *
 * `self.__PRECACHE__` is injected by the build (see `swPlugin` in
 * vite.config.ts) because the hashed filenames do not exist until then.
 */
declare const __PRECACHE__: readonly string[]

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ENGINE = `engine-${VERSION}`

/** The engine is large and optional; it earns its cache entry on first use. */
const CACHE_ON_USE = /^\/engine\//

/** First-visit data, dead after it lands in the database. */
const NEVER_CACHE = /^\/games\//

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', ...__PRECACHE__])),
  )
})

self.addEventListener('activate', (event) => {
  // Drop caches from versions this worker no longer serves.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL && key !== ENGINE)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (event.request.method !== 'GET') return
  if (NEVER_CACHE.test(url.pathname)) return

  if (event.request.mode === 'navigate') {
    // Network first: the document is the one thing that must never be stale,
    // because it names the hashed assets. The cached copy is purely the
    // offline fallback.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(SHELL).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    )
    return
  }

  if (CACHE_ON_USE.test(url.pathname)) {
    event.respondWith(
      caches.open(ENGINE).then((cache) =>
        cache.match(event.request, { ignoreVary: true }).then(
          (cached) =>
            cached ??
            fetch(event.request).then((response) => {
              if (response.ok) void cache.put(event.request, response.clone())
              return response
            }),
        ),
      ),
    )
    return
  }

  /*
   * Hashed assets: the name is the version, so a hit is always correct.
   *
   * `ignoreVary` is load-bearing, not belt-and-braces. Module scripts are
   * requested with CORS metadata, the dev/preview server answers them with a
   * `Vary: Origin` header, and the precached copies were stored by `addAll`,
   * whose requests carry no Origin — so a spec-compliant match rejects every
   * one of them and the shell fails offline with ERR_FAILED while the cache
   * sits there full. The URL carries a content hash; nothing Vary could
   * distinguish is distinguishable here.
   */
  event.respondWith(
    caches
      .match(event.request, { ignoreVary: true })
      .then((cached) => cached ?? fetch(event.request)),
  )
})
