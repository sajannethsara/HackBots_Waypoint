import { Injectable } from "@nestjs/common"
import { dateOnly, type LiveSnapshot } from "@waypoint/shared"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { LiveClockService } from "./live-clock.service"
import { alertsAt, buildTimeline, tripAt, type SimTrip } from "./simulation"

interface Loaded {
  planId: string | null
  planVersion: number | null
  depot: { name: string; position: { lat: number; lng: number } }
  fleetAvailable: number
  trips: { sim: SimTrip; timeline: ReturnType<typeof buildTimeline> }[]
  loadedAt: number
}

const CACHE_MS = 10_000

/** Builds live snapshots for a depot/day from the published plan and the live clock. */
@Injectable()
export class LiveService {
  private cache = new Map<string, Loaded>()

  constructor(
    private readonly db: PrismaService,
    private readonly clock: LiveClockService,
    private readonly calendar: ClockService,
  ) {}

  async snapshot(depotId: string, date: string): Promise<LiveSnapshot> {
    const data = await this.load(depotId, date)
    const clock = this.clock.now()
    const trips = data.trips.map(({ sim, timeline }) => tripAt(sim, timeline, clock.minute))
    const onRoad = trips.filter((t) => ["ON_ROUTE", "AT_OUTLET", "DELAYED", "RETURNING"].includes(t.status))
    const openIssues = await this.db.issue.count({ where: { status: { not: "RESOLVED" }, trip: { planId: data.planId ?? "" } } })

    return {
      depotId,
      date,
      planId: data.planId,
      planVersion: data.planVersion,
      source: "simulation",
      generatedAt: new Date().toISOString(),
      clock,
      depot: data.depot,
      kpis: {
        vehiclesOnRoad: new Set(onRoad.map((t) => t.vehicleId)).size,
        fleetAvailable: data.fleetAvailable,
        activeTrips: onRoad.length,
        totalTrips: trips.length,
        onTime: onRoad.filter((t) => t.status !== "DELAYED").length,
        delayed: onRoad.filter((t) => t.status === "DELAYED").length,
        atDepot: data.fleetAvailable - new Set(onRoad.map((t) => t.vehicleId)).size,
        completedTrips: trips.filter((t) => t.status === "COMPLETED").length,
        stopsDone: trips.reduce((s, t) => s + t.stopsDone, 0),
        stopsTotal: trips.reduce((s, t) => s + t.stops.length, 0),
        openIssues,
      },
      trips,
      alerts: alertsAt(trips, clock.minute),
    }
  }

  invalidate() {
    this.cache.clear()
  }

  private async load(depotId: string, date: string): Promise<Loaded> {
    const key = `${depotId}|${date}`
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.loadedAt < CACHE_MS) return hit

    const day = dateOnly(date)
    const [depot, plan, fleetAvailable, cal, roads] = await Promise.all([
      this.db.depot.findUniqueOrThrow({ where: { id: depotId } }),
      this.db.plan.findFirst({
        where: { depotId, date: day, status: "PUBLISHED" },
        orderBy: { version: "desc" },
        include: {
          trips: {
            orderBy: { ref: "asc" },
            include: {
              vehicle: true,
              driver: { select: { name: true, phone: true } },
              district: { include: { trafficSpeeds: true } },
              stops: {
                orderBy: { seq: "asc" },
                include: { order: { select: { ref: true, outlet: true } } },
              },
            },
          },
        },
      }),
      this.db.vehicle.count({ where: { depotId, status: "AVAILABLE" } }),
      this.calendar.calendar(date),
      this.db.roadCondition.findMany({ where: { date: day } }),
    ])
    const disruption = new Map(roads.map((r) => [r.districtId, r.disruptionIndex]))
    const depotPos = { lat: depot.lat ?? 6.96, lng: depot.lng ?? 79.88 }

    const trips = (plan?.trips ?? [])
      .filter((t) => t.stops.length)
      .map((t) => {
        const hour = Math.floor(t.plannedDepartMin / 60)
        const speed =
          t.district.trafficSpeeds.find((s) => s.hour === hour && s.monsoon === (cal?.monsoon ?? false))?.speedIndex ?? 100
        // Dispatchers already pad plans a little, so only half the measured slowdown shows up as delay.
        const raw = (100 / Math.max(speed, 30)) * (100 / Math.max(disruption.get(t.districtId) ?? 100, 30))
        const roadFactor = Math.min(1.45, 1 + Math.max(0, raw - 1) * 0.5)
        const sim: SimTrip = {
          id: t.id,
          ref: t.ref,
          brand: t.brand,
          districtId: t.districtId,
          vehicleId: t.vehicleId,
          vehicleLabel: `${t.vehicle.temp === "REEFER" ? "Reefer" : "Ambient"} ${t.vehicle.type.toLowerCase()} · ${Math.round(t.vehicle.weightCapKg / 100) / 10} t`,
          driver: t.driver,
          plannedDepartMin: t.plannedDepartMin,
          plannedDurationMin: t.plannedDurationMin,
          plannedKm: t.plannedKm,
          outboundMin: t.district.depotToDistrictMin,
          interStopMin: t.district.interStopMin,
          roadFactor,
          depot: depotPos,
          stops: t.stops.map((s) => {
            const o = s.order.outlet
            let open = o.windowOpenMin
            let close = o.windowCloseMin
            if (o.mallWindowOpenMin != null && o.mallWindowCloseMin != null) {
              open = Math.max(open, o.mallWindowOpenMin)
              close = Math.min(close, o.mallWindowCloseMin)
            }
            return {
              id: s.id,
              seq: s.seq,
              orderRef: s.order.ref,
              outletId: o.id,
              outletName: o.name,
              position: { lat: o.lat ?? depotPos.lat, lng: o.lng ?? depotPos.lng },
              plannedArrivalMin: s.plannedArrivalMin,
              plannedServiceMin: s.plannedServiceMin,
              windowOpenMin: open,
              windowCloseMin: close,
            }
          }),
        }
        return { sim, timeline: buildTimeline(sim) }
      })

    const loaded: Loaded = {
      planId: plan?.id ?? null,
      planVersion: plan?.version ?? null,
      depot: { name: depot.name, position: depotPos },
      fleetAvailable,
      trips,
      loadedAt: Date.now(),
    }
    this.cache.set(key, loaded)
    return loaded
  }
}
