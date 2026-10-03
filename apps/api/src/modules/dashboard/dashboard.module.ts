import { Controller, Get, Injectable, Module, Query } from "@nestjs/common"
import { dateOnly, DEFERRAL_REASON_META, type DeferralReason } from "@waypoint/shared"
import { Roles } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"

/** Command Center: one call that answers "how is today going and what needs me?" */
@Injectable()
export class DashboardService {
  constructor(private readonly db: PrismaService) {}

  async summary(depotId: string, date: string) {
    const day = dateOnly(date)
    const [plan, orders, vehicles, issues, activity, repeat] = await Promise.all([
      this.db.plan.findFirst({
        where: { depotId, date: day, status: { in: ["DRAFT", "PUBLISHED"] } },
        orderBy: [{ status: "asc" }, { version: "desc" }],
        include: {
          trips: {
            orderBy: { ref: "asc" },
            include: { stops: { select: { status: true, plannedArrivalMin: true, atRisk: true, order: { select: { ref: true, outletId: true } } } }, driver: { select: { name: true } } },
          },
          decisions: { select: { decision: true, reason: true, consecutiveDefers: true, order: { select: { outletId: true, temp: true, brand: true } } } },
        },
      }),
      this.db.order.findMany({ where: { depotId, status: { not: "DRAFT" }, OR: [{ deliveryDate: day }, { decisions: { some: { plan: { date: day, depotId } } } }] }, select: { brand: true, temp: true, status: true } }),
      this.db.vehicle.findMany({ where: { depotId }, select: { id: true, status: true, temp: true, type: true } }),
      this.db.issue.findMany({ where: { status: { not: "RESOLVED" }, OR: [{ trip: { plan: { depotId, date: day } } }, { outlet: { depotId } }] }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, ref: true, type: true, severity: true, stage: true, description: true, createdAt: true, tripId: true } }),
      this.db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { name: true } } } }),
      this.db.order.count({ where: { depotId, status: { not: "DRAFT" }, deliveryDate: day, deferCount: { gte: 1 } } }),
    ])

    const decisions = plan?.decisions ?? []
    const served = decisions.filter((d) => d.decision === "SERVED").length
    const deferred = decisions.filter((d) => d.decision === "DEFERRED")
    const stops = plan?.trips.flatMap((t) => t.stops) ?? []
    const delivered = stops.filter((s) => ["DELIVERED", "PARTIAL"].includes(s.status)).length
    const inUse = new Set(plan?.trips.filter((t) => t.stops.length).map((t) => t.vehicleId)).size

    // Action required: derived signals, most severe first
    const actions: { kind: string; severity: "high" | "medium" | "low"; title: string; detail: string; count: number; href: string }[] = []
    const reasonCounts = new Map<string, number>()
    for (const d of deferred) if (d.reason) reasonCounts.set(d.reason, (reasonCounts.get(d.reason) ?? 0) + 1)
    for (const [reason, n] of [...reasonCounts].sort((a, b) => b[1] - a[1]))
      actions.push({
        kind: reason,
        severity: reason === "REEFER_CAPACITY" ? "high" : "medium",
        title: `${DEFERRAL_REASON_META[reason as DeferralReason].label} shortfall`,
        detail: `${n} order${n > 1 ? "s" : ""} could not be allocated`,
        count: n,
        href: "/dispatcher/planning",
      })
    const atRisk = stops.filter((s) => s.atRisk).length
    if (atRisk) actions.push({ kind: "AT_RISK", severity: "medium", title: "Delivery window at risk", detail: `${atRisk} stop(s) with under 15 min slack`, count: atRisk, href: "/dispatcher/planning" })
    const repeatDefer = deferred.filter((d) => d.consecutiveDefers >= 2).length
    if (repeatDefer || repeat)
      actions.push({ kind: "REPEAT", severity: "high", title: "Repeated deferrals", detail: `${repeatDefer || repeat} outlet order(s) already deferred on a previous run`, count: repeatDefer || repeat, href: "/dispatcher/orders?view=deferred" })
    const workshop = vehicles.filter((v) => v.status === "IN_WORKSHOP")
    if (workshop.length)
      actions.push({ kind: "VEHICLES", severity: "low", title: "Vehicles unavailable", detail: `${workshop.length} in workshop (${workshop.filter((v) => v.temp === "REEFER").length} reefers)`, count: workshop.length, href: "/dispatcher/vehicles" })
    if (!plan) actions.unshift({ kind: "NO_PLAN", severity: "high", title: "No plan for today", detail: "Orders are closed — generate the delivery plan", count: orders.length, href: "/dispatcher/planning" })
    else if (plan.status === "DRAFT") actions.unshift({ kind: "DRAFT", severity: "medium", title: "Plan not published", detail: `Draft v${plan.version} is waiting for review`, count: 1, href: "/dispatcher/planning" })

    const byBrand = (["FRESH", "STYLE", "TECH"] as const).map((b) => ({
      brand: b,
      total: orders.filter((o) => o.brand === b).length,
      planned: decisions.filter((d) => d.order.brand === b && d.decision === "SERVED").length,
      deferred: decisions.filter((d) => d.order.brand === b && d.decision === "DEFERRED").length,
    }))

    return {
      plan: plan ? { id: plan.id, status: plan.status, version: plan.version, publishedAt: plan.publishedAt, summary: plan.summary } : null,
      kpis: {
        confirmedOrders: orders.length,
        chilledOrders: orders.filter((o) => o.temp === "CHILLED").length,
        planned: served,
        coveragePct: orders.length ? Math.round((served / orders.length) * 100) : 0,
        deferred: deferred.length,
        openIssues: issues.length,
        vehiclesInUse: inUse,
        vehiclesAvailable: vehicles.filter((v) => v.status === "AVAILABLE").length,
        vehiclesTotal: vehicles.length,
      },
      deliveries: {
        planned: served,
        outForDelivery: (plan?.trips ?? [])
          .filter((t) => t.status === "DEPARTED")
          .flatMap((t) => t.stops)
          .filter((s) => s.status === "PENDING" || s.status === "ARRIVED").length,
        delivered,
        deferred: deferred.length,
      },
      byBrand,
      actions,
      trips: (plan?.trips ?? []).filter((t) => t.stops.length).slice(0, 8).map((t) => ({
        id: t.id,
        ref: t.ref,
        vehicleId: t.vehicleId,
        brand: t.brand,
        districtId: t.districtId,
        status: t.status,
        driver: t.driver?.name ?? null,
        stops: t.stops.length,
        done: t.stops.filter((s) => s.status !== "PENDING" && s.status !== "ARRIVED").length,
        eta: Math.max(...t.stops.map((s) => s.plannedArrivalMin)),
        atRisk: t.stops.some((s) => s.atRisk),
      })),
      upcoming: (plan?.trips ?? [])
        .flatMap((t) => t.stops.map((s) => ({ time: s.plannedArrivalMin, outletId: s.order.outletId, orderRef: s.order.ref, brand: t.brand, tripRef: t.ref, status: s.status, atRisk: s.atRisk })))
        .filter((s) => s.status === "PENDING")
        .sort((a, b) => a.time - b.time)
        .slice(0, 6),
      issues,
      activity: activity.map((a) => ({ id: a.id, action: a.action, at: a.createdAt, actor: a.actor?.name ?? "System", entityType: a.entityType, entityId: a.entityId, after: a.after })),
    }
  }
}

@Roles("DISPATCHER")
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.dashboard.summary(depotId, date)
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
