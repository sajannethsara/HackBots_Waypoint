import type { LatLng, LiveRoute, LiveRoutes, LiveSnapshot, LiveTrip } from "@waypoint/shared"

export interface LiveMapProps {
  snapshot: LiveSnapshot
  /** Trips after the page's filters. */
  trips: LiveTrip[]
  /** Road geometry per trip id (Google Routes). Straight lines are used when missing. */
  routes?: LiveRoutes
  selectedId: string | null
  onSelect: (id: string | null) => void
  theme: "light" | "dark"
  /** Space (px) covered by overlays on the right, kept clear when framing a trip. */
  rightInset?: number
  /** A stop to call out (e.g. the stop an issue was raised on). */
  highlightStopId?: string
}

const toLL = ([lat, lng]: [number, number]): LatLng => ({ lat, lng })

/** Legs as LatLng arrays: road geometry when available, otherwise straight stop-to-stop legs. */
export function tripLegs(t: LiveTrip, route?: LiveRoute): LatLng[][] {
  if (route?.legs.length === t.stops.length + 1) return route.legs.map((l) => l.map(toLL))
  return t.path.slice(1).map((p, i) => [t.path[i], p])
}

/**
 * Split a trip's route at the vehicle: everything up to its current position (travelled)
 * and the rest (ahead). Uses the leg + distance fraction the server reports, so the cut
 * lands exactly where the vehicle is on the road.
 */
export function splitRoute(t: LiveTrip, route?: LiveRoute): { done: LatLng[]; ahead: LatLng[] } {
  const legs = tripLegs(t, route)
  const flat = (ls: LatLng[][]) => ls.flatMap((l, i) => (i === 0 ? l : l.slice(1)))
  if (t.status === "SCHEDULED" || t.status === "LOADING") return { done: [], ahead: flat(legs) }
  if (t.leg >= legs.length) return { done: flat(legs), ahead: [] }
  const current = legs[t.leg] ?? []
  const cut = cutAt(current, t.legProgress)
  return {
    done: [...flat(legs.slice(0, t.leg)), ...cut.before, t.position],
    ahead: [t.position, ...cut.after, ...flat(legs.slice(t.leg + 1))],
  }
}

/** Points of a polyline before / after fraction `f` of its length. */
function cutAt(pts: LatLng[], f: number): { before: LatLng[]; after: LatLng[] } {
  if (pts.length < 2) return { before: pts, after: [] }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    const k = Math.cos((pts[i - 1].lat * Math.PI) / 180)
    cum.push(cum[i - 1] + Math.hypot(pts[i].lat - pts[i - 1].lat, (pts[i].lng - pts[i - 1].lng) * k))
  }
  const d = f * cum[cum.length - 1]
  const i = cum.findIndex((c) => c > d)
  if (i === -1) return { before: pts, after: [] }
  return { before: pts.slice(0, i), after: pts.slice(i) }
}

/** Bounds-friendly list of every point of a trip (road geometry + stops). */
export function tripPoints(t: LiveTrip, route?: LiveRoute): LatLng[] {
  return [...tripLegs(t, route).flat(), ...t.stops.map((s) => s.position)]
}
