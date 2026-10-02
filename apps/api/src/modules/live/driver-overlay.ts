import type { LatLng, LiveStop, LiveTrip } from "@waypoint/shared"

/**
 * When a driver is running a trip from the app, what they report is the truth: stops they have
 * completed or arrived at, and their latest GPS fix. This overlays that on the replayed trip so the
 * dispatcher sees the real vehicle. Trips nobody has started stay on the replay.
 */

export interface DriverTripState {
  id: string
  status: string
  departedAt: Date | null
  stops: { id: string; status: string; completedAt: Date | null }[]
  fix: { lat: number; lng: number; heading: number | null; capturedAt: Date; simulated: boolean } | null
}

const DONE = new Set(["DELIVERED", "PARTIAL", "REFUSED", "SKIPPED"])
const FIX_FRESH_MIN = 20

const d2 = (a: LatLng, b: LatLng) => {
  const k = Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(b.lat - a.lat, (b.lng - a.lng) * k)
}

export function overlayDriver(sim: LiveTrip, driver: DriverTripState | undefined, now = Date.now()): LiveTrip {
  if (!driver || (!driver.departedAt && driver.status !== "COMPLETED" && driver.status !== "DEPARTED")) return sim

  const byId = new Map(driver.stops.map((s) => [s.id, s]))
  const stops: LiveStop[] = sim.stops.map((s) => {
    const d = byId.get(s.id)
    if (!d) return s
    if (DONE.has(d.status)) return { ...s, status: "COMPLETED", completedMin: s.completedMin ?? s.etaMin }
    if (d.status === "ARRIVED") return { ...s, status: "IN_PROGRESS", completedMin: null }
    return { ...s, status: "PENDING", completedMin: null }
  })
  const done = stops.filter((s) => s.status === "COMPLETED").length
  const at = stops.find((s) => s.status === "IN_PROGRESS")
  const next = stops.find((s) => s.status !== "COMPLETED") ?? null

  const age = driver.fix ? (now - driver.fix.capturedAt.getTime()) / 60_000 : null
  const depot = sim.path[0]
  const fresh = driver.fix && age != null && age <= FIX_FRESH_MIN
  const position: LatLng = driver.fix ? { lat: driver.fix.lat, lng: driver.fix.lng } : done > 0 ? stops[done - 1].position : depot

  // Progress along the current leg, from the last stop passed to the next one.
  const from = done === 0 ? depot : stops[done - 1].position
  const to = next ? next.position : depot
  const total = d2(from, position) + d2(position, to)
  const legProgress = total > 0 ? Math.max(0, Math.min(1, d2(from, position) / total)) : 0

  let status: LiveTrip["status"]
  let label: string
  if (driver.status === "COMPLETED") {
    status = "COMPLETED"
    label = "Back at depot"
  } else if (at) {
    status = "AT_OUTLET"
    label = `Unloading at ${at.outletId}`
  } else if (!next) {
    status = "RETURNING"
    label = "Returning to depot"
  } else {
    status = "ON_ROUTE"
    label = `En route to ${next.outletId}`
  }
  const delayMin = next ? next.delayMin : 0
  if (delayMin >= 15 && (status === "ON_ROUTE" || status === "AT_OUTLET")) status = "DELAYED"

  return {
    ...sim,
    status,
    delayMin,
    position,
    heading: driver.fix?.heading ?? sim.heading,
    locationLabel: fresh || driver.status === "COMPLETED" ? label : `${label} · last seen ${age == null ? "never" : `${Math.round(age)} min ago`}`,
    progressPct: stops.length ? Math.round((done / stops.length) * 100) : 0,
    stopsDone: done,
    actualDepartMin: sim.actualDepartMin ?? Math.round(sim.plannedDepartMin),
    nextStop: next ? { outletId: next.outletId, etaMin: next.etaMin } : null,
    stops,
    pathIndex: driver.status === "COMPLETED" ? sim.path.length - 1 : done + (at ? 1 : 0),
    leg: driver.status === "COMPLETED" ? stops.length + 1 : at ? done + 1 : done,
    legProgress: at ? 0 : legProgress,
    reported: { lastFixAt: driver.fix?.capturedAt.toISOString() ?? null, fixAgeMin: age == null ? null : Math.round(age), simulated: driver.fix?.simulated ?? false },
  }
}
