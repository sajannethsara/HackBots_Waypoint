import { Injectable, Logger, Module } from "@nestjs/common"
import { Prisma } from "@waypoint/db"
import type { LiveRoute } from "@waypoint/shared"
import { PrismaService } from "../../common/prisma.service"

type Pt = [number, number] // [lat, lng]

const DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/driving"
const CONCURRENCY = 4
/** Mapbox Directions accepts up to 25 coordinates per driving request. */
const MAX_COORDS = 25

/** Keep geometry light: drop points closer than ~25 m to the previous kept point. */
function thin(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 0.00025) out.push([+p[0].toFixed(5), +p[1].toFixed(5)])
  }
  const last = pts[pts.length - 1]
  const end = out[out.length - 1]
  if (last && end && (end[0] !== +last[0].toFixed(5) || end[1] !== +last[1].toFixed(5))) out.push([+last[0].toFixed(5), +last[1].toFixed(5)])
  return out
}

interface DirectionsResponse {
  code: string
  message?: string
  routes?: {
    distance: number
    duration: number
    legs: { steps: { geometry: { coordinates: [number, number][] } }[] }[]
  }[]
}

/**
 * Road geometry for trips from the Mapbox Directions API (one request per trip, stops in
 * delivery order). Stored on the trip once, so the map and the live replay follow real
 * roads without calling Mapbox on every update. Without a token, or if Mapbox fails, legs
 * fall back to straight lines and the UI labels them as approximate.
 */
@Injectable()
export class RoutingService {
  private readonly log = new Logger(RoutingService.name)
  private readonly token = process.env.MAPBOX_ACCESS_TOKEN
  private inflight = new Map<string, Promise<void>>()

  constructor(private readonly db: PrismaService) {}

  /** Compute geometry for any of these trips that do not have current geometry. Safe to call repeatedly. */
  ensure(tripIds: string[]): Promise<void> {
    const key = [...tripIds].sort().join(",")
    const running = this.inflight.get(key)
    if (running) return running
    const job = this.run(tripIds).finally(() => this.inflight.delete(key))
    this.inflight.set(key, job)
    return job
  }

  private async run(tripIds: string[]) {
    const trips = await this.db.trip.findMany({
      where: {
        id: { in: tripIds },
        // Missing, or computed by an earlier provider — recompute with Mapbox.
        OR: [{ route: { equals: Prisma.DbNull } }, { route: { path: ["source"], equals: "google" } }],
      },
      include: {
        plan: { select: { depot: { select: { lat: true, lng: true } } } },
        stops: { orderBy: { seq: "asc" }, include: { order: { select: { outlet: { select: { lat: true, lng: true } } } } } },
      },
    })
    const queue = [...trips]
    let fromMapbox = 0
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          const depot: Pt = [t.plan.depot.lat ?? 6.96, t.plan.depot.lng ?? 79.88]
          const pts: Pt[] = [depot, ...t.stops.map((s) => [s.order.outlet.lat ?? depot[0], s.order.outlet.lng ?? depot[1]] as Pt), depot]
          const route = (await this.fromMapbox(pts)) ?? straight(pts)
          if (route.source === "mapbox") fromMapbox++
          await this.db.trip.update({ where: { id: t.id }, data: { route: { ...route, computedAt: new Date().toISOString() } as never } })
        }
      }),
    )
    if (trips.length) this.log.log(`Route geometry: ${fromMapbox}/${trips.length} trips from Mapbox Directions`)
  }

  private async fromMapbox(pts: Pt[]): Promise<LiveRoute | null> {
    if (!this.token || pts.length < 2 || pts.length > MAX_COORDS) return null
    const coords = pts.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";")
    const url = `${DIRECTIONS_URL}/${coords}?geometries=geojson&overview=false&steps=true&access_token=${this.token}`
    try {
      const res = await fetch(url)
      const body = (await res.json()) as DirectionsResponse
      if (!res.ok || body.code !== "Ok" || !body.routes?.[0]) {
        this.log.warn(`Mapbox Directions ${res.status} ${body.code}: ${body.message ?? ""}`.trim())
        return null
      }
      const r = body.routes[0]
      if (r.legs.length !== pts.length - 1) return null
      return {
        source: "mapbox",
        legs: r.legs.map((leg, i) => {
          // A leg's geometry is its steps joined end to end ([lng, lat] → [lat, lng]).
          const line: Pt[] = []
          for (const step of leg.steps)
            for (const [lng, lat] of step.geometry.coordinates) {
              const prev = line[line.length - 1]
              if (!prev || prev[0] !== lat || prev[1] !== lng) line.push([lat, lng])
            }
          const p = thin(line)
          return p.length >= 2 ? p : [pts[i], pts[i + 1]]
        }),
        km: Math.round(r.distance / 100) / 10,
        min: Math.round(r.duration / 60),
      }
    } catch (e) {
      this.log.warn(`Mapbox Directions failed: ${(e as Error).message}`)
      return null
    }
  }
}

function straight(pts: Pt[]): LiveRoute {
  return { source: "straight", legs: pts.slice(1).map((p, i) => [pts[i], p]), km: 0, min: 0 }
}

@Module({ providers: [RoutingService], exports: [RoutingService] })
export class RoutingModule {}
