import { Injectable } from "@nestjs/common"
import { dateOnly, type LiveRoute, type LiveRoutes, type LiveSnapshot } from "@waypoint/shared"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { IssuesService, type SystemIssue } from "../issues/issues.service"
import { RoutingService } from "../routing/routing.service"
import { LiveClockService } from "./live-clock.service"
import { overlayDriver, type DriverTripState } from "./driver-overlay"
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
const hhmm = (m: number) => {
  const r = Math.round(m)
  return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`
}

/** Builds live snapshots for a depot/day from the published plan and the live clock. */
@Injectable()
export class LiveService {
  private cache = new Map<string, Loaded>()

  constructor(
    private readonly db: PrismaService,
    private readonly clock: LiveClockService,
    private readonly calendar: ClockService,
    private readonly issues: IssuesService,
    private readonly routing: RoutingService,
  ) {}

  async snapshot(depotId: string, date: string): Promise<LiveSnapshot> {
    const data = await this.load(depotId, date)
    const clock = this.clock.now()
    const driverState = await this.driverState(data.trips.map((t) => t.sim.id))
    const trips = data.trips.map(({ sim, timeline }) => overlayDriver(tripAt(sim, timeline, clock.minute), driverState.get(sim.id)))
    const onRoad = trips.filter((t) => ["ON_ROUTE", "AT_OUTLET", "DELAYED", "RETURNING"].includes(t.status))
    await this.monitor(depotId, date, trips)
    const openIssues = await this.db.issue.count({ where: { status: { not: "RESOLVED" }, trip: { planId: data.planId ?? "" } } })

    return {
      depotId,
      date,
      planId: data.planId,
      planVersion: data.planVersion,
      source: trips.some((t) => t.reported) ? "mixed" : "simulation",
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

  /** What drivers have reported for these trips (started, stops done, latest GPS fix). Cached a few seconds. */
  private driverCache: { key: string; at: number; value: Map<string, DriverTripState> } | null = null
  private async driverState(tripIds: string[]): Promise<Map<string, DriverTripState>> {
    const key = tripIds.join(",")
    if (this.driverCache?.key === key && Date.now() - this.driverCache.at < 2_500) return this.driverCache.value
    const [trips, fixes] = await Promise.all([
      this.db.trip.findMany({
        where: { id: { in: tripIds }, OR: [{ departedAt: { not: null } }, { status: { in: ["DEPARTED", "COMPLETED"] } }] },
        select: { id: true, status: true, departedAt: true, stops: { select: { id: true, status: true, completedAt: true } } },
      }),
      this.db.driverLocation.findMany({ where: { tripId: { in: tripIds } }, orderBy: { capturedAt: "desc" }, distinct: ["tripId"] }),
    ])
    const fixBy = new Map(fixes.map((f) => [f.tripId, f]))
    const value = new Map<string, DriverTripState>(
      trips.map((t) => {
        const f = fixBy.get(t.id)
        return [t.id, { ...t, fix: f ? { lat: f.lat, lng: f.lng, heading: f.heading, capturedAt: f.capturedAt, simulated: f.simulated } : null }]
      }),
    )
    this.driverCache = { key, at: Date.now(), value }
    return value
  }

  /**
   * Live monitoring: raise an issue (once) when a vehicle falls 30+ min behind plan or an
   * outlet is projected to miss its window, so exceptions reach the Issues queue without
   * anyone having to phone them in. Throttled per depot/day.
   */
  private lastMonitor = new Map<string, number>()
  private async monitor(depotId: string, date: string, trips: ReturnType<typeof tripAt>[]) {
    const key = `${depotId}|${date}`
    if (Date.now() - (this.lastMonitor.get(key) ?? 0) < 5_000) return
    this.lastMonitor.set(key, Date.now())
    const at = hhmm(this.clock.now().minute)
    const items: SystemIssue[] = []
    for (const t of trips) {
      if (t.status === "DELAYED" && t.delayMin >= 30)
        items.push({
          clientId: `sim-delay-${t.id}`,
          stage: "DELIVERY",
          type: "LATE_ARRIVAL",
          severity: "HIGH",
          description: `${t.vehicleId} is ${t.delayMin} min behind plan on ${t.ref} (${t.districtId}); next stop ${t.nextStop?.outletId ?? "—"}. Auto-detected by live monitoring at ${at}.`,
          tripId: t.id,
          vehicleId: t.vehicleId,
        })
      if (t.actualDepartMin == null) continue
      for (const s of t.stops)
        if (s.status === "PENDING" && s.late)
          items.push({
            clientId: `sim-window-${s.id}`,
            stage: "DELIVERY",
            type: "LATE_ARRIVAL",
            severity: "MEDIUM",
            description: `${s.outletId} projected to receive ${s.orderRef} at ${hhmm(s.etaMin)}, after its window closes at ${hhmm(s.windowCloseMin)}. Auto-detected by live monitoring at ${at}.`,
            tripId: t.id,
            stopId: s.id,
            orderId: s.orderId,
            outletId: s.outletId,
            vehicleId: t.vehicleId,
          })
    }
    await this.issues.raiseSystem(items)
  }

  /** Road geometry for every trip of the day, fetched once by the map (not pushed each tick). */
  async routes(depotId: string, date: string): Promise<LiveRoutes> {
    const plan = await this.db.plan.findFirst({
      where: { depotId, date: dateOnly(date), status: { in: ["PUBLISHED", "DRAFT"] } },
      orderBy: [{ status: "desc" }, { version: "desc" }],
      select: { trips: { where: { stops: { some: {} } }, select: { id: true } } },
    })
    return this.routesFor(plan?.trips.map((t) => t.id) ?? [])
  }

  async routesFor(tripIds: string[]): Promise<LiveRoutes> {
    if (!tripIds.length) return {}
    await Promise.race([this.routing.ensure(tripIds), new Promise((r) => setTimeout(r, 12_000))])
    const trips = await this.db.trip.findMany({ where: { id: { in: tripIds } }, select: { id: true, route: true } })
    return Object.fromEntries(trips.filter((t) => t.route).map((t) => [t.id, t.route as unknown as LiveRoute]))
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

    // Road geometry is computed once per trip; until it lands, trips move in straight lines.
    const missing = (plan?.trips ?? [])
      .filter((t) => t.stops.length && (!t.route || (t.route as { source?: string }).source === "google"))
      .map((t) => t.id)
    if (missing.length) void this.routing.ensure(missing).then(() => this.cache.delete(key))
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
          legs: (t.route as unknown as LiveRoute | null)?.legs.map((leg) => leg.map(([lat, lng]) => ({ lat, lng }))),
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
              orderId: s.orderId,
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
