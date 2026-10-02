import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  ENGINE_VERSION,
  planDay,
  schedule,
  tripDuration,
  tripKm,
  validateTrip,
  type PlanOptions,
} from "@waypoint/engine"
import {
  dateOnly,
  DEFERRAL_REASON_META,
  RULES,
  type AssignOrderInput,
  type DeferOrderInput,
  type GeneratePlanInput,
} from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { RoutingService } from "../routing/routing.service"
import { loadDepotContext, toEngineOrder } from "./engine-input"

const PLANNABLE = ["SUBMITTED", "PLANNED", "DEFERRED"] as const

const planInclude = {
  publishedBy: { select: { name: true } },
  trips: {
    orderBy: { ref: "asc" },
    include: {
      vehicle: true,
      district: { select: { id: true, centroidLat: true, centroidLng: true } },
      driver: { select: { id: true, name: true } },
      stops: {
        orderBy: { seq: "asc" },
        include: {
          order: {
            select: {
              id: true,
              ref: true,
              temp: true,
              units: true,
              weightKg: true,
              volumeM3: true,
              deferCount: true,
              outlet: { select: { id: true, name: true, districtId: true, dockType: true, parkingConstraint: true, windowOpenMin: true, windowCloseMin: true, mallWindowOpenMin: true, mallWindowCloseMin: true } },
            },
          },
        },
      },
    },
  },
  decisions: {
    orderBy: { priorityScore: "desc" },
    include: {
      overriddenBy: { select: { name: true } },
      order: {
        include: {
          outlet: { select: { id: true, name: true, districtId: true, dockType: true, parkingConstraint: true, windowOpenMin: true, windowCloseMin: true, mallWindowOpenMin: true, mallWindowCloseMin: true, lastDeliveredOn: true } },
          lines: true,
          stops: { select: { tripId: true } },
        },
      },
    },
  },
} satisfies Prisma.PlanInclude

@Injectable()
export class PlanningService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
    private readonly routing: RoutingService,
  ) {}

  /** Latest non-superseded plan for a depot/day: the draft if one is open, else the published plan. */
  async current(depotId: string, date: string) {
    const plans = await this.db.plan.findMany({
      where: { depotId, date: dateOnly(date), status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { version: "desc" },
      select: { id: true, status: true },
    })
    const pick = plans.find((p) => p.status === "DRAFT") ?? plans[0]
    return pick ? this.get(pick.id) : null
  }

  async get(planId: string) {
    const plan = await this.db.plan.findUnique({ where: { id: planId }, include: planInclude })
    if (!plan) throw new NotFoundException("Plan not found")
    return plan
  }

  async history(depotId: string, date: string) {
    return this.db.plan.findMany({
      where: { depotId, date: dateOnly(date) },
      orderBy: { version: "desc" },
      select: { id: true, version: true, status: true, generatedAt: true, publishedAt: true, summary: true, publishedBy: { select: { name: true } } },
    })
  }

  /** Demand vs fleet for the generate screen, before any plan exists. */
  async demandOverview(depotId: string, date: string) {
    const [orders, vehicles] = await Promise.all([
      this.db.order.findMany({
        where: { depotId, deliveryDate: dateOnly(date), status: { in: [...PLANNABLE] } },
        select: { brand: true, temp: true, weightKg: true, volumeM3: true, outlet: { select: { districtId: true, parkingConstraint: true } } },
      }),
      this.db.vehicle.findMany({ where: { depotId }, select: { status: true, temp: true, type: true } }),
    ])
    const sumBy = (key: (o: (typeof orders)[number]) => string) => {
      const m = new Map<string, { key: string; orders: number; weightKg: number; volumeM3: number }>()
      for (const o of orders) {
        const k = key(o)
        const a = m.get(k) ?? m.set(k, { key: k, orders: 0, weightKg: 0, volumeM3: 0 }).get(k)!
        a.orders++
        a.weightKg += o.weightKg
        a.volumeM3 += o.volumeM3
      }
      return [...m.values()].sort((a, b) => b.orders - a.orders)
    }
    return {
      totalOrders: orders.length,
      byBrand: sumBy((o) => (o.brand === "FRESH" ? (o.temp === "CHILLED" ? "FRESH_CHILLED" : "FRESH_DRY") : o.brand)),
      byDistrict: sumBy((o) => o.outlet.districtId),
      vanOnly: orders.filter((o) => o.outlet.parkingConstraint === "VAN_ONLY").length,
      fleet: {
        total: vehicles.length,
        available: vehicles.filter((v) => v.status === "AVAILABLE").length,
        inWorkshop: vehicles.filter((v) => v.status === "IN_WORKSHOP").length,
        reefersAvailable: vehicles.filter((v) => v.status === "AVAILABLE" && v.temp === "REEFER").length,
        reefersTotal: vehicles.filter((v) => v.temp === "REEFER").length,
        vansAvailable: vehicles.filter((v) => v.status === "AVAILABLE" && v.type === "VAN").length,
      },
    }
  }

  /** Run the engine and store the result as a new DRAFT version (replacing any open draft). */
  async generate(user: SessionUser, input: GeneratePlanInput) {
    const { depotId, date } = input
    const cal = await this.clock.calendar(date)
    if (!cal) throw new BadRequestException("Date is outside the operating calendar")
    if (!cal.isOperating) throw new BadRequestException("Waypoint does not operate on this date")

    const orders = await this.db.order.findMany({
      where: { depotId, deliveryDate: dateOnly(date), status: { in: [...PLANNABLE] } },
      include: { outlet: true },
    })
    if (!orders.length) throw new BadRequestException("No confirmed orders for this date")

    const ctx = await loadDepotContext(this.db, depotId, cal.isoYear, cal.isoWeek)
    const options: Partial<PlanOptions> = { ...input.options }
    const result = planDay({
      orders: orders.map((o) => toEngineOrder(o, date)),
      outlets: ctx.outlets,
      vehicles: ctx.vehicles,
      districts: ctx.districts,
      serviceAllowance: ctx.serviceAllowance,
      context: { festivalRamp: cal.festivalRamp, isPayday: cal.isPayday, monsoon: cal.monsoon },
      options,
    })

    const last = await this.db.plan.findFirst({ where: { depotId, date: dateOnly(date) }, orderBy: { version: "desc" } })
    const tripsOrdered = [...result.trips].sort(
      (a, b) => brandRank(a.brand) - brandRank(b.brand) || a.departMin - b.departMin || a.vehicleId.localeCompare(b.vehicleId),
    )

    const plan = await this.db.$transaction(async (tx) => {
      await tx.plan.deleteMany({ where: { depotId, date: dateOnly(date), status: "DRAFT" } })
      const plan = await tx.plan.create({
        data: {
          depotId,
          date: dateOnly(date),
          version: (last?.version ?? 0) + 1,
          engineVersion: ENGINE_VERSION,
          summary: { ...result.summary, options } as unknown as Prisma.InputJsonValue,
        },
      })
      for (const [i, t] of tripsOrdered.entries()) {
        await tx.trip.create({
          data: {
            ref: `TRIP-${String(i + 1).padStart(3, "0")}`,
            planId: plan.id,
            vehicleId: t.vehicleId,
            tripNo: t.tripNo,
            brand: t.brand,
            districtId: t.districtId,
            plannedDepartMin: t.departMin,
            plannedDurationMin: t.durationMin,
            plannedKm: t.km,
            plannedFuelL: t.fuelL,
            loadWeightKg: t.weightKg,
            loadVolumeM3: t.volumeM3,
            stops: {
              create: t.stops.map((s) => ({
                orderId: s.orderId,
                seq: s.seq,
                plannedArrivalMin: s.arrivalMin,
                plannedWaitMin: s.waitMin,
                plannedServiceMin: s.serviceMin,
                atRisk: s.atRisk,
                riskReason: s.riskReason,
              })),
            },
          },
        })
      }
      await tx.planDecision.createMany({
        data: result.decisions.map((d) => ({
          planId: plan.id,
          orderId: d.orderId,
          decision: d.decision,
          priorityScore: d.priorityScore,
          scoreBreakdown: { ...d.scoreBreakdown, unavoidable: d.unavoidable ?? null } as Prisma.InputJsonValue,
          reason: d.reason,
          explanation: d.explanation,
          consecutiveDefers: d.decision === "DEFERRED" ? (orders.find((o) => o.id === d.orderId)?.deferCount ?? 0) + 1 : 0,
        })),
      })
      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: "PLAN_GENERATED",
          entityType: "Plan",
          entityId: plan.id,
          after: { served: result.summary.served, deferred: result.summary.deferred, trips: result.summary.trips },
        },
      })
      return plan
    }, { timeout: 30_000 })

    return this.get(plan.id)
  }

  /** Dispatcher moves an order out of the plan, with a reason. */
  async deferOrder(user: SessionUser, planId: string, input: DeferOrderInput) {
    const plan = await this.requireDraft(planId)
    const decision = await this.db.planDecision.findUnique({ where: { planId_orderId: { planId, orderId: input.orderId } } })
    if (!decision) throw new NotFoundException("Order is not part of this plan")
    const stop = await this.db.stop.findFirst({ where: { orderId: input.orderId, trip: { planId } } })

    await this.db.$transaction(async (tx) => {
      if (stop) await tx.stop.delete({ where: { id: stop.id } })
      await tx.planDecision.update({
        where: { id: decision.id },
        data: {
          decision: "DEFERRED",
          source: "DISPATCHER",
          reason: input.reason,
          note: input.note,
          explanation: input.note || `Deferred by dispatcher: ${DEFERRAL_REASON_META[input.reason].label.toLowerCase()}.`,
          overriddenById: user.sub,
        },
      })
      await tx.auditLog.create({
        data: { actorId: user.sub, action: "DECISION_OVERRIDDEN", entityType: "Order", entityId: input.orderId, before: { decision: decision.decision }, after: { decision: "DEFERRED", reason: input.reason, note: input.note } },
      })
    })
    if (stop) await this.recomputeTrip(stop.tripId, plan.depotId, plan.date)
    await this.refreshSummary(planId)
    return this.get(planId)
  }

  /** Dry-run of an assignment: which rules would break. Powers the constraint panel. */
  async checkAssign(planId: string, input: AssignOrderInput) {
    const plan = await this.db.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException("Plan not found")
    const { violations, trip } = await this.validateAssignment(plan, input)
    return { ok: violations.length === 0, violations, tripRef: trip.ref }
  }

  async assignOrder(user: SessionUser, planId: string, input: AssignOrderInput) {
    const plan = await this.requireDraft(planId)
    const { violations, trip } = await this.validateAssignment(plan, input)
    if (violations.length) throw new UnprocessableEntityException({ message: "Assignment breaks operating constraints", violations })

    const existing = await this.db.stop.findFirst({ where: { orderId: input.orderId, trip: { planId } } })
    await this.db.$transaction(async (tx) => {
      if (existing) await tx.stop.delete({ where: { id: existing.id } })
      const maxSeq = await tx.stop.aggregate({ where: { tripId: trip.id }, _max: { seq: true } })
      await tx.stop.create({
        data: { tripId: trip.id, orderId: input.orderId, seq: (maxSeq._max.seq ?? 0) + 1, plannedArrivalMin: 0, plannedServiceMin: 0 },
      })
      await tx.planDecision.update({
        where: { planId_orderId: { planId, orderId: input.orderId } },
        data: { decision: "SERVED", source: "DISPATCHER", reason: null, explanation: `Assigned to ${trip.ref} by dispatcher.`, overriddenById: user.sub },
      })
      await tx.auditLog.create({
        data: { actorId: user.sub, action: "ORDER_ASSIGNED", entityType: "Order", entityId: input.orderId, after: { tripId: trip.id, tripRef: trip.ref } },
      })
    })
    if (existing && existing.tripId !== trip.id) await this.recomputeTrip(existing.tripId, plan.depotId, plan.date)
    await this.recomputeTrip(trip.id, plan.depotId, plan.date)
    await this.refreshSummary(planId)
    return this.get(planId)
  }

  async discard(planId: string) {
    await this.requireDraft(planId)
    await this.db.plan.delete({ where: { id: planId } })
    return { ok: true }
  }

  /**
   * Publish: the plan becomes the day's source of truth. Orders move to PLANNED / DEFERRED
   * (deferred ones roll to the next operating day), drivers are attached, fuel is reserved,
   * and store managers are notified.
   */
  async publish(user: SessionUser, planId: string) {
    const plan = await this.requireDraft(planId)
    const full = await this.get(planId)
    const date = plan.date.toISOString().slice(0, 10)
    const nextDay = await this.clock.nextOperatingDay(date)
    const cal = await this.clock.calendar(date)
    const empty = full.trips.filter((t) => t.stops.length === 0)

    await this.db.$transaction(async (tx) => {
      const previous = await tx.plan.findMany({ where: { depotId: plan.depotId, date: plan.date, status: "PUBLISHED" }, select: { id: true } })
      if (previous.length) {
        await tx.plan.updateMany({ where: { id: { in: previous.map((p) => p.id) } }, data: { status: "SUPERSEDED" } })
        await tx.fuelLedgerEntry.deleteMany({ where: { kind: "PLANNED", trip: { planId: { in: previous.map((p) => p.id) } } } })
      }
      if (empty.length) await tx.trip.deleteMany({ where: { id: { in: empty.map((t) => t.id) } } })

      for (const t of full.trips.filter((t) => t.stops.length)) {
        await tx.trip.update({ where: { id: t.id }, data: { driverId: t.vehicle ? (await tx.user.findFirst({ where: { vehicleId: t.vehicleId }, select: { id: true } }))?.id : undefined } })
        await tx.fuelLedgerEntry.create({
          data: { vehicleId: t.vehicleId, tripId: t.id, date: plan.date, isoYear: cal!.isoYear, isoWeek: cal!.isoWeek, kind: "PLANNED", km: t.plannedKm, litres: t.plannedFuelL },
        })
      }

      const served = full.decisions.filter((d) => d.decision === "SERVED").map((d) => d.orderId)
      const deferred = full.decisions.filter((d) => d.decision === "DEFERRED")
      await tx.order.updateMany({ where: { id: { in: served } }, data: { status: "PLANNED" } })
      for (const d of deferred) {
        await tx.order.update({
          where: { id: d.orderId },
          data: { status: "DEFERRED", deliveryDate: dateOnly(nextDay), deferCount: { increment: 1 } },
        })
      }

      // Notify store managers: confirmed with ETA, or deferred with the reason.
      const managers = await tx.user.findMany({
        where: { role: "STORE_MANAGER", outletId: { in: full.decisions.map((d) => d.order.outletId) } },
        select: { id: true, outletId: true },
      })
      const byOutlet = new Map(managers.map((m) => [m.outletId!, m.id]))
      const stopByOrder = new Map(full.trips.flatMap((t) => t.stops.map((s) => [s.orderId, { s, t }] as const)))
      await tx.notification.createMany({
        data: full.decisions.flatMap((d) => {
          const userId = byOutlet.get(d.order.outletId)
          if (!userId) return []
          const hit = stopByOrder.get(d.orderId)
          return d.decision === "SERVED" && hit
            ? [{ userId, type: "ORDER_SCHEDULED", title: `${d.order.ref} scheduled`, body: `Arriving around ${hhmm(hit.s.plannedArrivalMin)} on ${hit.t.ref} (${hit.t.vehicleId}).`, link: `/store/orders/${d.orderId}` }]
            : [{ userId, type: "ORDER_DEFERRED", title: `${d.order.ref} moved to ${nextDay}`, body: d.explanation ?? "Deferred to the next run.", link: `/store/orders/${d.orderId}` }]
        }),
      })

      await tx.plan.update({ where: { id: planId }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: user.sub } })
      await tx.auditLog.create({
        data: { actorId: user.sub, action: "PLAN_PUBLISHED", entityType: "Plan", entityId: planId, after: { served: served.length, deferred: deferred.length, supersedes: previous.map((p) => p.id) } },
      })
    }, { timeout: 30_000 })
    // Fetch road geometry for the published trips in the background (map + live replay).
    void this.routing.ensure(full.trips.filter((t) => t.stops.length).map((t) => t.id))
    return this.get(planId)
  }

  // ── internals ──

  private async requireDraft(planId: string) {
    const plan = await this.db.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException("Plan not found")
    if (plan.status !== "DRAFT") throw new ConflictException("Only a draft plan can be changed. Generate a new version to replan.")
    return plan
  }

  private async validateAssignment(plan: { id: string; depotId: string; date: Date }, input: AssignOrderInput) {
    const date = plan.date.toISOString().slice(0, 10)
    const trip = await this.db.trip.findFirst({
      where: { id: input.tripId, planId: plan.id },
      include: { vehicle: true, stops: { include: { order: { include: { outlet: true } } } } },
    })
    if (!trip) throw new NotFoundException("Trip not in this plan")
    const order = await this.db.order.findUnique({ where: { id: input.orderId }, include: { outlet: true } })
    if (!order) throw new NotFoundException("Order not found")

    const cal = await this.clock.calendar(date)
    const ctx = await loadDepotContext(this.db, plan.depotId, cal!.isoYear, cal!.isoWeek, plan.id)
    const vehicle = ctx.vehicles.find((v) => v.id === trip.vehicleId)!
    // Fuel already committed by this vehicle's other trip in this plan
    const sibling = await this.db.trip.findMany({ where: { planId: plan.id, vehicleId: trip.vehicleId, NOT: { id: trip.id } } })
    vehicle.fuelRemainingL -= sibling.reduce((s, t) => s + t.plannedFuelL, 0)

    const orders = [...trip.stops.filter((s) => s.orderId !== order.id).map((s) => toEngineOrder(s.order, date)), toEngineOrder(order, date)]
    const enforce = ((await this.db.plan.findUnique({ where: { id: plan.id } }))?.summary as { options?: { enforceWindows?: boolean } })?.options?.enforceWindows ?? true
    const violations = validateTrip(ctx.lookup, { vehicle, brand: trip.brand, districtId: trip.districtId, orders }, enforce)

    // Daily budget across the vehicle's trips of the same budget class
    const sameClass = sibling.filter((t) => (t.brand === "FRESH") === (trip.brand === "FRESH"))
    const used = sameClass.reduce((s, t) => s + t.plannedDurationMin, 0)
    const dur = tripDuration(ctx.lookup, trip.brand, trip.districtId, orders)
    const budget = trip.brand === "FRESH" ? RULES.freshBudgetMin : RULES.styleTechBudgetMin
    if (used + dur > budget)
      violations.push({ rule: "TIME", message: `${trip.vehicleId} would use ${Math.round(used + dur)} of ${budget} ${trip.brand === "FRESH" ? "Fresh" : "Style/Tech"} minutes today` })
    if (vehicle && !vehicle.available) violations.push({ rule: "VEHICLE", message: `${trip.vehicleId} is not available today` })
    return { violations, trip }
  }

  /** Re-sequence and re-time a trip after a manual change. */
  private async recomputeTrip(tripId: string, depotId: string, planDate: Date) {
    const date = planDate.toISOString().slice(0, 10)
    const trip = await this.db.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { vehicle: true, stops: { include: { order: { include: { outlet: true } } } } },
    })
    const cal = await this.clock.calendar(date)
    const ctx = await loadDepotContext(this.db, depotId, cal!.isoYear, cal!.isoWeek)
    const orders = trip.stops.map((s) => toEngineOrder(s.order, date))
    if (!orders.length) {
      await this.db.trip.update({ where: { id: tripId }, data: { loadWeightKg: 0, loadVolumeM3: 0, plannedDurationMin: 0, plannedKm: 0, plannedFuelL: 0 } })
      return
    }
    // Keep the vehicle's earlier trip in mind when timing a second trip
    const earlier = await this.db.trip.findFirst({ where: { planId: trip.planId, vehicleId: trip.vehicleId, tripNo: { lt: trip.tripNo } } })
    const earliestDepart = Math.max(
      trip.brand === "FRESH" ? RULES.freshStartMin : RULES.tradingStartMin,
      earlier ? earlier.plannedDepartMin + earlier.plannedDurationMin + (ctx.lookup.district.get(earlier.districtId)?.depotToDistrictMin ?? 0) : 0,
    )
    const s = schedule(ctx.lookup, trip.brand, trip.districtId, orders, earliestDepart)
    const km = tripKm(ctx.lookup, trip.districtId, orders.length)
    await this.db.$transaction([
      this.db.stop.deleteMany({ where: { tripId } }),
      this.db.stop.createMany({
        data: s.stops.map((st) => ({
          tripId,
          orderId: st.orderId,
          seq: st.seq,
          plannedArrivalMin: st.arrivalMin,
          plannedWaitMin: st.waitMin,
          plannedServiceMin: st.serviceMin,
          atRisk: st.atRisk,
          riskReason: st.riskReason,
        })),
      }),
      this.db.trip.update({
        where: { id: tripId },
        data: {
          plannedDepartMin: s.departMin,
          plannedDurationMin: tripDuration(ctx.lookup, trip.brand, trip.districtId, orders),
          plannedKm: km,
          plannedFuelL: Math.round((km / trip.vehicle.kmPerL) * 10) / 10,
          loadWeightKg: Math.round(orders.reduce((a, o) => a + o.weightKg, 0) * 10) / 10,
          loadVolumeM3: Math.round(orders.reduce((a, o) => a + o.volumeM3, 0) * 1000) / 1000,
        },
      }),
    ])
  }

  private async refreshSummary(planId: string) {
    const plan = await this.get(planId)
    const summary = (plan.summary ?? {}) as Record<string, unknown>
    const served = plan.decisions.filter((d) => d.decision === "SERVED").length
    const deferralsByReason: Record<string, number> = {}
    for (const d of plan.decisions) if (d.decision === "DEFERRED" && d.reason) deferralsByReason[d.reason] = (deferralsByReason[d.reason] ?? 0) + 1
    const live = plan.trips.filter((t) => t.stops.length)
    await this.db.plan.update({
      where: { id: planId },
      data: {
        summary: {
          ...summary,
          served,
          deferred: plan.decisions.length - served,
          trips: live.length,
          vehiclesUsed: new Set(live.map((t) => t.vehicleId)).size,
          coveragePct: plan.decisions.length ? Math.round((served / plan.decisions.length) * 100) : 100,
          deferralsByReason,
          edited: true,
        } as Prisma.InputJsonValue,
      },
    })
  }
}

const brandRank = (b: string) => (b === "FRESH" ? 0 : b === "STYLE" ? 1 : 2)
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
