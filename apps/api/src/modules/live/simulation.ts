import type { Brand, LatLng, LiveAlert, LiveStop, LiveTrip, LiveTripStatus } from "@waypoint/shared"

/**
 * Deterministic replay of a published plan.
 *
 * Planned times use free-flow travel. Here each trip is "driven" with the congestion and
 * disruption recorded for that district and date (traffic_speed.csv, road_conditions.csv),
 * plus small per-trip variation, so some trips run late exactly where the data says roads
 * were slow. Driver events from the field app will replace these simulated times.
 */

export interface SimStop {
  id: string
  orderId: string
  seq: number
  orderRef: string
  outletId: string
  outletName: string
  position: LatLng
  plannedArrivalMin: number
  plannedServiceMin: number
  windowOpenMin: number
  windowCloseMin: number
}

export interface SimTrip {
  id: string
  ref: string
  brand: Brand
  districtId: string
  vehicleId: string
  vehicleLabel: string
  driver: { name: string; phone: string | null } | null
  plannedDepartMin: number
  plannedDurationMin: number
  plannedKm: number
  outboundMin: number
  interStopMin: number
  /** ≥ 1: how much slower than free flow roads were (traffic × disruption). */
  roadFactor: number
  depot: LatLng
  stops: SimStop[]
  /** Road polylines per leg (depot → stop 1 … stop n → depot). Straight lines when absent. */
  legs?: LatLng[][]
}

type Segment =
  | { kind: "travel"; from: LatLng; to: LatLng; t0: number; t1: number; stopIdx: number; pathIdx: number; geo: LegGeo }
  | { kind: "wait" | "service"; at: LatLng; t0: number; t1: number; stopIdx: number; pathIdx: number }

/** A leg polyline with cumulative distances, so positions can be placed by distance travelled. */
interface LegGeo {
  pts: LatLng[]
  cum: number[]
  total: number
}

function legGeo(pts: LatLng[]): LegGeo {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const k = Math.cos((a.lat * Math.PI) / 180)
    cum.push(cum[i - 1] + Math.hypot(b.lat - a.lat, (b.lng - a.lng) * k))
  }
  return { pts, cum, total: cum[cum.length - 1] || 1e-9 }
}

/** Point and compass heading at fraction `f` of the leg distance. */
function along(g: LegGeo, f: number): { pos: LatLng; heading: number } {
  const d = Math.max(0, Math.min(1, f)) * g.total
  let i = 1
  while (i < g.cum.length - 1 && g.cum[i] < d) i++
  const a = g.pts[i - 1]
  const b = g.pts[i] ?? a
  const span = g.cum[i] - g.cum[i - 1] || 1e-9
  const t = Math.max(0, Math.min(1, (d - g.cum[i - 1]) / span))
  return { pos: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, heading: bearing(a, b) }
}

interface Timeline {
  depart: number
  segments: Segment[]
  arrivals: number[]
  completions: number[]
  returnAt: number
}

/** Small deterministic PRNG keyed by trip id. */
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildTimeline(trip: SimTrip): Timeline {
  const r = rng(trip.id)
  const slip = Math.floor(r() * 9) // loading over-run
  const travelFactor = trip.roadFactor * (0.92 + r() * 0.16)
  let t = trip.plannedDepartMin + slip
  let pos = trip.depot
  const segments: Segment[] = []
  const arrivals: number[] = []
  const completions: number[] = []

  trip.stops.forEach((s, i) => {
    const travel = (i === 0 ? trip.outboundMin : trip.interStopMin) * travelFactor
    const arrive = t + travel
    segments.push({ kind: "travel", from: pos, to: s.position, t0: t, t1: arrive, stopIdx: i, pathIdx: i, geo: legGeo(trip.legs?.[i] ?? [pos, s.position]) })
    const start = Math.max(arrive, s.windowOpenMin)
    if (start > arrive) segments.push({ kind: "wait", at: s.position, t0: arrive, t1: start, stopIdx: i, pathIdx: i + 1 })
    const end = start + s.plannedServiceMin * (0.85 + r() * 0.35)
    segments.push({ kind: "service", at: s.position, t0: start, t1: end, stopIdx: i, pathIdx: i + 1 })
    arrivals.push(arrive)
    completions.push(end)
    t = end
    pos = s.position
  })
  const back = t + trip.outboundMin * travelFactor
  const n = trip.stops.length
  segments.push({ kind: "travel", from: pos, to: trip.depot, t0: t, t1: back, stopIdx: n, pathIdx: n, geo: legGeo(trip.legs?.[n] ?? [pos, trip.depot]) })
  return { depart: trip.plannedDepartMin + slip, segments, arrivals, completions, returnAt: back }
}

/** Compass bearing in degrees (0 = north, 90 = east). */
const bearing = (a: LatLng, b: LatLng) => {
  const k = Math.cos((a.lat * Math.PI) / 180)
  return ((Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180) / Math.PI + 360) % 360
}

export function tripAt(trip: SimTrip, tl: Timeline, now: number): LiveTrip {
  const path = [trip.depot, ...trip.stops.map((s) => s.position), trip.depot]
  const stops: LiveStop[] = trip.stops.map((s, i) => {
    const arrived = now >= tl.arrivals[i]
    const done = now >= tl.completions[i]
    const eta = Math.round(tl.arrivals[i])
    return {
      id: s.id,
      orderId: s.orderId,
      seq: s.seq,
      orderRef: s.orderRef,
      outletId: s.outletId,
      outletName: s.outletName,
      position: s.position,
      windowOpenMin: s.windowOpenMin,
      windowCloseMin: s.windowCloseMin,
      plannedArrivalMin: s.plannedArrivalMin,
      etaMin: eta,
      completedMin: done ? Math.round(tl.completions[i]) : null,
      delayMin: Math.max(0, eta - s.plannedArrivalMin),
      status: done ? "COMPLETED" : arrived ? "IN_PROGRESS" : "PENDING",
      late: eta > s.windowCloseMin,
    }
  })

  let status: LiveTripStatus
  let position = trip.depot
  let heading = 0
  let pathIndex = 0
  let leg = 0
  let legProgress = 0
  let locationLabel = "At depot"
  const current = tl.segments.find((seg) => now >= seg.t0 && now < seg.t1)

  if (now < tl.depart) {
    status = now >= tl.depart - 30 ? "LOADING" : "SCHEDULED"
    locationLabel = status === "LOADING" ? "Loading at depot" : "At depot"
  } else if (now >= tl.returnAt) {
    status = "COMPLETED"
    pathIndex = path.length - 1
    leg = trip.stops.length + 1
    locationLabel = "Back at depot"
  } else if (current?.kind === "travel") {
    const f = (now - current.t0) / Math.max(0.01, current.t1 - current.t0)
    const p = along(current.geo, f)
    position = p.pos
    heading = p.heading
    pathIndex = current.pathIdx
    leg = current.stopIdx
    legProgress = Math.round(f * 1000) / 1000
    const returning = current.stopIdx >= trip.stops.length
    status = returning ? "RETURNING" : "ON_ROUTE"
    locationLabel = returning ? "Returning to depot" : `En route to ${trip.stops[current.stopIdx].outletId}`
  } else if (current) {
    position = current.at
    pathIndex = current.pathIdx
    leg = current.stopIdx + 1
    status = "AT_OUTLET"
    locationLabel = `${current.kind === "wait" ? "Waiting at" : "Unloading at"} ${trip.stops[current.stopIdx].outletId}`
  } else {
    status = "ON_ROUTE"
  }

  const next = stops.find((s) => s.status !== "COMPLETED") ?? null
  const delayMin = next ? next.delayMin : 0
  if (delayMin >= 15 && (status === "ON_ROUTE" || status === "AT_OUTLET")) status = "DELAYED"
  const stopsDone = stops.filter((s) => s.status === "COMPLETED").length

  return {
    id: trip.id,
    ref: trip.ref,
    brand: trip.brand,
    districtId: trip.districtId,
    vehicleId: trip.vehicleId,
    vehicleLabel: trip.vehicleLabel,
    driver: trip.driver,
    status,
    delayMin,
    position,
    heading,
    locationLabel,
    progressPct: trip.stops.length ? Math.round((stopsDone / trip.stops.length) * 100) : 0,
    stopsDone,
    plannedDepartMin: trip.plannedDepartMin,
    actualDepartMin: now >= tl.depart ? Math.round(tl.depart) : null,
    plannedDurationMin: trip.plannedDurationMin,
    plannedKm: trip.plannedKm,
    etaReturnMin: Math.round(tl.returnAt),
    nextStop: next ? { outletId: next.outletId, etaMin: next.etaMin } : null,
    stops,
    path,
    pathIndex,
    leg,
    legProgress,
  }
}

/** Alerts a dispatcher would want, as of `now` (most recent first). */
export function alertsAt(trips: LiveTrip[], now: number): LiveAlert[] {
  const out: LiveAlert[] = []
  for (const t of trips) {
    for (const s of t.stops) {
      if (s.status === "COMPLETED" && s.completedMin != null && now - s.completedMin < 90)
        out.push({
          id: `${s.id}-done`,
          atMin: s.completedMin,
          severity: s.late ? "medium" : "ok",
          title: `${s.outletId} delivered${s.late ? " late" : ""}`,
          detail: `${t.ref} · ${s.late ? `${s.etaMin - s.windowCloseMin} min after window` : "within window"}`,
          tripId: t.id,
        })
      if (s.status === "PENDING" && s.late && t.status !== "SCHEDULED")
        out.push({
          id: `${s.id}-late`,
          atMin: now,
          severity: "high",
          title: `${s.outletId} will miss its window`,
          detail: `ETA ${hhmm(s.etaMin)}, closes ${hhmm(s.windowCloseMin)} · ${t.vehicleId}`,
          tripId: t.id,
        })
    }
    if (t.status === "DELAYED")
      out.push({
        id: `${t.id}-delay`,
        atMin: now,
        severity: t.delayMin >= 30 ? "high" : "medium",
        title: `${t.vehicleId} running ${t.delayMin} min late`,
        detail: `${t.ref} · ${t.districtId} · next ${t.nextStop?.outletId ?? "—"}`,
        tripId: t.id,
      })
    if (t.actualDepartMin != null && now - t.actualDepartMin < 30 && t.status !== "COMPLETED")
      out.push({
        id: `${t.id}-dep`,
        atMin: t.actualDepartMin,
        severity: "low",
        title: `${t.vehicleId} departed`,
        detail: `${t.ref} · ${t.stops.length} stops · ${t.districtId}`,
        tripId: t.id,
      })
  }
  const rank = { high: 0, medium: 1, low: 2, ok: 3 }
  return out.sort((a, b) => b.atMin - a.atMin || rank[a.severity] - rank[b.severity]).slice(0, 12)
}

const hhmm = (m: number) => {
  const r = Math.round(m)
  return `${String(Math.floor(r / 60) % 24).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`
}
