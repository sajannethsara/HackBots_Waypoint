import type { LatLng, LiveRoute, LiveTrip } from "@waypoint/shared"

const toLL = ([lat, lng]: [number, number]): LatLng => ({ lat, lng })

/** One road leg per stop (depot → stop 1, stop 1 → stop 2 …): Mapbox geometry when complete, else straight lines. */
export function tripLegs(trip: LiveTrip, route?: LiveRoute | null): LatLng[][] {
  if (route && route.legs.length === trip.stops.length + 1) return route.legs.map((leg) => leg.map(toLL))
  return trip.path.slice(1).map((p, i) => [trip.path[i], p])
}

/** Points of a polyline before / after fraction `f` of its length (distance along the line, not point count). */
export function cutAt(pts: LatLng[], f: number): { before: LatLng[]; after: LatLng[] } {
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

/**
 * The road still ahead between the vehicle and the stop at index `stopIndex`: the rest of the leg it is on,
 * then every whole leg up to that stop. Nothing beyond the stop, so the route never reveals later outlets.
 */
export function roadAheadTo(trip: LiveTrip, stopIndex: number, route?: LiveRoute | null): LatLng[] {
  if (trip.leg > stopIndex) return [] // already at or past this stop
  const legs = tripLegs(trip, route)
  const current = legs[trip.leg] ?? []
  const rest = cutAt(current, trip.legProgress).after
  const later = legs.slice(trip.leg + 1, stopIndex + 1)
  const flat = [...rest, ...later.flatMap((l) => l.slice(1))]
  return flat.length ? [trip.position, ...flat] : []
}
