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
  type CreateTripInput,
  type DeferOrderInput,
  type GeneratePlanInput,
  type SaveLayoutInput,
  type TripLayoutInput,
} from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { RoutingService } from "../routing/routing.service"
import { loadDepotContext, toEngineOrder } from "./engine-input"

const PLANNABLE = ["SUBMITTED", "PLANNED", "DEFERRED"] as const

const planInclude = {
  publishedBy: { select: { name: true } },
  depot: { select: { id: true, name: true, lat: true, lng: true } },
  trips: {
    orderBy: { ref: "asc" },
    include: {
      vehicle: true,
      district: { select: { id: true, centroidLat: true, centroidLng: true } },
      driver: { select: { id: true, name: true } },
      loader: { select: { id: true, name: true } },
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
              carriedFromOrderId: true,
              outlet: { select: { id: true, name: true, districtId: true, dockType: true, parkingConstraint: true, windowOpenMin: true, windowCloseMin: true, mallWindowOpenMin: true, mallWindowCloseMin: true, lat: true, lng: true } },
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
          outlet: { select: { id: true, name: true, districtId: true, dockType: true, parkingConstraint: true, windowOpenMin: true, windowCloseMin: true, mallWindowOpenMin: true, mallWindowCloseMin: true, lastDeliveredOn: true, lat: true, lng: true } },
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
      const baseline: Record<string, string[]> = {}
      for (const [i, t] of tripsOrdered.entries()) {
        const created = await tx.trip.create({
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
        baseline[created.id] = t.stops.map((s) => s.orderId)
      }
      // Snapshot of what the engine produced, so a dispatcher can reset a trip to it.
      await tx.plan.update({ where: { id: plan.id }, data: { summary: { ...result.summary, options, baseline } as unknown as Prisma.InputJsonValue } })
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

  /**
   * Removes an order from every open draft plan (its stop and its decision) and re-times the trip it was on.
   * Used when a store cancels an order the dispatcher has drafted but not yet published.
   */
  async dropOrderFromDrafts(orderId: string) {
    const decisions = await this.db.planDecision.findMany({
      where: { orderId, plan: { status: "DRAFT" } },
      select: { id: true, planId: true, plan: { select: { depotId: true, date: true } } },
    })
    for (const d of decisions) {
      const stop = await this.db.stop.findFirst({ where: { orderId, trip: { planId: d.planId } } })
      await this.db.$transaction([...(stop ? [this.db.stop.delete({ where: { id: stop.id } })] : []), this.db.planDecision.delete({ where: { id: d.id } })])
      if (stop) await this.recomputeTrip(stop.tripId, d.plan.depotId, d.plan.date)
      await this.refreshSummary(d.planId)
    }
    return decisions.length
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

  // ── manual trip editing (planning canvas) ──

  /** Times and rule check for a trip's stops in the dispatcher's sequence. Nothing is saved. */
  async previewTrip(planId: string, input: TripLayoutInput) {
    const plan = await this.db.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException("Plan not found")
    return this.toPreview(await this.evaluateTrip(plan, input.tripId, input.orderIds))
  }

  /**
   * Saves manually edited trips in one transaction: stop order is kept as given and re-timed,
   * orders pulled out of a trip must carry a deferral reason, and every other trip an order
   * left is re-timed. Hard rules (capacity, temperature, access, fuel, budget) block the save;
   * tight or missed windows are allowed and surface as at-risk stops.
   */
  async saveLayout(user: SessionUser, planId: string, input: SaveLayoutInput) {
    const plan = await this.requireEditable(planId)
    await this.applyLayout(user, plan, input.trips, input.deferrals)
    return this.get(planId)
  }

  /** Creates an empty trip (optionally seeded with orders) for a vehicle, brand and district. */
  async createTrip(user: SessionUser, planId: string, input: CreateTripInput) {
    const plan = await this.requireEditable(planId)
    const [vehicle, district, trips] = await Promise.all([
      this.db.vehicle.findFirst({ where: { id: input.vehicleId, depotId: plan.depotId } }),
      this.db.district.findFirst({ where: { id: input.districtId, depotId: plan.depotId } }),
      this.db.trip.findMany({ where: { planId }, select: { ref: true, vehicleId: true, tripNo: true } }),
    ])
    if (!vehicle) throw new NotFoundException("Vehicle not found at this depot")
    if (!district) throw new NotFoundException("District not found at this depot")
    if (vehicle.status !== "AVAILABLE") throw new UnprocessableEntityException(`${vehicle.id} is in the workshop`)
    const own = trips.filter((t) => t.vehicleId === vehicle.id)
    if (own.length >= RULES.maxTripsPerVehicle) throw new UnprocessableEntityException(`${vehicle.id} already has ${RULES.maxTripsPerVehicle} trips today`)
    const tripNo = own.some((t) => t.tripNo === 1) ? 2 : 1
    const num = trips.reduce((m, t) => Math.max(m, Number(/(\d+)$/.exec(t.ref)?.[1] ?? 0)), 0) + 1
    const ref = `TRIP-${String(num).padStart(3, "0")}`

    const trip = await this.db.trip.create({
      data: {
        ref,
        planId,
        vehicleId: vehicle.id,
        tripNo,
        brand: input.brand,
        districtId: district.id,
        plannedDepartMin: input.brand === "FRESH" ? RULES.freshStartMin : RULES.tradingStartMin,
        plannedDurationMin: 0,
        plannedKm: 0,
        plannedFuelL: 0,
        loadWeightKg: 0,
        loadVolumeM3: 0,
        // A published plan has already attached drivers; a trip added to it gets its vehicle driver straight away.
        driverId: plan.status === "PUBLISHED" ? (await this.db.user.findFirst({ where: { vehicleId: vehicle.id }, select: { id: true } }))?.id : undefined,
      },
    })
    await this.db.auditLog.create({
      data: { actorId: user.sub, action: "TRIP_CREATED", entityType: "Trip", entityId: trip.id, after: { ref, vehicleId: vehicle.id, brand: input.brand, districtId: district.id } },
    })
    if (input.orderIds.length) await this.applyLayout(user, plan, [{ tripId: trip.id, orderIds: input.orderIds }], [])
    await this.refreshSummary(planId)
    return this.get(planId)
  }

  /** Removes a trip; the orders on it return to the deferred pool with a recorded reason. */
  async removeTrip(user: SessionUser, planId: string, tripId: string) {
    const plan = await this.requireEditable(planId)
    const trip = await this.db.trip.findFirst({ where: { id: tripId, planId }, include: { stops: true } })
    if (!trip) throw new NotFoundException("Trip not in this plan")
    if (trip.liveAt || trip.departedAt) throw new ConflictException(`${trip.ref} is live and can no longer be changed`)
    await this.db.$transaction(async (tx) => {
      await tx.fuelLedgerEntry.deleteMany({ where: { tripId } })
      for (const st of trip.stops)
        await tx.planDecision.update({
          where: { planId_orderId: { planId, orderId: st.orderId } },
          data: { decision: "DEFERRED", source: "DISPATCHER", reason: "OTHER", explanation: `${trip.ref} was removed by the dispatcher.`, note: null, overriddenById: user.sub },
        })
      await tx.trip.delete({ where: { id: tripId } })
      await tx.auditLog.create({ data: { actorId: user.sub, action: "TRIP_REMOVED", entityType: "Trip", entityId: tripId, before: { ref: trip.ref, orders: trip.stops.length } } })
    })
    await this.setManual(planId, tripId, false)
    if (plan.status === "PUBLISHED") await this.syncPublished(plan, { placed: [], deferred: trip.stops.map((s) => s.orderId), trips: [] })
    await this.refreshSummary(planId)
    return this.get(planId)
  }

  /** Puts one trip back to what the engine generated (stops and sequence). */
  async resetTrip(user: SessionUser, planId: string, tripId: string) {
    const plan = await this.requireEditable(planId)
    const trip = await this.db.trip.findFirst({ where: { id: tripId, planId }, include: { stops: true } })
    if (!trip) throw new NotFoundException("Trip not in this plan")
    const snapshot = (plan.summary as { baseline?: Record<string, string[]> } | null)?.baseline
    // Drafts generated before snapshots existed: keep the orders and let the engine re-sort them by window.
    const baseline = snapshot ? (snapshot[tripId] ?? []) : trip.stops.map((s) => s.orderId)
    const known = new Set((await this.db.planDecision.findMany({ where: { planId, orderId: { in: baseline } }, select: { orderId: true } })).map((d) => d.orderId))
    const orderIds = baseline.filter((id) => known.has(id))
    const keep = new Set(orderIds)
    const deferrals = trip.stops
      .filter((s) => !keep.has(s.orderId))
      .map((s) => ({ orderId: s.orderId, reason: "OTHER" as const, note: `${trip.ref} reset to the generated plan.` }))
    await this.applyLayout(user, plan, [{ tripId, orderIds }], deferrals, { resequence: true })
    if (!snapshot) await this.recomputeTrip(tripId, plan.depotId, plan.date)
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
            ? [{ userId, type: "ORDER_SCHEDULED", title: `${d.order.ref} scheduled`, body: `Arriving around ${hhmm(hit.s.plannedArrivalMin)} on ${hit.t.ref} (${hit.t.vehicleId}).`, link: `/store-manager/orders/${d.orderId}` }]
            : [{ userId, type: "ORDER_DEFERRED", title: `${d.order.ref} moved to ${nextDay}`, body: d.explanation ?? "Deferred to the next run.", link: `/store-manager/orders/${d.orderId}` }]
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

  /** Draft plans are fully editable; a published plan can still be changed for trips that have not gone live. */
  private async requireEditable(planId: string) {
    const plan = await this.db.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException("Plan not found")
    if (plan.status === "SUPERSEDED") throw new ConflictException("This plan version was replaced. Open the current plan to edit it.")
    return plan
  }

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

  private earliestDepart(
    ctx: Awaited<ReturnType<typeof loadDepotContext>>,
    trip: { brand: string },
    earlier: { plannedDepartMin: number; plannedDurationMin: number; districtId: string } | null,
  ) {
    return Math.max(
      trip.brand === "FRESH" ? RULES.freshStartMin : RULES.tradingStartMin,
      earlier ? earlier.plannedDepartMin + earlier.plannedDurationMin + (ctx.lookup.district.get(earlier.districtId)?.depotToDistrictMin ?? 0) : 0,
    )
  }

  /** Times a trip's orders in the given sequence and checks every hard operating rule. */
  private async evaluateTrip(plan: { id: string; depotId: string; date: Date }, tripId: string, orderIds: string[]) {
    if (new Set(orderIds).size !== orderIds.length) throw new BadRequestException("An order appears twice in the trip")
    const date = plan.date.toISOString().slice(0, 10)
    const trip = await this.db.trip.findFirst({ where: { id: tripId, planId: plan.id }, include: { vehicle: true } })
    if (!trip) throw new NotFoundException("Trip not in this plan")
    const rows = await this.db.order.findMany({ where: { id: { in: orderIds } }, include: { outlet: true } })
    const byId = new Map(rows.map((o) => [o.id, o]))
    const orders = orderIds.map((id) => {
      const o = byId.get(id)
      if (!o) throw new NotFoundException(`Order ${id} not found`)
      return toEngineOrder(o, date)
    })

    const cal = await this.clock.calendar(date)
    const ctx = await loadDepotContext(this.db, plan.depotId, cal!.isoYear, cal!.isoWeek, plan.id)
    const vehicle = ctx.vehicles.find((v) => v.id === trip.vehicleId)!
    const sibling = await this.db.trip.findMany({ where: { planId: plan.id, vehicleId: trip.vehicleId, NOT: { id: trip.id } } })
    const siblingFuel = sibling.reduce((s, t) => s + t.plannedFuelL, 0)
    vehicle.fuelRemainingL -= siblingFuel

    // Windows are reported as at-risk stops, not blocked: validateTrip runs without window enforcement.
    const violations = orders.length ? validateTrip(ctx.lookup, { vehicle, brand: trip.brand, districtId: trip.districtId, orders }, false) : []
    const sameClass = sibling.filter((t) => (t.brand === "FRESH") === (trip.brand === "FRESH"))
    const usedMin = sameClass.reduce((s, t) => s + t.plannedDurationMin, 0)
    const durationMin = orders.length ? tripDuration(ctx.lookup, trip.brand, trip.districtId, orders) : 0
    const budget = trip.brand === "FRESH" ? RULES.freshBudgetMin : RULES.styleTechBudgetMin
    if (orders.length && usedMin + durationMin > budget)
      violations.push({
        rule: "TIME",
        message: `${trip.vehicleId} would use ${Math.round(usedMin + durationMin)} of ${budget} ${trip.brand === "FRESH" ? "Fresh" : "Style/Tech"} minutes today`,
      })
    if (!vehicle.available) violations.push({ rule: "VEHICLE", message: `${trip.vehicleId} is not available today` })

    const earlier = await this.db.trip.findFirst({ where: { planId: plan.id, vehicleId: trip.vehicleId, tripNo: { lt: trip.tripNo } } })
    const sched = orders.length ? schedule(ctx.lookup, trip.brand, trip.districtId, orders, this.earliestDepart(ctx, trip, earlier), true) : null
    const km = orders.length ? tripKm(ctx.lookup, trip.districtId, orders.length) : 0
    return { trip, orders, sched, violations, durationMin, km, fuelL: Math.round((km / trip.vehicle.kmPerL) * 10) / 10, usedMin, siblingFuel, budget }
  }

  private toPreview(e: Awaited<ReturnType<PlanningService["evaluateTrip"]>>) {
    return {
      tripId: e.trip.id,
      departMin: e.sched?.departMin ?? e.trip.plannedDepartMin,
      endMin: e.sched?.endMin ?? 0,
      durationMin: e.durationMin,
      km: e.km,
      fuelL: e.fuelL,
      loadWeightKg: Math.round(e.orders.reduce((a, o) => a + o.weightKg, 0) * 10) / 10,
      loadVolumeM3: Math.round(e.orders.reduce((a, o) => a + o.volumeM3, 0) * 1000) / 1000,
      vehicleUsedMin: Math.round(e.usedMin + e.durationMin),
      budgetMin: e.budget,
      vehicleFuelL: Math.round((e.siblingFuel + e.fuelL) * 10) / 10,
      stops: (e.sched?.stops ?? []).map((s) => ({
        orderId: s.orderId,
        seq: s.seq,
        arrivalMin: s.arrivalMin,
        waitMin: s.waitMin,
        serviceMin: s.serviceMin,
        windowOpenMin: s.windowOpenMin,
        windowCloseMin: s.windowCloseMin,
        atRisk: s.atRisk,
        riskReason: s.riskReason ?? null,
      })),
      violations: e.violations,
    }
  }

  /** Tracks which trips the dispatcher sequenced by hand, so later re-timing keeps their order. */
  private async setManual(planId: string, tripId: string, on: boolean) {
    const plan = await this.db.plan.findUnique({ where: { id: planId }, select: { summary: true } })
    const summary = (plan?.summary ?? {}) as { manualTrips?: string[] }
    const set = new Set(summary.manualTrips ?? [])
    if (on) set.add(tripId)
    else set.delete(tripId)
    await this.db.plan.update({ where: { id: planId }, data: { summary: { ...summary, manualTrips: [...set] } as unknown as Prisma.InputJsonValue } })
  }

  private async applyLayout(
    user: SessionUser,
    plan: { id: string; depotId: string; date: Date; status?: string },
    layouts: TripLayoutInput[],
    deferrals: SaveLayoutInput["deferrals"],
    opts: { resequence?: boolean } = {},
  ) {
    const planId = plan.id
    const decisions = await this.db.planDecision.findMany({ where: { planId }, select: { orderId: true, decision: true } })
    const inPlan = new Set(decisions.map((d) => d.orderId))
    const wasDeferred = new Set(decisions.filter((d) => d.decision === "DEFERRED").map((d) => d.orderId))
    const placed = new Map<string, string>() // orderId -> tripId
    for (const l of layouts)
      for (const id of l.orderIds) {
        if (!inPlan.has(id)) throw new BadRequestException("Order is not part of this plan")
        if (placed.has(id)) throw new BadRequestException("An order was placed on two trips")
        placed.set(id, l.tripId)
      }
    const deferIds = new Set(deferrals.map((d) => d.orderId))
    for (const d of deferrals) if (placed.has(d.orderId)) throw new BadRequestException("An order cannot be placed and deferred at once")

    const before = await this.db.stop.findMany({ where: { trip: { planId } }, select: { orderId: true, tripId: true } })
    const beforeTrip = new Map(before.map((s) => [s.orderId, s.tripId]))
    const layoutTrips = new Set(layouts.map((l) => l.tripId))
    // Once a trip is live it belongs to the road: neither it nor its orders can be edited.
    const liveRows = await this.db.trip.findMany({ where: { planId, OR: [{ liveAt: { not: null } }, { departedAt: { not: null } }] }, select: { id: true, ref: true } })
    const liveTrips = new Map(liveRows.map((t) => [t.id, t.ref]))
    for (const id of layoutTrips) if (liveTrips.has(id)) throw new ConflictException(`${liveTrips.get(id)} is live and can no longer be changed`)
    for (const s of before)
      if (liveTrips.has(s.tripId) && (placed.has(s.orderId) || deferIds.has(s.orderId))) throw new ConflictException(`That order is on ${liveTrips.get(s.tripId)}, which is already live`)
    // An order taken off an edited trip must either land on another edited trip or be deferred with a reason.
    for (const s of before)
      if (layoutTrips.has(s.tripId) && !placed.has(s.orderId) && !deferIds.has(s.orderId))
        throw new BadRequestException("Orders removed from a trip need a deferral reason")

    const evals: Awaited<ReturnType<PlanningService["evaluateTrip"]>>[] = []
    const failures: { rule: string; message: string }[] = []
    for (const l of layouts) {
      const e = await this.evaluateTrip(plan, l.tripId, l.orderIds)
      evals.push(e)
      for (const v of e.violations) failures.push({ rule: v.rule, message: `${e.trip.ref}: ${v.message}` })
    }
    if (failures.length) throw new UnprocessableEntityException({ message: "Trip breaks operating constraints", violations: failures })

    // Trips outside this edit that lost an order need re-timing.
    const lost = new Set(before.filter((s) => !layoutTrips.has(s.tripId) && (placed.has(s.orderId) || deferIds.has(s.orderId))).map((s) => s.tripId))
    const refOf = new Map(evals.map((e) => [e.trip.id, e.trip.ref]))
    await this.db.$transaction(async (tx) => {
      await tx.stop.deleteMany({
        where: { trip: { planId }, OR: [{ tripId: { in: [...layoutTrips] } }, { orderId: { in: [...placed.keys(), ...deferIds] } }] },
      })
      for (const e of evals) {
        if (e.sched)
          await tx.stop.createMany({
            data: e.sched.stops.map((st) => ({
              tripId: e.trip.id,
              orderId: st.orderId,
              seq: st.seq,
              plannedArrivalMin: st.arrivalMin,
              plannedWaitMin: st.waitMin,
              plannedServiceMin: st.serviceMin,
              atRisk: st.atRisk,
              riskReason: st.riskReason,
            })),
          })
        await tx.trip.update({
          where: { id: e.trip.id },
          data: {
            plannedDepartMin: e.sched?.departMin ?? e.trip.plannedDepartMin,
            plannedDurationMin: e.durationMin,
            plannedKm: e.km,
            plannedFuelL: e.fuelL,
            loadWeightKg: Math.round(e.orders.reduce((a, o) => a + o.weightKg, 0) * 10) / 10,
            loadVolumeM3: Math.round(e.orders.reduce((a, o) => a + o.volumeM3, 0) * 1000) / 1000,
          },
        })
      }
      for (const [orderId, tripId] of placed) {
        if (beforeTrip.get(orderId) === tripId) continue // same trip: only the sequence may have changed
        await tx.planDecision.update({
          where: { planId_orderId: { planId, orderId } },
          data: { decision: "SERVED", source: "DISPATCHER", reason: null, note: null, explanation: `Assigned to ${refOf.get(tripId)} by dispatcher.`, overriddenById: user.sub },
        })
        await tx.auditLog.create({ data: { actorId: user.sub, action: "ORDER_ASSIGNED", entityType: "Order", entityId: orderId, after: { tripId, tripRef: refOf.get(tripId) } } })
      }
      for (const d of deferrals) {
        await tx.planDecision.update({
          where: { planId_orderId: { planId, orderId: d.orderId } },
          data: {
            decision: "DEFERRED",
            source: "DISPATCHER",
            reason: d.reason,
            note: d.note,
            explanation: d.note || `Deferred by dispatcher: ${DEFERRAL_REASON_META[d.reason].label.toLowerCase()}.`,
            overriddenById: user.sub,
          },
        })
        await tx.auditLog.create({ data: { actorId: user.sub, action: "DECISION_OVERRIDDEN", entityType: "Order", entityId: d.orderId, after: { decision: "DEFERRED", reason: d.reason, note: d.note } } })
      }
      await tx.auditLog.create({
        data: { actorId: user.sub, action: "TRIPS_EDITED", entityType: "Plan", entityId: planId, after: { trips: layouts.map((l) => ({ tripId: l.tripId, stops: l.orderIds.length })) } },
      })
    }, { timeout: 30_000 })
    for (const l of layouts) await this.setManual(planId, l.tripId, !opts.resequence)
    for (const tripId of lost) await this.recomputeTrip(tripId, plan.depotId, plan.date)
    if (plan.status === "PUBLISHED")
      await this.syncPublished(plan, {
        placed: [...placed.keys()].filter((id) => wasDeferred.has(id)),
        deferred: deferrals.map((d) => d.orderId).filter((id) => !wasDeferred.has(id)),
        trips: [...layoutTrips, ...lost],
      })
    await this.refreshSummary(planId)
  }

  /**
   * A published plan has already told stores and the fuel ledger what will happen. After an edit:
   * orders that came back onto a trip are scheduled again, orders pushed off roll to the next day,
   * fuel is re-booked for the edited trips, and their crews must claim them again.
   */
  private async syncPublished(plan: { id: string; depotId: string; date: Date }, change: { placed: string[]; deferred: string[]; trips: string[] }) {
    const date = plan.date.toISOString().slice(0, 10)
    const nextDay = await this.clock.nextOperatingDay(date)
    const cal = await this.clock.calendar(date)
    const trips = change.trips.length ? await this.db.trip.findMany({ where: { id: { in: change.trips } }, include: { stops: { select: { id: true } } } }) : []
    const touched = [...change.placed, ...change.deferred]
    const orders = touched.length ? await this.db.order.findMany({ where: { id: { in: touched } }, select: { id: true, ref: true, outletId: true, deferCount: true } }) : []
    const stops = change.placed.length
      ? await this.db.stop.findMany({ where: { orderId: { in: change.placed }, trip: { planId: plan.id } }, select: { orderId: true, plannedArrivalMin: true, trip: { select: { ref: true, vehicleId: true } } } })
      : []
    const managers = orders.length ? await this.db.user.findMany({ where: { role: "STORE_MANAGER", outletId: { in: orders.map((o) => o.outletId) } }, select: { id: true, outletId: true } }) : []
    const manager = new Map(managers.map((m) => [m.outletId!, m.id]))
    const stopOf = new Map(stops.map((s) => [s.orderId, s]))

    await this.db.$transaction(async (tx) => {
      for (const o of orders) {
        const back = change.placed.includes(o.id)
        await tx.order.update({
          where: { id: o.id },
          data: back
            ? { status: "PLANNED", deliveryDate: plan.date, deferCount: Math.max(0, o.deferCount - 1) }
            : { status: "DEFERRED", deliveryDate: dateOnly(nextDay), deferCount: { increment: 1 } },
        })
        const userId = manager.get(o.outletId)
        const hit = stopOf.get(o.id)
        if (userId)
          await tx.notification.create({
            data:
              back && hit
                ? { userId, type: "ORDER_SCHEDULED", title: `${o.ref} scheduled`, body: `Arriving around ${hhmm(hit.plannedArrivalMin)} on ${hit.trip.ref} (${hit.trip.vehicleId}).`, link: `/store-manager/orders/${o.id}` }
                : { userId, type: "ORDER_DEFERRED", title: `${o.ref} moved to ${nextDay}`, body: "Dispatch changed the plan after it was published.", link: `/store-manager/orders/${o.id}` },
          })
      }
      for (const t of trips) {
        await tx.fuelLedgerEntry.deleteMany({ where: { tripId: t.id, kind: "PLANNED" } })
        if (t.stops.length && cal)
          await tx.fuelLedgerEntry.create({ data: { vehicleId: t.vehicleId, tripId: t.id, date: plan.date, isoYear: cal.isoYear, isoWeek: cal.isoWeek, kind: "PLANNED", km: t.plannedKm, litres: t.plannedFuelL } })
      }
      // The load list changed, so whoever claimed these trips must look again.
      if (trips.length) await tx.trip.updateMany({ where: { id: { in: trips.map((t) => t.id) } }, data: { driverClaimedAt: null, loaderClaimedAt: null, loaderId: null } })
      await tx.auditLog.create({ data: { action: "PUBLISHED_PLAN_EDITED", entityType: "Plan", entityId: plan.id, after: { scheduled: change.placed.length, deferred: change.deferred.length, trips: change.trips.length } } })
    })
  }

  /** Re-sequence and re-time a trip after a manual change. */
  private async recomputeTrip(tripId: string, depotId: string, planDate: Date) {
    const date = planDate.toISOString().slice(0, 10)
    const trip = await this.db.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { vehicle: true, stops: { orderBy: { seq: "asc" }, include: { order: { include: { outlet: true } } } } },
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
    // Trips the dispatcher sequenced by hand keep that order; engine trips are re-sorted by window.
    const planRow = await this.db.plan.findUnique({ where: { id: trip.planId }, select: { summary: true } })
    const manual = (planRow?.summary as { manualTrips?: string[] } | null)?.manualTrips ?? []
    const s = schedule(ctx.lookup, trip.brand, trip.districtId, orders, earliestDepart, manual.includes(tripId))
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
