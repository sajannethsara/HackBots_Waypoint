/* Waypoint driver app – service worker.
 *
 * Goal: after the first sign-in the driver app opens and works with no signal.
 *  - App shell (/driver document) .... network first (3 s), saved copy when offline
 *  - /_next/static (JS, CSS, fonts) .. cache first in production, network first in dev
 *  - Map style, tiles, glyphs ........ cache first (Mapbox), so the route area stays available
 *  - /api/* .......................... never cached here; the app keeps its own data in IndexedDB
 */
const MODE = new URL(self.location.href).searchParams.get("mode") || "prod"
const SHELL = "wp-shell-v1"
const STATIC = "wp-static-v1"
const MAP = "wp-map-v1"
const KEEP = [SHELL, STATIC, MAP]
const MAP_LIMIT = 2500

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/logo.png"]).catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wp-") && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isMapHost = (u) => u.hostname === "api.mapbox.com" || u.hostname.endsWith(".tiles.mapbox.com")

async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName)
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))])
    if (res && res.ok && !res.redirected) cache.put(req, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: false })
    if (hit) return hit
    // Slow but reachable: wait for the real response instead of failing.
    if (err && err.message === "timeout") return fetch(req)
    throw err
  }
}

async function cacheFirst(req, cacheName, limit) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res && (res.ok || res.type === "opaque")) {
    cache.put(req, res.clone())
    if (limit) trim(cache, limit)
  }
  return res
}

let trimming = false
async function trim(cache, limit) {
  if (trimming) return
  trimming = true
  try {
    const keys = await cache.keys()
    if (keys.length > limit) await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)))
  } finally {
    trimming = false
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)

  if (isMapHost(url)) {
    event.respondWith(cacheFirst(req, MAP, MAP_LIMIT))
    return
  }
  if (url.origin !== self.location.origin) return

  // The driver document. RSC/prefetch requests are not navigations and pass through.
  if (req.mode === "navigate" && (url.pathname === "/driver" || url.pathname === "/driver/")) {
    const key = new Request(url.origin + "/driver")
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(SHELL)
          const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))])
          if (res && res.ok && !res.redirected) cache.put(key, res.clone())
          return res
        } catch (err) {
          const cache = await caches.open(SHELL)
          const hit = await cache.match(key)
          if (hit) return hit
          if (err && err.message === "timeout") return fetch(req)
          return new Response("<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:system-ui;padding:2rem'><h3>Waypoint is offline</h3><p>Open the app once with a connection so it can save itself to this phone.</p>", {
            status: 503,
            headers: { "content-type": "text/html" },
          })
        }
      })(),
    )
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(MODE === "prod" ? cacheFirst(req, STATIC) : networkFirst(req, STATIC, 4000))
    return
  }
  if (url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/logo")) {
    event.respondWith(networkFirst(req, SHELL, 3000))
  }
})

self.addEventListener("message", (event) => {
  const msg = event.data || {}
  const reply = (data) => event.ports && event.ports[0] && event.ports[0].postMessage(data)
  if (msg.type === "SKIP_WAITING") self.skipWaiting()
  if (msg.type === "CACHE_URLS") {
    event.waitUntil(
      (async () => {
        if (msg.doc) {
          try {
            const res = await fetch("/driver", { headers: { accept: "text/html" }, credentials: "same-origin" })
            const type = res.headers.get("content-type") || ""
            if (res.ok && !res.redirected && type.includes("text/html")) await (await caches.open(SHELL)).put(new Request(self.location.origin + "/driver"), res)
          } catch {}
        }
        const cache = await caches.open(STATIC)
        let ok = 0
        await Promise.all(
          (msg.urls || []).map(async (u) => {
            try {
              if (await cache.match(u)) return ok++
              const res = await fetch(u)
              if (res.ok) {
                await cache.put(u, res)
                ok++
              }
            } catch {}
          }),
        )
        reply({ type: "CACHE_URLS_DONE", ok, total: (msg.urls || []).length })
      })(),
    )
  }
  if (msg.type === "STATUS") {
    event.waitUntil(
      (async () => {
        const [statics, map, shell] = await Promise.all([caches.open(STATIC), caches.open(MAP), caches.open(SHELL)])
        const [a, b, c] = await Promise.all([statics.keys(), map.keys(), shell.keys()])
        reply({ type: "STATUS", statics: a.length, tiles: b.length, shell: c.length, hasDoc: !!(await shell.match(new Request(self.location.origin + "/driver"))) })
      })(),
    )
  }
})
