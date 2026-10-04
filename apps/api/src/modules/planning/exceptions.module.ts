import { Controller, Get, Injectable, Module, Query } from "@nestjs/common"
import { dateOnly } from "@waypoint/shared"
import { Roles } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { DemoService } from "../live/demo-state.service"
import { LiveClockService } from "../live/live-clock.service"
import { LiveModule } from "../live/live.module"

const FUEL_WARN = 0.8

/**
 * Everything that needs the dispatcher's attention for a depot and day, grouped the way the Exceptions
 * page shows it: orders left out of the plan, stops likely to miss their window, trips stuck at the depot
 * gate, deliveries that did not go through, open issues and fleet pressure.
 */
@Injectable()
export class ExceptionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly calendar: ClockService,
    private readonly live: LiveClockService,
    private readonly demo: DemoService,
  ) {}

  async overview(depotId: string, date: string) {
    const day = dateOnly(date)
    const plans = await this.db.plan.findMany({
      where: { depotId, date: day, status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { version: "desc" },
      select: { id: true, status: true, version: true },
    })
    const plan = plans.find((p) => p.status === "DRAFT") ?? plans[0] ?? null
    const planId = plan?.id ?? "none"
    const minute = this.live.effective(this.demo.isOn()).minute

    const outletSelect = { id: true, name: true, districtId: true } as const
    const [decisions, risky, gate, delivered, issues, workshop] = await Promise.all([
      this.db.planDecision.findMany({
        where: { planId, decision: "DEFERRED" },
        orderBy: { priorityScore: "desc" },
        include: { order: { select: { id: true, ref: true, brand: true, temp: true, weightKg: true, volumeM3: true, deferCount: true, outlet: { select: outletSelect } } }, overriddenBy: { select: { name: true } } },
      }),
      this.db.stop.findMany({
        where: { atRisk: true, trip: { planId } },
        orderBy: [{ trip: { ref: "asc" } }, { seq: "asc" }],
        select: {
          id: true, seq: true, plannedArrivalMin: true, riskReason: true, status: true,
          trip: { select: { id: true, ref: true, vehicleId: true, brand: true, liveAt: true, departedAt: true } },
          order: { select: { id: true, ref: true, outlet: { select: { ...outletSelect, windowOpenMin: true, windowCloseMin: true } } } },
        },
      }),
      plan?.status === "PUBLISHED"
        ? this.db.trip.findMany({
            where: { planId, liveAt: null, departedAt: null, stops: { some: {} }, status: { not: "CANCELLED" } },
            orderBy: [{ plannedDepartMin: "asc" }, { ref: "asc" }],
            select: {
              id: true, ref: true, vehicleId: true, brand: true, districtId: true, plannedDepartMin: true, heldAt: true, driverClaimedAt: true, loaderClaimedAt: true,
              driver: { select: { name: true } }, loader: { select: { name: true } }, _count: { select: { stops: true } },
            },
          })
        : Promise.resolve([]),
      this.db.stop.findMany({
        where: { status: { in: ["PARTIAL", "REFUSED"] }, trip: { planId } },
        orderBy: { completedAt: "desc" },
        select: {
          id: true, status: true, completedAt: true,
          trip: { select: { id: true, ref: true, driver: { select: { name: true } } } },
          order: { select: { id: true, ref: true, outlet: { select: outletSelect } } },
          proof: { select: { recipientName: true, notes: true, lines: { select: { refusedQty: true, reason: true } } } },
        },
      }),
      this.db.issue.findMany({
        where: { status: { not: "RESOLVED" }, OR: [{ trip: { planId } }, { outlet: { depotId } }] },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        select: {
          id: true, ref: true, type: true, severity: true, status: true, description: true, createdAt: true,
          trip: { select: { ref: true } }, outlet: { select: { id: true } }, order: { select: { ref: true } },
        },
      }),
      this.db.vehicle.findMany({ where: { depotId, status: "IN_WORKSHOP" }, select: { id: true, type: true, temp: true } }),
    ])

    // Fuel: vehicles that have burned most of this ISO week's quota (including today's planned trips).
    const cal = await this.calendar.calendar(date)
    const vehicles = await this.db.vehicle.findMany({ where: { depotId }, select: { id: true, type: true, temp: true, weeklyFuelQuotaL: true, status: true } })
    const fuel = cal
      ? await this.db.fuelLedgerEntry.groupBy({ by: ["vehicleId"], where: { isoYear: cal.isoYear, isoWeek: cal.isoWeek, vehicle: { depotId } }, _sum: { litres: true } })
      : []
    const used = new Map(fuel.map((f) => [f.vehicleId, f._sum.litres ?? 0]))
    const fuelWatch = vehicles
      .map((v) => ({ id: v.id, type: v.type, temp: v.temp, quotaL: v.weeklyFuelQuotaL, usedL: Math.round((used.get(v.id) ?? 0) * 10) / 10 }))
      .filter((v) => v.quotaL > 0 && v.usedL / v.quotaL >= FUEL_WARN)
      .sort((a, b) => b.usedL / b.quotaL - a.usedL / a.quotaL)

    const out = {
      plan,
      clockMinute: minute,
      deferred: decisions.map((d) => ({
        orderId: d.orderId,
        ref: d.order.ref,
        outlet: d.order.outlet,
        brand: d.order.brand,
        temp: d.order.temp,
        weightKg: d.order.weightKg,
        volumeM3: d.order.volumeM3,
        deferCount: d.order.deferCount,
        priorityScore: d.priorityScore,
        reason: d.reason,
        source: d.source,
        unavoidable: (d.scoreBreakdown as { unavoidable?: boolean } | null)?.unavoidable === true,
        explanation: d.note || d.explanation,
        by: d.overriddenBy?.name ?? null,
      })),
      atRisk: risky.map((s) => ({
        stopId: s.id,
        seq: s.seq,
        tripId: s.trip.id,
        tripRef: s.trip.ref,
        vehicleId: s.trip.vehicleId,
        brand: s.trip.brand,
        live: !!s.trip.liveAt || !!s.trip.departedAt,
        orderId: s.order.id,
        orderRef: s.order.ref,
        outlet: { id: s.order.outlet.id, name: s.order.outlet.name, districtId: s.order.outlet.districtId },
        arrivalMin: s.plannedArrivalMin,
        windowCloseMin: s.order.outlet.windowCloseMin,
        reason: s.riskReason,
      })),
      gate: gate.map((t) => ({
        tripId: t.id,
        ref: t.ref,
        vehicleId: t.vehicleId,
        brand: t.brand,
        districtId: t.districtId,
        stops: t._count.stops,
        departMin: t.plannedDepartMin,
        overdue: t.plannedDepartMin <= minute,
        held: !!t.heldAt,
        driver: t.driver?.name ?? null,
        driverClaimedAt: t.driverClaimedAt,
        loader: t.loader?.name ?? null,
        loaderClaimedAt: t.loaderClaimedAt,
      })),
      deliveries: delivered.map((s) => ({
        stopId: s.id,
        status: s.status,
        at: s.completedAt,
        tripId: s.trip.id,
        tripRef: s.trip.ref,
        driver: s.trip.driver?.name ?? null,
        orderId: s.order.id,
        orderRef: s.order.ref,
        outlet: s.order.outlet,
        refusedQty: s.proof?.lines.reduce((a, l) => a + l.refusedQty, 0) ?? 0,
        reason: s.proof?.lines.find((l) => l.reason)?.reason ?? s.proof?.notes ?? null,
        receivedBy: s.proof?.recipientName ?? null,
      })),
      issues: issues.map((i) => ({
        id: i.id,
        ref: i.ref,
        type: i.type,
        severity: i.severity,
        status: i.status,
        description: i.description,
        createdAt: i.createdAt,
        tripRef: i.trip?.ref ?? null,
        outletId: i.outlet?.id ?? null,
        orderRef: i.order?.ref ?? null,
      })),
      fleet: [
        ...workshop.map((v) => ({ id: v.id, type: v.type, temp: v.temp, kind: "WORKSHOP" as const, usedL: 0, quotaL: 0 })),
        ...fuelWatch.map((v) => ({ id: v.id, type: v.type, temp: v.temp, kind: "FUEL" as const, usedL: v.usedL, quotaL: v.quotaL })),
      ],
    }
    return {
      ...out,
      counts: {
        deferred: out.deferred.length,
        atRisk: out.atRisk.length,
        gate: out.gate.filter((g) => g.overdue || g.held).length,
        deliveries: out.deliveries.length,
        issues: out.issues.length,
        fleet: out.fleet.length,
      },
    }
  }
}

@Roles("DISPATCHER")
@Controller("exceptions")
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  @Get()
  overview(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.exceptions.overview(depotId, date)
  }
}

@Module({ imports: [LiveModule], controllers: [ExceptionsController], providers: [ExceptionsService] })
export class ExceptionsModule {}
