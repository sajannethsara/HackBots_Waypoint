import type { DriverTrip } from "@waypoint/shared"
import { allRoutePoints } from "./model"

/** Everything that makes the driver app usable with no signal: service worker, cached code, cached map. */

export const MAP_STYLE = { light: "mapbox://styles/mapbox/light-v11", dark: "mapbox://styles/mapbox/dark-v11" } as const

export type SwState = "ready" | "unsupported" | "failed"

export async function registerServiceWorker(): Promise<SwState> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return "unsupported"
  try {
    const mode = process.env.NODE_ENV === "production" ? "prod" : "dev"
    const reg = await navigator.serviceWorker.register(`/sw.js?mode=${mode}`, { scope: "/driver", updateViaCache: "none" })
    // `ready` never settles when the page was reached by client-side navigation from outside the scope, so watch the worker itself.
    const worker = reg.installing ?? reg.waiting ?? reg.active
    if (worker && worker.state !== "activated")
      await new Promise<void>((resolve) => {
        const on = () => {
          if (worker.state === "activated") resolve()
        }
        worker.addEventListener("statechange", on)
        setTimeout(resolve, 8000)
      })
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true })
        setTimeout(resolve, 1500)
      })
    return "ready"
  } catch {
    return "failed"
  }
}

function toWorker<T>(message: unknown, timeoutMs = 20_000): Promise<T | null> {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker?.controller
    if (!sw) return resolve(null)
    const ch = new MessageChannel()
    const timer = setTimeout(() => resolve(null), timeoutMs)
    ch.port1.onmessage = (e) => {
      clearTimeout(timer)
      resolve(e.data as T)
    }
    sw.postMessage(message, [ch.port2])
  })
}

export interface CacheStatus {
  statics: number
  tiles: number
  shell: number
  hasDoc: boolean
}
export const cacheStatus = () => toWorker<CacheStatus>({ type: "STATUS" }, 4000)

/** Ask the worker to hold every script and stylesheet this page loaded, plus the app document. */
export async function cacheLoadedAssets(): Promise<{ ok: number; total: number } | null> {
  const origin = location.origin
  const urls = new Set<string>()
  for (const e of performance.getEntriesByType("resource")) if (e.name.startsWith(`${origin}/_next/static/`)) urls.add(e.name)
  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel=stylesheet], link[rel=preload][as=font]").forEach((el) => {
    const u = "src" in el ? el.src : el.href
    if (u?.startsWith(`${origin}/_next/static/`)) urls.add(u)
  })
  // `doc` asks the worker to store the app document itself, so the app opens with no signal.
  const res = await toWorker<{ ok: number; total: number }>({ type: "CACHE_URLS", urls: [...urls], doc: true }, 30_000)
  return res
}

/**
 * Walk a hidden map over the route so the style and tiles for the trip land in the worker's cache.
 * Resolves with how many places were loaded. Never throws: the map is a bonus offline, not a blocker.
 */
export async function warmMapTiles(token: string, trip: DriverTrip, onProgress?: (done: number, total: number) => void): Promise<number> {
  try {
    const mapboxgl = (await import("mapbox-gl")).default
    const holder = document.createElement("div")
    Object.assign(holder.style, { position: "fixed", left: "-9999px", top: "0", width: "420px", height: "760px", pointerEvents: "none", visibility: "hidden" })
    document.body.appendChild(holder)
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: holder,
      style: MAP_STYLE.light,
      center: [trip.depot.position.lng, trip.depot.position.lat],
      zoom: 10,
      interactive: false,
      fadeDuration: 0,
      attributionControl: false,
      trackResize: false,
    })
    const idle = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms)
        map.once("idle", () => {
          clearTimeout(timer)
          resolve()
        })
      })
    await new Promise<void>((resolve, reject) => {
      map.once("load", () => resolve())
      map.once("error", (e) => reject(e.error))
      setTimeout(() => reject(new Error("map load timeout")), 15_000)
    })

    const pts = allRoutePoints(trip)
    const bounds = new mapboxgl.LngLatBounds()
    pts.forEach((p) => bounds.extend([p.lng, p.lat]))
    const targets = [trip.depot.position, ...trip.stops.map((s) => s.outlet.position)]
    const total = targets.length + 1
    let done = 0
    map.fitBounds(bounds, { padding: 20, animate: false })
    await idle(10_000)
    onProgress?.(++done, total)
    for (const t of targets) {
      map.jumpTo({ center: [t.lng, t.lat], zoom: 14 })
      await idle(8_000)
      onProgress?.(++done, total)
    }
    map.remove()
    holder.remove()
    return done
  } catch {
    return 0
  }
}
