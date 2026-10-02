import type { DriverTrip, LatLng } from "@waypoint/shared"
import { bearing, distanceM, legPoints } from "./model"

/**
 * In-app turn-by-turn navigation.
 *  - Online: Mapbox Directions from the phone's position to the target (re-fetched when off route).
 *  - No signal: the planned road leg saved with the trip (with its steps), else a straight-line heading.
 */

export interface NavStep {
  text: string
  type: string
  mod: string | null
  name: string
  /** Distance along the route (m) at which this maneuver happens. */
  at: number
  location: LatLng
}

export interface NavRoute {
  source: "live" | "planned" | "straight"
  points: LatLng[]
  /** Cumulative distance (m) at each point. */
  cum: number[]
  total: number
  /** Seconds, as estimated by the router (live) or by average speed (otherwise). */
  duration: number
  steps: NavStep[]
}

export interface Guidance {
  /** The next maneuver, or the arrival step. */
  next: NavStep | null
  distToNext: number
  remainingM: number
  remainingSec: number
  /** Distance from the route line (m). */
  offRouteM: number
  /** Index of the route point just passed. */
  index: number
  /** Heading (deg) of the route at the current position. */
  routeBearing: number
}

const AVG_MPS = 8.3 // 30 km/h urban average when the router gave no duration

function cumulative(points: LatLng[]) {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distanceM(points[i - 1], points[i]))
  return cum
}

/** Where along `points` a maneuver location sits: nearest point at or after `from`. */
function locate(points: LatLng[], cum: number[], p: LatLng, from: number): { index: number; dist: number } {
  let best = from
  let bestD = Infinity
  for (let i = from; i < points.length; i++) {
    const d = distanceM(points[i], p)
    if (d < bestD) {
      bestD = d
      best = i
    }
    if (bestD < 8 && d > bestD + 200) break
  }
  return { index: best, dist: cum[best] }
}

function build(source: NavRoute["source"], points: LatLng[], raw: { text: string; type: string; mod: string | null; name: string; location: LatLng }[], duration?: number): NavRoute {
  const cum = cumulative(points)
  const total = cum[cum.length - 1]
  let from = 0
  const steps: NavStep[] = raw.map((s, i) => {
    const loc = locate(points, cum, s.location, from)
    from = loc.index
    return { ...s, at: i === 0 ? 0 : loc.dist }
  })
  return { source, points, cum, total, duration: duration ?? total / AVG_MPS, steps }
}

/** Mapbox Directions: from the phone to the target, with steps. */
export async function fetchRoute(from: LatLng, to: LatLng, token: string, signal?: AbortSignal): Promise<NavRoute | null> {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}?geometries=geojson&overview=full&steps=true&access_token=${token}`
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const body = (await res.json()) as {
      code: string
      routes?: {
        duration: number
        geometry: { coordinates: [number, number][] }
        legs: { steps: { name: string; maneuver: { instruction: string; type: string; modifier?: string; location: [number, number] } }[] }[]
      }[]
    }
    const r = body.routes?.[0]
    if (body.code !== "Ok" || !r) return null
    const points = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
    const raw = r.legs.flatMap((l) => l.steps).map((s) => ({ text: s.maneuver.instruction, type: s.maneuver.type, mod: s.maneuver.modifier ?? null, name: s.name, location: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] } }))
    return build("live", points, raw, r.duration)
  } catch {
    return null
  }
}

/** The planned road leg to a stop, saved with the trip, so guidance works with no signal. */
export function plannedRoute(trip: DriverTrip, legIndex: number): NavRoute | null {
  const points = legPoints(trip, legIndex)
  const steps = trip.steps?.[legIndex]
  if (!trip.legs?.[legIndex] || !steps?.length || points.length < 2) return null
  return build(
    "planned",
    points,
    steps.map((s) => ({ text: s.text, type: s.type, mod: s.mod, name: s.name, location: { lat: s.at[0], lng: s.at[1] } })),
  )
}

/** Last resort with no signal and no saved leg: a straight line and a compass heading. */
export function straightRoute(from: LatLng, to: LatLng, label: string): NavRoute {
  const b = bearing(from, to)
  const dir = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(b / 45) % 8]
  return build(
    "straight",
    [from, to],
    [
      { text: `Head ${dir} toward ${label}`, type: "depart", mod: null, name: "", location: from },
      { text: `You have arrived at ${label}`, type: "arrive", mod: null, name: "", location: to },
    ],
  )
}

/** Snap a position to the route and work out what the driver should do next. */
export function guide(route: NavRoute, pos: LatLng): Guidance {
  const { points, cum } = route
  let bestI = 0
  let bestD = Infinity
  let bestT = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const k = Math.cos((a.lat * Math.PI) / 180)
    const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = pos.lng * k, py = pos.lat
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    const d = distanceM(pos, { lat: ay + dy * t, lng: (ax + dx * t) / k })
    if (d < bestD) {
      bestD = d
      bestI = i
      bestT = t
    }
  }
  const along = cum[bestI] + (cum[bestI + 1] - cum[bestI]) * bestT
  const next = route.steps.find((s) => s.at > along + 3) ?? route.steps[route.steps.length - 1] ?? null
  const remainingM = Math.max(0, route.total - along)
  return {
    next,
    distToNext: next ? Math.max(0, next.at - along) : remainingM,
    remainingM,
    remainingSec: route.total ? (route.duration * remainingM) / route.total : 0,
    offRouteM: bestD,
    index: bestI,
    routeBearing: bearing(points[bestI], points[Math.min(points.length - 1, bestI + 1)]),
  }
}

/** The part of the route still ahead, starting at the snapped position. */
export function routeAhead(route: NavRoute, pos: LatLng, index: number): LatLng[] {
  return [pos, ...route.points.slice(index + 1)]
}

export const spoken = (distM: number, text: string) => {
  const d = distM < 60 ? "" : distM < 950 ? `In ${Math.round(distM / 50) * 50} meters, ` : `In ${(distM / 1000).toFixed(1)} kilometers, `
  return `${d}${text}`
}
