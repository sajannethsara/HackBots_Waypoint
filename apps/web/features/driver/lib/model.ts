import type { DriverBundle, DriverEventInput, DriverStop, DriverTrip, LatLng } from "@waypoint/shared"

/** Pure helpers over the downloaded bundle. The phone applies its own events locally first. */

export const isDone = (s: DriverStop) => s.status === "DELIVERED" || s.status === "PARTIAL" || s.status === "REFUSED" || s.status === "SKIPPED"

/** Apply one driver event to the bundle (optimistic local state; the server replays the same event). */
export function applyEvent(bundle: DriverBundle, ev: DriverEventInput): DriverBundle {
  return {
    ...bundle,
    trips: bundle.trips.map((t) => {
      if (t.id !== ev.tripId) return t
      if (ev.type === "TRIP_DEPARTED") return { ...t, status: "DEPARTED", departedAt: t.departedAt ?? ev.occurredAt }
      if (ev.type === "TRIP_COMPLETED") return { ...t, status: "COMPLETED", completedAt: ev.occurredAt }
      return {
        ...t,
        stops: t.stops.map((s) => {
          if (s.id !== ev.stopId) return s
          if (ev.type === "ARRIVED") return s.status === "PENDING" ? { ...s, status: "ARRIVED", arrivedAt: ev.occurredAt } : s
          if (isDone(s)) return s
          return { ...s, status: ev.type as "DELIVERED" | "PARTIAL" | "REFUSED", completedAt: ev.occurredAt, arrivedAt: s.arrivedAt ?? ev.occurredAt }
        }),
      }
    }),
  }
}

/** The trip the driver is working on: the first one that is not finished. */
export function currentTrip(b: DriverBundle | null): DriverTrip | null {
  return b?.trips.find((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED") ?? null
}

export const nextStop = (t: DriverTrip | null): DriverStop | null => t?.stops.find((s) => !isDone(s)) ?? null
export const upcomingStops = (t: DriverTrip) => t.stops.filter((s) => !isDone(s))
export const doneStops = (t: DriverTrip) => t.stops.filter(isDone)

export const tripStarted = (t: DriverTrip | null) => t?.status === "DEPARTED"

/** Haversine distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function bearing(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export const fmtDistance = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`)

/** Rough drive time from a straight-line distance (road factor 1.35 at 30 km/h urban average). */
export const driveMinutes = (m: number) => Math.max(1, Math.round(((m * 1.35) / 1000 / 30) * 60))

export type StopTiming = { tone: "ok" | "warn" | "late"; label: string; etaMin: number }

/** Expected arrival and whether it meets the receiving window. */
export function stopTiming(s: DriverStop, nowMin: number, from?: LatLng | null): StopTiming {
  const drive = from ? driveMinutes(distanceM(from, s.outlet.position)) : null
  const eta = Math.max(drive != null ? nowMin + drive : s.plannedArrivalMin, s.plannedArrivalMin)
  if (eta > s.windowCloseMin) return { tone: "late", label: nowMin > s.windowCloseMin ? "Window closed" : "Will miss window", etaMin: Math.round(eta) }
  if (eta > s.plannedArrivalMin + 10) return { tone: "warn", label: `${Math.round(eta - s.plannedArrivalMin)} min late`, etaMin: Math.round(eta) }
  return { tone: "ok", label: "On time", etaMin: Math.round(eta) }
}

/** Flatten a trip's road legs into one [lat, lng] list per leg, as LatLng. */
export function legPoints(t: DriverTrip, legIndex: number): LatLng[] {
  const leg = t.legs?.[legIndex]
  if (leg && leg.length > 1) return leg.map(([lat, lng]) => ({ lat, lng }))
  const from = legIndex === 0 ? t.depot.position : t.stops[legIndex - 1]?.outlet.position
  const to = t.stops[legIndex]?.outlet.position ?? t.depot.position
  return from ? [from, to] : []
}

export function allRoutePoints(t: DriverTrip): LatLng[] {
  return Array.from({ length: t.stops.length + 1 }, (_, i) => legPoints(t, i)).flat()
}

export const greeting = (nowMin: number) => (nowMin < 12 * 60 ? "Good morning" : nowMin < 17 * 60 ? "Good afternoon" : "Good evening")

export const tripOutcome = (t: DriverTrip) => ({
  delivered: t.stops.filter((s) => s.status === "DELIVERED").length,
  partial: t.stops.filter((s) => s.status === "PARTIAL").length,
  refused: t.stops.filter((s) => s.status === "REFUSED" || s.status === "SKIPPED").length,
})
