import { Controller, Get, Injectable, Module, NotFoundException, Param, Query } from "@nestjs/common"
import { dateOnly, toDateOnly } from "@waypoint/shared"
import { Roles } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"
import { LiveModule } from "../live/live.module"
import { LiveService } from "../live/live.service"

@Injectable()
export class TripsService {
  constructor(
    private readonly db: PrismaService,
    private readonly live: LiveService,
  ) {}

  /** The day's trips (published plan, else the draft) with live state and open issues. */
  async list(depotId: string, date: string) {
    const plans = await this.db.plan.findMany({
      where: { depotId, date: dateOnly(date), status: { in: ["PUBLISHED", "DRAFT"] } },
      orderBy: { version: "desc" },
      select: { id: true },
    })
    const published = await this.db.plan.findFirst({ where: { id: { in: plans.map((p) => p.id) }, status: "PUBLISHED" }, orderBy: { version: "desc" } })
    const plan = published ?? (plans[0] ? await this.db.plan.findUnique({ where: { id: plans[0].id } }) : null)
    if (!plan) return { plan: null, clock: null, trips: [] }

    const [trips, snapshot] = await Promise.all([
      this.db.trip.findMany({
        where: { planId: plan.id, stops: { some: {} } },
        orderBy: { ref: "asc" },
        include: {
          vehicle: true,
          driver: { select: { name: true } },
          _count: { select: { stops: true, issues: { where: { status: { not: "RESOLVED" } } } } },
        },
      }),
      plan.status === "PUBLISHED" ? this.live.snapshot(depotId, date) : Promise.resolve(null),
    ])
    const liveById = new Map(snapshot?.trips.map((t) => [t.id, t]) ?? [])

    return {
      plan: { id: plan.id, version: plan.version, status: plan.status, publishedAt: plan.publishedAt },
      clock: snapshot?.clock ?? null,
      trips: trips.map((t) => {
        const l = liveById.get(t.id)
        return {
          id: t.id,
          ref: t.ref,
          tripNo: t.tripNo,
          brand: t.brand,
          districtId: t.districtId,
          vehicleId: t.vehicleId,
          vehicleType: t.vehicle.type,
          vehicleTemp: t.vehicle.temp,
          driver: t.driver?.name ?? null,
          stops: t._count.stops,
          openIssues: t._count.issues,
          plannedDepartMin: t.plannedDepartMin,
          plannedDurationMin: t.plannedDurationMin,
          plannedKm: t.plannedKm,
          plannedFuelL: t.plannedFuelL,
          loadWeightKg: t.loadWeightKg,
          loadVolumeM3: t.loadVolumeM3,
          utilPct: Math.round(Math.max(t.loadWeightKg / t.vehicle.weightCapKg, t.loadVolumeM3 / t.vehicle.volumeCapM3) * 100),
          live: l
            ? {
                status: l.status,
                delayMin: l.delayMin,
                progressPct: l.progressPct,
                stopsDone: l.stopsDone,
                locationLabel: l.locationLabel,
                etaReturnMin: l.etaReturnMin,
                nextStop: l.nextStop,
              }
            : null,
        }
      }),
    }
  }

  /** Everything about one trip: plan, vehicle, crew, stops + orders, live state, issues, audit trail. */
  async detail(id: string) {
    const trip = await this.db.trip.findUnique({
      where: { id },
      include: {
        plan: { select: { id: true, version: true, status: true, date: true, depotId: true, publishedAt: true, generatedAt: true, engineVersion: true, publishedBy: { select: { name: true } } } },
        vehicle: true,
        driver: { select: { id: true, name: true, phone: true, email: true } },
        loadedBy: { select: { name: true } },
        district: true,
        stops: {
          orderBy: { seq: "asc" },
          include: {
            order: {
              include: {
                outlet: true,
                lines: true,
                receipt: { select: { status: true, confirmedAt: true } },
                decisions: { where: { plan: { trips: { some: { id } } } }, select: { priorityScore: true, scoreBreakdown: true, source: true, explanation: true } },
              },
            },
            proof: { select: { recipientName: true, capturedAt: true } },
          },
        },
        fuelEntries: { orderBy: { createdAt: "asc" } },
        deliveryEvents: { orderBy: { occurredAt: "asc" } },
      },
    })
    if (!trip) throw new NotFoundException("Trip not found")

    const orderIds = trip.stops.map((s) => s.orderId)
    const date = toDateOnly(trip.plan.date)
    const [issues, snapshot, depot] = await Promise.all([
      this.db.issue.findMany({
        where: { OR: [{ tripId: id }, { stop: { tripId: id } }, { orderId: { in: orderIds } }] },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: { reportedBy: { select: { name: true, role: true } }, resolvedBy: { select: { name: true } }, stop: { select: { seq: true } } },
      }),
      trip.plan.status === "PUBLISHED" ? this.live.snapshot(trip.plan.depotId, date) : Promise.resolve(null),
      this.db.depot.findUniqueOrThrow({ where: { id: trip.plan.depotId } }),
    ])
    const audit = await this.db.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Plan", entityId: trip.plan.id },
          { entityType: "Order", entityId: { in: orderIds } },
          { entityType: "Issue", entityId: { in: issues.map((i) => i.id) } },
          { entityType: "Trip", entityId: id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    })
    const live = snapshot?.trips.find((t) => t.id === id) ?? null
    const stored = trip.route as { source?: string } | null
    const route = stored && stored.source !== "google" ? trip.route : ((await this.live.routesFor([id]))[id] ?? null)

    // Same-vehicle context: the other trip this vehicle runs today
    const sibling = await this.db.trip.findFirst({
      where: { planId: trip.plan.id, vehicleId: trip.vehicleId, NOT: { id } },
      select: { id: true, ref: true, tripNo: true, brand: true, districtId: true, plannedDepartMin: true, plannedDurationMin: true, plannedFuelL: true },
    })
    const weekFuel = await this.db.fuelLedgerEntry.aggregate({
      where: { vehicleId: trip.vehicleId, isoYear: trip.fuelEntries[0]?.isoYear, isoWeek: trip.fuelEntries[0]?.isoWeek },
      _sum: { litres: true },
    })

    return {
      trip,
      route,
      depot: { id: depot.id, name: depot.name, position: { lat: depot.lat ?? 6.96, lng: depot.lng ?? 79.88 } },
      sibling,
      fuelUsedThisWeekL: weekFuel._sum.litres ?? null,
      live,
      clock: snapshot?.clock ?? null,
      alerts: snapshot?.alerts.filter((a) => a.tripId === id) ?? [],
      issues,
      audit: audit.map((a) => ({ id: a.id, action: a.action, at: a.createdAt, actor: a.actor?.name ?? "System", entityType: a.entityType, entityId: a.entityId, after: a.after })),
    }
  }
}

@Roles("DISPATCHER")
@Controller("trips")
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.trips.list(depotId, date)
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.trips.detail(id)
  }
}

@Module({ imports: [LiveModule], controllers: [TripsController], providers: [TripsService] })
export class TripsModule {}
