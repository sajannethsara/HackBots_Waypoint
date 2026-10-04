import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import { tripDuration, tripKm } from "@waypoint/engine"
import {
  CARRY_OVER_ISSUE_TYPES,
  dateOnly,
  DEFAULT_DEFER_REASON,
  DEFERRAL_REASON_META,
  formatOrderRef,
  issueActionSchema,
  toDateOnly,
  type DeferralReason,
  type IssueActionInput,
  type IssueActionOption,
  type IssueActionResult,
  type IssueActionsResponse,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"
import { ChatService } from "../chat/chat.service"
import { IssueChatService } from "../issue-chat/issue-chat.module"
import { loadDepotContext, toEngineOrder } from "../planning/engine-input"

const OPEN_STOP = ["PENDING", "ARRIVED"] as const
const FINISHED_ORDER = ["DELIVERED", "RECEIVED", "PARTIAL", "REFUSED", "CANCELLED"]

const issueSelect = {
  id: true,
  ref: true,
  type: true,
  status: true,
  orderId: true,
  orderLineId: true,
  quantity: true,
  tripId: true,
  stopId: true,
  vehicleId: true,
  carryOverOrder: { select: { id: true, ref: true } },
  trip: { select: { id: true, ref: true, vehicleId: true, plan: { select: { depotId: true, date: true } } } },
  order: { select: { id: true, ref: true, status: true, depotId: true, outletId: true, brand: true, temp: true } },
  orderLine: { select: { id: true, description: true, category: true, productId: true, quantity: true, weightKg: true, volumeM3: true, product: { select: { unitWeightKg: true, unitVolumeM3: true } } } },
  outlet: { select: { depotId: true } },
  vehicle: { select: { id: true, status: true, depotId: true } },
} satisfies Prisma.IssueSelect
type IssueRow = Prisma.IssueGetPayload<{ select: typeof issueSelect }>

const stopInclude = {
  order: { include: { outlet: true } },
  trip: { include: { vehicle: true, plan: true, stops: { orderBy: { seq: "asc" as const }, include: { order: { include: { outlet: true } } } } } },
} satisfies Prisma.StopInclude
type StopRow = Prisma.StopGetPayload<{ include: typeof stopInclude }>

@Injectable()
export class IssueActionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
    private readonly chat: ChatService,
    private readonly issueChat: IssueChatService,
  ) {}

  // ───────────────────────────── What can be done ─────────────────────────────

  async options(user: SessionUser, issueId: string): Promise<IssueActionsResponse> {
    const issue = await this.load(user, issueId)
    const out: IssueActionOption[] = []

    if (issue.orderId || issue.stopId) {
      const stop = await this.targetStop(issue)
      const block = this.deferBlock(stop)
      out.push({
        id: "defer-order",
        label: "Defer order to the next run",
        effect: "Removes the order from its trip, re-times the remaining stops, moves the order to the next operating day and tells the store and the driver.",
        target: stop ? `${stop.order.ref} on ${stop.trip.ref} (stop ${stop.seq})` : (issue.order?.ref ?? null),
        available: !block && issue.status !== "RESOLVED",
        unavailableReason: issue.status === "RESOLVED" ? "The issue is already resolved" : (block ?? undefined),
        defaultReason: DEFAULT_DEFER_REASON[issue.type],
      })
    }

    const vehicle = issue.vehicle ?? (issue.trip?.vehicleId ? await this.db.vehicle.findUnique({ where: { id: issue.trip.vehicleId }, select: { id: true, status: true, depotId: true } }) : null)
    if (vehicle?.status === "AVAILABLE") {
      const pending = await this.pendingStopsOf(vehicle.id, this.planDate(issue))
      out.push({
        id: "vehicle-out-of-service",
        label: "Take vehicle out of service",
        effect: "Marks the vehicle as in the workshop so the planner stops using it. Optionally defers every stop it has not served yet.",
        target: vehicle.id,
        available: issue.status !== "RESOLVED",
        unavailableReason: issue.status === "RESOLVED" ? "The issue is already resolved" : undefined,
        pendingStops: pending.length,
      })
    } else if (vehicle?.status === "IN_WORKSHOP") {
      out.push({
        id: "vehicle-return",
        label: "Return vehicle to service",
        effect: "Marks the vehicle as available again so it can be planned.",
        target: vehicle.id,
        available: issue.status !== "RESOLVED",
        unavailableReason: issue.status === "RESOLVED" ? "The issue is already resolved" : undefined,
      })
    }

    const log = await this.db.auditLog.findMany({
      where: { entityType: "Issue", entityId: issueId, action: "ISSUE_ACTION" },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true } } },
    })
    const shortShipped = log.some((l) => (l.after as { shortShipped?: boolean } | null)?.shortShipped)

    if (issue.orderLineId && issue.quantity && issue.orderLine) {
      const blocked = this.shortShipBlock(issue, shortShipped)
      const qty = Math.min(issue.quantity, issue.orderLine.quantity)
      out.push({
        id: "short-ship",
        label: "Ship short and credit the store",
        effect: "Takes the missing or damaged quantity off the order, so loads, weights and the store's expectation match what is on the truck.",
        target: `${qty} × ${issue.orderLine.description}${issue.order ? ` on ${issue.order.ref}` : ""}`,
        available: !blocked && issue.status !== "RESOLVED",
        unavailableReason: issue.status === "RESOLVED" ? "The issue is already resolved" : (blocked ?? undefined),
      })
    }

    if ((CARRY_OVER_ISSUE_TYPES as readonly string[]).includes(issue.type) && issue.orderLine && issue.quantity && issue.order) {
      const date = await this.clock.nextOperatingDay(await this.clock.operatingDate())
      const blocked =
        issue.status === "RESOLVED"
          ? "The issue is already resolved"
          : issue.carryOverOrder
            ? `Already carried over on ${issue.carryOverOrder.ref}`
            : issue.status === "OPEN"
              ? "Acknowledge the issue first, once the report is checked"
              : null
      out.push({
        id: "carry-over",
        label: "Carry over to the next run",
        effect: `Re-sends the units on a carry-over order for the outlet on ${date}, added to one already waiting for that day if there is one. Planning picks it up like any order (with the priority of a deferred one). The store is told.`,
        target: issue.carryOverOrder ? `On ${issue.carryOverOrder.ref}` : `${issue.quantity} × ${issue.orderLine.description} from ${issue.order.ref}`,
        available: !blocked,
        unavailableReason: blocked ?? undefined,
        canShortShip: !this.shortShipBlock(issue, shortShipped),
      })
    }

    return {
      actions: out,
      taken: log.map((l) => {
        const a = (l.after ?? {}) as { action?: IssueActionOption["id"]; summary?: string }
        return { id: l.id, action: a.action ?? "defer-order", summary: a.summary ?? "Action taken", actor: l.actor?.name ?? "Dispatch", at: l.createdAt.toISOString() }
      }),
    }
  }

  // ───────────────────────────── Doing it ─────────────────────────────

  async run(user: SessionUser, issueId: string, input: IssueActionInput): Promise<IssueActionResult> {
    const issue = await this.load(user, issueId)
    if (issue.status === "RESOLVED") throw new ConflictException("The issue is already resolved")

    let summary: string
    switch (input.action) {
      case "defer-order": {
        const stop = await this.targetStop(issue)
        const block = this.deferBlock(stop)
        if (!stop || block) throw new ConflictException(block ?? "No order on a trip to defer")
        summary = await this.deferStop(user, issue, stop.id, input.reason, input.note)
        break
      }
      case "vehicle-out-of-service": {
        const vehicleId = issue.vehicleId ?? issue.trip?.vehicleId
        if (!vehicleId) throw new BadRequestException("This issue has no vehicle")
        const vehicle = await this.db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })
        if (vehicle.status !== "AVAILABLE") throw new ConflictException(`${vehicleId} is already in the workshop`)
        await this.db.vehicle.update({ where: { id: vehicleId }, data: { status: "IN_WORKSHOP" } })
        const deferred: string[] = []
        if (input.deferRemaining) {
          for (const s of await this.pendingStopsOf(vehicleId, this.planDate(issue))) {
            await this.deferStop(user, issue, s.id, "VEHICLE_UNAVAILABLE", input.note ?? `${vehicleId} taken out of service`)
            deferred.push(s.order.ref)
          }
        }
        const driver = await this.db.user.findFirst({ where: { vehicleId, isActive: true }, select: { id: true } })
        if (driver) await this.db.notification.create({ data: { userId: driver.id, type: "VEHICLE_STATUS", title: `${vehicleId} is out of service`, body: input.note ?? `Dispatch took ${vehicleId} out of service after ${issue.ref}.`, link: "/driver" } })
        summary = `${vehicleId} taken out of service${deferred.length ? `; deferred ${deferred.join(", ")} to the next run` : ""}.`
        await this.audit(user, issue, "vehicle-out-of-service", summary)
        break
      }
      case "vehicle-return": {
        const vehicleId = issue.vehicleId ?? issue.trip?.vehicleId
        if (!vehicleId) throw new BadRequestException("This issue has no vehicle")
        const vehicle = await this.db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })
        if (vehicle.status !== "IN_WORKSHOP") throw new ConflictException(`${vehicleId} is not in the workshop`)
        await this.db.vehicle.update({ where: { id: vehicleId }, data: { status: "AVAILABLE" } })
        summary = `${vehicleId} returned to service.`
        await this.audit(user, issue, "vehicle-return", summary)
        break
      }
      case "short-ship": {
        summary = await this.shortShip(user, issue, input.note)
        break
      }
      case "carry-over": {
        summary = await this.carryOver(user, issue, input.shortShip, input.note)
        break
      }
    }

    // Everyone in the room sees what dispatch decided.
    void this.issueChat.systemNote(issueId, `Dispatch decision: ${summary}`)
    void this.chat.postSystemForIssue(issueId, `Dispatch decision: ${summary}`)
    return { summary }
  }

  /** Remove one order from its trip and move it to the next run. */
  private async deferStop(user: SessionUser, issue: IssueRow, stopId: string, reason: DeferralReason, note?: string): Promise<string> {
    const stop = await this.db.stop.findUnique({ where: { id: stopId }, include: stopInclude })
    if (!stop) throw new NotFoundException("Stop not found")
    const block = this.deferBlock(stop)
    if (block) throw new ConflictException(block)

    const { trip, order } = stop
    const plan = trip.plan
    const date = toDateOnly(plan.date)
    const nextDay = await this.clock.nextOperatingDay(date)
    const remaining = trip.stops.filter((s) => s.id !== stop.id)
    // Later stops come earlier by the time spent on the removed one.
    const saved = stop.plannedServiceMin + stop.plannedWaitMin

    let duration = 0
    let km = 0
    if (remaining.length) {
      const cal = await this.clock.calendar(date)
      const ctx = await loadDepotContext(this.db, plan.depotId, cal!.isoYear, cal!.isoWeek)
      const orders = remaining.map((s) => toEngineOrder(s.order, date))
      duration = tripDuration(ctx.lookup, trip.brand, trip.districtId, orders)
      km = tripKm(ctx.lookup, trip.districtId, remaining.length)
    }
    const fuel = Math.round((km / trip.vehicle.kmPerL) * 10) / 10
    const explanation = `Deferred from ${trip.ref} after ${issue.ref}: ${note?.trim() || DEFERRAL_REASON_META[reason].label.toLowerCase()}.`

    await this.db.$transaction(async (tx) => {
      // Keep the issue pointing at the order once its stop is gone.
      await tx.issue.updateMany({ where: { stopId: stop.id, orderId: null }, data: { orderId: order.id } })
      await tx.stop.delete({ where: { id: stop.id } })
      for (const [i, s] of remaining.entries()) {
        const later = s.seq > stop.seq
        await tx.stop.update({
          where: { id: s.id },
          data: { seq: i + 1, ...(later ? { plannedArrivalMin: Math.max(0, s.plannedArrivalMin - saved), etaMin: s.etaMin == null ? undefined : Math.max(0, s.etaMin - saved) } : {}) },
        })
      }
      await tx.trip.update({
        where: { id: trip.id },
        data: {
          plannedDurationMin: duration,
          plannedKm: km,
          plannedFuelL: fuel,
          loadWeightKg: Math.max(0, Math.round((trip.loadWeightKg - order.weightKg) * 10) / 10),
          loadVolumeM3: Math.max(0, Math.round((trip.loadVolumeM3 - order.volumeM3) * 1000) / 1000),
          ...(remaining.length === 0 && ["PLANNED", "LOADING", "LOADED"].includes(trip.status) ? { status: "CANCELLED" as const } : {}),
        },
      })
      await tx.fuelLedgerEntry.updateMany({ where: { tripId: trip.id, kind: "PLANNED" }, data: { km, litres: fuel } })
      await tx.planDecision.upsert({
        where: { planId_orderId: { planId: plan.id, orderId: order.id } },
        update: { decision: "DEFERRED", source: "DISPATCHER", reason, note: note || null, explanation, overriddenById: user.sub },
        create: { planId: plan.id, orderId: order.id, decision: "DEFERRED", source: "DISPATCHER", priorityScore: 0, scoreBreakdown: {}, reason, note: note || null, explanation, overriddenById: user.sub },
      })
      await tx.order.update({ where: { id: order.id }, data: { status: "DEFERRED", deliveryDate: dateOnly(nextDay), deferCount: { increment: 1 } } })
      await tx.auditLog.create({
        data: { actorId: user.sub, action: "DECISION_OVERRIDDEN", entityType: "Order", entityId: order.id, before: { decision: "SERVED", tripId: trip.id }, after: { decision: "DEFERRED", reason, note, issue: issue.ref, movedTo: nextDay } },
      })

      const managers = await tx.user.findMany({ where: { role: "STORE_MANAGER", outletId: order.outletId, isActive: true }, select: { id: true } })
      await tx.notification.createMany({
        data: [
          ...managers.map((m) => ({ userId: m.id, type: "ORDER_DEFERRED", title: `${order.ref} moved to ${nextDay}`, body: explanation, link: `/store-manager/orders/${order.id}` })),
          ...(trip.driverId ? [{ userId: trip.driverId, type: "TRIP_UPDATED", title: `${order.ref} removed from ${trip.ref}`, body: `Skip ${order.outlet.name}: ${explanation}`, link: "/driver" }] : []),
        ],
      })
    })

    await this.refreshSummary(plan.id)
    const summary = `${order.ref} deferred to ${nextDay} and removed from ${trip.ref}${remaining.length ? `; ${remaining.length} stop${remaining.length === 1 ? "" : "s"} re-timed` : "; the trip has no stops left"}.`
    await this.audit(user, issue, "defer-order", summary)
    return summary
  }

  private async shortShip(user: SessionUser, issue: IssueRow, note?: string): Promise<string> {
    const line = issue.orderLine
    if (!issue.orderLineId || !issue.quantity || !line || !issue.orderId) throw new BadRequestException("This issue has no order line and quantity")
    const block = this.shortShipBlock(issue, await this.wasShortShipped(issue.id))
    if (block) throw new ConflictException(block)
    const q = Math.min(issue.quantity, line.quantity)
    const dW = Math.round((line.weightKg / line.quantity) * q * 100) / 100
    const dV = Math.round((line.volumeM3 / line.quantity) * q * 1000) / 1000
    const stop = await this.db.stop.findFirst({ where: { orderId: issue.orderId, trip: { plan: { status: "PUBLISHED" } } }, select: { trip: { select: { id: true } } } })
    const order = issue.order!

    await this.db.$transaction(async (tx) => {
      await tx.orderLine.update({ where: { id: line.id }, data: { quantity: line.quantity - q, weightKg: Math.max(0, line.weightKg - dW), volumeM3: Math.max(0, line.volumeM3 - dV) } })
      await tx.order.update({ where: { id: order.id }, data: { units: { decrement: q }, weightKg: { decrement: dW }, volumeM3: { decrement: dV } } })
      if (stop) {
        const t = await tx.trip.findUniqueOrThrow({ where: { id: stop.trip.id }, select: { loadWeightKg: true, loadVolumeM3: true } })
        await tx.trip.update({ where: { id: stop.trip.id }, data: { loadWeightKg: Math.max(0, t.loadWeightKg - dW), loadVolumeM3: Math.max(0, t.loadVolumeM3 - dV) } })
      }
      const full = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { outletId: true } })
      const managers = await tx.user.findMany({ where: { role: "STORE_MANAGER", outletId: full.outletId, isActive: true }, select: { id: true } })
      await tx.notification.createMany({
        data: managers.map((m) => ({ userId: m.id, type: "ORDER_UPDATED", title: `${order.ref} will arrive ${q} short`, body: note?.trim() || `${q} × ${line.description} will not be delivered. You will be credited.`, link: `/store-manager/orders/${order.id}` })),
      })
      await tx.auditLog.create({ data: { actorId: user.sub, action: "ORDER_SHORT_SHIPPED", entityType: "Order", entityId: order.id, after: { line: line.description, removed: q, issue: issue.ref } } })
    })
    const summary = `${order.ref} ships ${q} × ${line.description} short; the store is credited.`
    await this.audit(user, issue, "short-ship", summary, { shortShipped: true })
    return summary
  }

  /**
   * Re-send an issue's missing/damaged units to the same outlet on the next run. One carry-over order per
   * outlet and day: units from further issues are added to it while it is still waiting for planning.
   */
  private async carryOver(user: SessionUser, issue: IssueRow, alsoShortShip: boolean, note?: string): Promise<string> {
    const { order: source, orderLine: line, quantity: qty } = issue
    if (!(CARRY_OVER_ISSUE_TYPES as readonly string[]).includes(issue.type)) throw new BadRequestException("This kind of issue has no items to carry over")
    if (!source || !line || !qty) throw new BadRequestException("This issue has no order line and quantity")
    if (issue.status === "OPEN") throw new ConflictException("Acknowledge the issue first")
    if (issue.carryOverOrder) throw new ConflictException(`Already carried over on ${issue.carryOverOrder.ref}`)
    if (alsoShortShip) {
      const block = this.shortShipBlock(issue, await this.wasShortShipped(issue.id))
      if (block) throw new ConflictException(block)
    }

    // Per-unit size from the catalogue when known, else from the line as ordered (before any ship-short).
    const unitW = line.product?.unitWeightKg ?? (line.quantity > 0 ? line.weightKg / line.quantity : 0)
    const unitV = line.product?.unitVolumeM3 ?? (line.quantity > 0 ? line.volumeM3 / line.quantity : 0)
    const weightKg = Math.round(unitW * qty * 100) / 100
    const volumeM3 = Math.round(unitV * qty * 1000) / 1000
    const date = await this.clock.nextOperatingDay(await this.clock.operatingDate())
    const why = `${issue.ref}: ${qty} × ${line.description} from ${source.ref}${note?.trim() ? ` (${note.trim()})` : ""}`

    const { carry, merged } = await this.db.$transaction(async (tx) => {
      // Lock the issue row first, so a double click cannot create two orders.
      const [locked] = await tx.$queryRaw<{ carryOverOrderId: string | null }[]>`SELECT "carryOverOrderId" FROM "Issue" WHERE id = ${issue.id} FOR UPDATE`
      if (locked?.carryOverOrderId) throw new ConflictException("This issue was already carried over")

      // Still waiting for planning = submitted and in no plan yet; otherwise start a new one.
      const open = await tx.order.findFirst({
        where: { outletId: source.outletId, deliveryDate: dateOnly(date), temp: source.temp, status: "SUBMITTED", carriedFromOrderId: { not: null }, decisions: { none: {} } },
        select: { id: true, ref: true, notes: true },
      })
      const lineRow = { description: line.description, category: line.category, productId: line.productId, quantity: qty, weightKg, volumeM3 }
      let carry: { id: string; ref: string }
      if (open) {
        await tx.order.update({
          where: { id: open.id },
          data: { units: { increment: qty }, weightKg: { increment: weightKg }, volumeM3: { increment: volumeM3 }, notes: `${open.notes ?? "Carry-over."}\n${why}`.slice(0, 2000), lines: { create: lineRow } },
        })
        carry = { id: open.id, ref: open.ref }
      } else {
        const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_ref_seq') AS n`
        carry = await tx.order.create({
          data: {
            ref: formatOrderRef(Number(n)),
            outletId: source.outletId,
            brand: source.brand,
            depotId: source.depotId,
            temp: source.temp,
            deliveryDate: dateOnly(date),
            requestedDate: dateOnly(date),
            units: qty,
            weightKg,
            volumeM3,
            status: "SUBMITTED",
            // Counts as deferred once, so the planner ranks owed goods like a deferred order.
            deferCount: 1,
            notes: `Carry-over.\n${why}`,
            createdById: user.sub,
            carriedFromOrderId: source.id,
            lines: { create: lineRow },
          },
          select: { id: true, ref: true },
        })
      }
      await tx.issue.update({ where: { id: issue.id }, data: { carryOverOrderId: carry.id } })
      await tx.auditLog.create({
        data: { actorId: user.sub, action: "ORDER_CARRY_OVER", entityType: "Order", entityId: carry.id, after: { issue: issue.ref, from: source.ref, line: line.description, units: qty, date, merged: !!open } },
      })
      const managers = await tx.user.findMany({ where: { role: "STORE_MANAGER", outletId: source.outletId, isActive: true }, select: { id: true } })
      await tx.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          type: "ORDER_UPDATED",
          title: `${qty} × ${line.description} re-sent on ${carry.ref}`,
          body: `Dispatch is re-sending the units from ${issue.ref} (${source.ref}) on the ${date} run.${note?.trim() ? ` ${note.trim()}` : ""}`,
          link: `/store-manager/orders/${carry.id}`,
        })),
      })
      return { carry, merged: !!open }
    })

    let summary = `${qty} × ${line.description} ${merged ? "added to carry-over order" : "carried over on new order"} ${carry.ref} for the ${date} run.`
    if (alsoShortShip) summary += ` ${await this.shortShip(user, issue, note)}`
    await this.audit(user, issue, "carry-over", summary)
    return summary
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private audit(user: SessionUser, issue: IssueRow, action: IssueActionOption["id"], summary: string, extra: Record<string, unknown> = {}) {
    return this.db.auditLog.create({ data: { actorId: user.sub, action: "ISSUE_ACTION", entityType: "Issue", entityId: issue.id, after: { action, summary, ...extra } as Prisma.InputJsonValue } })
  }

  /** Why the issue's units cannot come off the original order now, or null when they can. */
  private shortShipBlock(issue: IssueRow, alreadyShortShipped: boolean): string | null {
    if (!issue.order) return "No order on this issue"
    if (alreadyShortShipped) return "Already shipped short for this issue"
    if (FINISHED_ORDER.includes(issue.order.status)) return `The order is already ${issue.order.status.toLowerCase()}`
    if (!issue.orderLine || issue.orderLine.quantity <= 0) return "Nothing left on that line"
    return null
  }

  private async wasShortShipped(issueId: string) {
    const log = await this.db.auditLog.findMany({ where: { entityType: "Issue", entityId: issueId, action: "ISSUE_ACTION" }, select: { after: true } })
    return log.some((l) => (l.after as { shortShipped?: boolean } | null)?.shortShipped)
  }

  /** Why an order cannot be taken off its trip right now, or null when it can. */
  private deferBlock(stop: StopRow | null): string | null {
    if (!stop) return "This order is not on a trip"
    const { trip } = stop
    if (trip.plan.status === "DRAFT") return "The plan is still a draft: change it in Planning"
    if (trip.plan.status !== "PUBLISHED") return "That trip belongs to an older plan version"
    if (trip.status === "COMPLETED" || trip.status === "CANCELLED") return `${trip.ref} is already ${trip.status.toLowerCase()}`
    if (!(OPEN_STOP as readonly string[]).includes(stop.status)) return `The stop was already ${stop.status.toLowerCase()}`
    return null
  }

  private async targetStop(issue: IssueRow): Promise<StopRow | null> {
    const where: Prisma.StopWhereInput | null = issue.stopId ? { id: issue.stopId } : issue.orderId ? { orderId: issue.orderId, trip: { plan: { status: "PUBLISHED" } } } : null
    if (!where) return null
    return this.db.stop.findFirst({ where, include: stopInclude, orderBy: { trip: { plan: { version: "desc" } } } })
  }

  private planDate(issue: IssueRow) {
    return issue.trip?.plan.date ?? null
  }

  /** Stops a vehicle still has to serve on the published plan of the day. */
  private async pendingStopsOf(vehicleId: string, planDate: Date | null) {
    const date = planDate ?? dateOnly(await this.clock.operatingDate())
    return this.db.stop.findMany({
      where: { status: { in: [...OPEN_STOP] }, trip: { vehicleId, status: { notIn: ["COMPLETED", "CANCELLED"] }, plan: { status: "PUBLISHED", date } } },
      select: { id: true, order: { select: { ref: true } } },
      orderBy: [{ tripId: "asc" }, { seq: "asc" }],
    })
  }

  /** Keep the plan's headline numbers true after a stop was removed. */
  private async refreshSummary(planId: string) {
    const [plan, decisions, trips] = await Promise.all([
      this.db.plan.findUniqueOrThrow({ where: { id: planId }, select: { summary: true } }),
      this.db.planDecision.findMany({ where: { planId }, select: { decision: true, reason: true } }),
      this.db.trip.findMany({ where: { planId, stops: { some: {} } }, select: { vehicleId: true } }),
    ])
    const served = decisions.filter((d) => d.decision === "SERVED").length
    const deferralsByReason: Record<string, number> = {}
    for (const d of decisions) if (d.decision === "DEFERRED" && d.reason) deferralsByReason[d.reason] = (deferralsByReason[d.reason] ?? 0) + 1
    await this.db.plan.update({
      where: { id: planId },
      data: {
        summary: {
          ...((plan.summary ?? {}) as Record<string, unknown>),
          served,
          deferred: decisions.length - served,
          trips: trips.length,
          vehiclesUsed: new Set(trips.map((t) => t.vehicleId)).size,
          coveragePct: decisions.length ? Math.round((served / decisions.length) * 100) : 100,
          deferralsByReason,
          edited: true,
        } as Prisma.InputJsonValue,
      },
    })
  }

  private async load(user: SessionUser, issueId: string): Promise<IssueRow> {
    // Dispatchers work across depots (the depot switcher), like the rest of the issues API.
    if (user.role !== "DISPATCHER") throw new ForbiddenException("Only a dispatcher can do this")
    const issue = await this.db.issue.findUnique({ where: { id: issueId }, select: issueSelect })
    if (!issue) throw new NotFoundException("Issue not found")
    return issue
  }
}

@Roles("DISPATCHER")
@Controller("issues")
export class IssueActionsController {
  constructor(private readonly actions: IssueActionsService) {}

  @Get(":id/actions")
  options(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.actions.options(user, id)
  }

  @Post(":id/actions")
  run(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(issueActionSchema)) body: IssueActionInput) {
    return this.actions.run(user, id, body)
  }
}
