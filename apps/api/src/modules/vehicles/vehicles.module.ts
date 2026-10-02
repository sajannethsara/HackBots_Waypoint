import { Controller, Get, Injectable, Module, NotFoundException, Param } from "@nestjs/common"
import { toDateOnly } from "@waypoint/shared"
import { Roles } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"

const HISTORY_LIMIT = 80

@Injectable()
export class VehiclesService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /**
   * One vehicle in full: fixed specs and crew, utilisation over everything it has run, this
   * week's fuel against quota, and every published trip (newest first). Live position is
   * layered on by the web app from the live snapshot, so this stays cacheable.
   */
  async detail(id: string) {
    const vehicle = await this.db.vehicle.findUnique({
      where: { id },
      include: { depot: { select: { id: true, name: true } }, driver: { select: { id: true, name: true, phone: true, email: true } } },
    })
    if (!vehicle) throw new NotFoundException("Vehicle not found")

    const published = { vehicleId: id, plan: { status: "PUBLISHED" as const } }
    const [trips, issues, openIssues] = await Promise.all([
      this.db.trip.findMany({
        where: published,
        orderBy: [{ plan: { date: "desc" } }, { tripNo: "desc" }],
        take: HISTORY_LIMIT,
        select: {
          id: true,
          ref: true,
          tripNo: true,
          brand: true,
          districtId: true,
          status: true,
          plannedDepartMin: true,
          plannedDurationMin: true,
          plannedKm: true,
          plannedFuelL: true,
          loadWeightKg: true,
          loadVolumeM3: true,
          plan: { select: { date: true, version: true } },
          driver: { select: { name: true } },
          _count: { select: { stops: true, issues: { where: { status: { not: "RESOLVED" } } } } },
        },
      }),
      this.db.issue.findMany({
        where: { vehicleId: id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, ref: true, type: true, severity: true, status: true, createdAt: true, tripId: true },
      }),
      this.db.issue.count({ where: { vehicleId: id, status: { not: "RESOLVED" } } }),
    ])

    const history = trips.map((t) => ({
      id: t.id,
      ref: t.ref,
      tripNo: t.tripNo,
      date: toDateOnly(t.plan.date),
      brand: t.brand,
      districtId: t.districtId,
      status: t.status,
      driver: t.driver?.name ?? null,
      stops: t._count.stops,
      openIssues: t._count.issues,
      plannedDepartMin: t.plannedDepartMin,
      plannedDurationMin: t.plannedDurationMin,
      plannedKm: t.plannedKm,
      plannedFuelL: t.plannedFuelL,
      utilPct: Math.round(Math.max(t.loadWeightKg / vehicle.weightCapKg, t.loadVolumeM3 / vehicle.volumeCapM3) * 100),
    }))

    const sum = (f: (t: (typeof history)[number]) => number) => history.reduce((s, t) => s + f(t), 0)
    const days = new Set(history.map((t) => t.date))

    // The week that matters is the one the operating day falls in; fall back to the latest booked week.
    const operatingDate = await this.clock.operatingDate()
    const latest = await this.db.fuelLedgerEntry.findFirst({ where: { vehicleId: id }, orderBy: { date: "desc" }, select: { isoYear: true, isoWeek: true } })
    const week = latest ? await this.db.fuelLedgerEntry.aggregate({ where: { vehicleId: id, isoYear: latest.isoYear, isoWeek: latest.isoWeek }, _sum: { litres: true, km: true } }) : null

    return {
      vehicle,
      operatingDate,
      stats: {
        trips: history.length,
        completedTrips: history.filter((t) => t.status === "COMPLETED").length,
        activeDays: days.size,
        stops: sum((t) => t.stops),
        km: Math.round(sum((t) => t.plannedKm)),
        fuelL: Math.round(sum((t) => t.plannedFuelL)),
        avgUtilPct: history.length ? Math.round(sum((t) => t.utilPct) / history.length) : null,
        openIssues,
      },
      fuelWeek: latest ? { isoYear: latest.isoYear, isoWeek: latest.isoWeek, litres: week?._sum.litres ?? 0, km: week?._sum.km ?? 0, quotaL: vehicle.weeklyFuelQuotaL } : null,
      history,
      issues,
    }
  }
}

@Roles("DISPATCHER")
@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.vehicles.detail(id)
  }
}

@Module({ controllers: [VehiclesController], providers: [VehiclesService] })
export class VehiclesModule {}
