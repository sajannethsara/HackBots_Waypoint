"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DriverConfig, DriverLocationInput, DriverStop, DriverTrip, LatLng } from "@waypoint/shared"
import { bearing, distanceM, legPoints } from "./model"
import { uid } from "./idb"

/**
 * Location for the driver app.
 *  - Reporting: while a trip is running, one fix is queued every `pingSeconds` (240 s in production)
 *    and at every stop action. Web apps cannot track in the background, so the screen is kept awake
 *    with a Wake Lock while the trip runs.
 *  - Display: the map follows the phone with `watch` while it is on screen (not reported).
 *  - Demo mode: no GPS needed; the phone "drives" the planned road route to the next stop.
 */

export interface GpsFix {
  lat: number
  lng: number
  accuracyM: number | null
  speedKmh: number | null
  heading: number | null
  at: string
  simulated: boolean
}

export type GpsPermission = "granted" | "prompt" | "denied" | "unsupported"

const DEMO_SPEED_MPS = 260

function polyline(pts: LatLng[]) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]))
  return { pts, cum, total: cum[cum.length - 1] }
}

function pointAt(p: ReturnType<typeof polyline>, d: number): { pos: LatLng; heading: number } {
  const dist = Math.max(0, Math.min(p.total, d))
  let i = 1
  while (i < p.cum.length - 1 && p.cum[i] < dist) i++
  const a = p.pts[i - 1]
  const b = p.pts[i] ?? a
  const span = p.cum[i] - p.cum[i - 1] || 1
  const t = Math.max(0, Math.min(1, (dist - p.cum[i - 1]) / span))
  return { pos: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, heading: bearing(a, b) }
}

interface Args {
  trip: DriverTrip | null
  next: DriverStop | null
  config: DriverConfig
  running: boolean
  /** Demo mode: the road the simulated phone should follow, set by navigation. */
  demoPath: React.MutableRefObject<{ key: string; points: LatLng[] } | null>
  /** Demo mode: drive even though the trip has not started (navigating to the depot). */
  driveIdle: boolean
  enqueue: (loc: DriverLocationInput) => void
  flush: () => void
}

export function useGps({ trip, next, config, running, demoPath, driveIdle, enqueue, flush }: Args) {
  const [position, setPosition] = useState<GpsFix | null>(null)
  const [permission, setPermission] = useState<GpsPermission>("prompt")
  const [lastPingAt, setLastPingAt] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const watchers = useRef(0)
  const watchId = useRef<number | null>(null)
  const posRef = useRef<GpsFix | null>(null)
  const tripRef = useRef(trip)
  useEffect(() => {
    tripRef.current = trip
  })

  const supported = typeof navigator !== "undefined" && "geolocation" in navigator && (typeof window === "undefined" || window.isSecureContext)

  const store = useCallback((fix: GpsFix) => {
    posRef.current = fix
    setPosition(fix)
  }, [])

  const fromBrowser = useCallback(
    (p: GeolocationPosition): GpsFix => ({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracyM: p.coords.accuracy ?? null,
      speedKmh: p.coords.speed != null ? Math.round(p.coords.speed * 3.6) : null,
      heading: p.coords.heading ?? null,
      at: new Date(p.timestamp).toISOString(),
      simulated: false,
    }),
    [],
  )

  // ── Permission ──
  useEffect(() => {
    if (!supported) return
    let status: PermissionStatus | undefined
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((s) => {
        status = s
        setPermission(s.state as GpsPermission)
        s.onchange = () => setPermission(s.state as GpsPermission)
      })
      .catch(() => {})
    return () => {
      if (status) status.onchange = null
    }
  }, [supported])

  const getFix = useCallback(
    () =>
      new Promise<GpsFix>((resolve, reject) => {
        if (!supported) return reject(new Error("Location needs a secure (HTTPS) connection"))
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(fromBrowser(p)),
          (e) => reject(new Error(e.code === 1 ? "Location permission denied" : "Could not get a GPS fix")),
          { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
        )
      }),
    [supported, fromBrowser],
  )

  /** Ask the browser for location (shows the permission prompt). */
  const requestPermission = useCallback(async () => {
    if (config.demo) return true
    try {
      store(await getFix())
      setLastError(null)
      setPermission("granted")
      return true
    } catch (e) {
      setLastError((e as Error).message)
      return false
    }
  }, [config.demo, getFix, store])

  // ── Demo mode: drive the road ──
  // Before the trip the phone starts a few km from the depot; while navigating it follows the
  // navigation route, otherwise the planned leg to the next stop.
  const sim = useRef<{ key: string; dist: number } | null>(null)
  useEffect(() => {
    if (!config.demo || !trip || !(running || driveIdle)) return
    const t = trip
    const id = setInterval(() => {
      const cur = tripRef.current ?? t
      const idx = cur.stops.findIndex((s) => s.status !== "DELIVERED" && s.status !== "PARTIAL" && s.status !== "REFUSED" && s.status !== "SKIPPED")
      const leg = idx === -1 ? cur.stops.length : idx
      const nav = demoPath.current
      if (!nav && !running) return
      const key = nav?.key ?? `${cur.id}:leg${leg}`
      if (!sim.current || sim.current.key !== key) sim.current = { key, dist: 0 }
      const line = polyline(nav?.points ?? legPoints(cur, leg))
      if (line.pts.length < 2) return
      const holding = idx !== -1 && cur.stops[idx].status === "ARRIVED"
      if (!holding) sim.current.dist = Math.min(line.total, sim.current.dist + DEMO_SPEED_MPS)
      const { pos, heading } = pointAt(line, sim.current.dist)
      const moving = !holding && sim.current.dist < line.total
      store({ lat: pos.lat, lng: pos.lng, accuracyM: 8, speedKmh: moving ? 42 : 0, heading, at: new Date().toISOString(), simulated: true })
    }, 1000)
    return () => clearInterval(id)
  }, [config.demo, running, driveIdle, trip, store, demoPath])

  // Before departure in demo mode the vehicle waits ~3.5 km from the depot, on the first road leg.
  useEffect(() => {
    if (!config.demo || running || !trip || posRef.current) return
    const line = polyline(legPoints(trip, 0))
    const at = line.pts.length > 1 ? pointAt(line, Math.min(3500, line.total * 0.6)) : { pos: trip.depot.position, heading: 0 }
    store({ ...at.pos, accuracyM: 8, speedKmh: 0, heading: at.heading, at: new Date().toISOString(), simulated: true })
  }, [config.demo, running, trip, store])

  // ── Reporting ──
  const pingNow = useCallback(async () => {
    const cur = tripRef.current
    let fix: GpsFix | null = null
    if (config.demo) fix = posRef.current
    else {
      try {
        fix = await getFix()
        store(fix)
        setLastError(null)
      } catch (e) {
        setLastError((e as Error).message)
      }
    }
    if (!fix) return
    enqueue({
      id: uid(),
      tripId: cur?.id,
      lat: +fix.lat.toFixed(6),
      lng: +fix.lng.toFixed(6),
      accuracyM: fix.accuracyM ?? undefined,
      speedKmh: fix.speedKmh ?? undefined,
      heading: fix.heading ?? undefined,
      simulated: fix.simulated,
      capturedAt: fix.at,
    })
    setLastPingAt(new Date().toISOString())
    flush()
  }, [config.demo, enqueue, flush, getFix, store])

  const pingRef = useRef(pingNow)
  useEffect(() => {
    pingRef.current = pingNow
  })

  useEffect(() => {
    if (!running) return
    const first = setTimeout(() => void pingRef.current(), config.demo ? 1500 : 0)
    const id = setInterval(() => void pingRef.current(), config.pingSeconds * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [running, config.pingSeconds, config.demo])

  // ── Keep the screen awake while a trip runs ──
  useEffect(() => {
    if (!running || typeof navigator === "undefined" || !("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let stopped = false
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && !stopped) lock = await navigator.wakeLock.request("screen")
      } catch {}
    }
    void acquire()
    const onVisible = () => void acquire()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      document.removeEventListener("visibilitychange", onVisible)
      void lock?.release().catch(() => {})
    }
  }, [running])

  // ── Live position for the map while it is on screen (not reported) ──
  const watch = useCallback(
    (on: boolean) => {
      if (config.demo || !supported) return () => {}
      if (!on) return () => {}
      watchers.current++
      if (watchId.current == null)
        watchId.current = navigator.geolocation.watchPosition((p) => store(fromBrowser(p)), () => {}, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 })
      return () => {
        watchers.current--
        if (watchers.current <= 0 && watchId.current != null) {
          navigator.geolocation.clearWatch(watchId.current)
          watchId.current = null
          watchers.current = 0
        }
      }
    },
    [config.demo, supported, store, fromBrowser],
  )

  const atNext = position && next ? distanceM(position, next.outlet.position) <= config.arriveRadiusM : false
  return { position, permission: supported ? permission : ("unsupported" as GpsPermission), lastPingAt, lastError, requestPermission, pingNow, watch, atNext, supported }
}
