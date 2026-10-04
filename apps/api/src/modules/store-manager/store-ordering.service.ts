import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  addDays,
  dateOnly,
  formatOrderRef,
  minToHHMM,
  RULES,
  toDateOnly,
  type CancelStoreOrderInput,
  type CreateStoreOrderInput,
  type UpdateStoreOrderInput,
  type StoreOrderRules,
  type StoreOrderSaved,
  type StoreProduct,
  type StoreTemp,
} from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { PlanningService } from "../planning/planning.service"

const HORIZON_DAYS = 21
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
const hhmmToMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))

/** Minutes since midnight in Sri Lanka, which is what the order cutoff is measured in. */
function colomboMinutes(now = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Colombo" })
    .format(now)
    .split(":")
    .map(Number)
  return h * 60 + m
}

interface Violation {
  rule: string
  message: string
}

/**
 * Creating orders. The wizard reads `rules()` to disable what is not allowed, but nothing here trusts it:
 * brand, temperature, calendar, cutoff, window and load-size rules are all checked again on the server.
 */
@Injectable()
export class StoreOrderingService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
    private readonly planning: PlanningService,
  ) {}

  private async outletOf(user: SessionUser) {
    if (!user.outletId) throw new ForbiddenException("This account is not linked to an outlet")
    return this.db.outlet.findUniqueOrThrow({ where: { id: user.outletId } })
  }

  /** Vehicles that could physically carry this outlet's orders of the given temperature. */
  private fleetFor(outlet: { depotId: string; parkingConstraint: string }, temp: StoreTemp) {
    return this.db.vehicle.findMany({
      where: {
        depotId: outlet.depotId,
        temp: temp === "CHILLED" ? "REEFER" : "AMBIENT",
        ...(outlet.parkingConstraint === "VAN_ONLY" ? { type: "VAN" } : {}),
      },
      select: { weightCapKg: true, volumeCapM3: true },
    })
  }

  async rules(user: SessionUser): Promise<StoreOrderRules> {
    const outlet = await this.outletOf(user)
    const today = await this.clock.operatingDate()
    const nowMin = colomboMinutes()
    const cutoffMin = await this.cutoffMin()
    const latestDate = addDays(today, HORIZON_DAYS)

    const days = await this.db.calendarDay.findMany({
      where: { date: { gt: dateOnly(today), lte: dateOnly(latestDate) } },
      orderBy: { date: "asc" },
      select: { date: true, isOperating: true },
    })
    const earliest = days.find((d) => d.isOperating && this.beforeCutoff(toDateOnly(d.date), today, nowMin, cutoffMin))
    const [chilled, ambient] = await Promise.all([this.fleetFor(outlet, "CHILLED"), this.fleetFor(outlet, "AMBIENT")])
    const limit = (fleet: { weightCapKg: number; volumeCapM3: number }[]) =>
      fleet.length ? { weightKg: Math.max(...fleet.map((v) => v.weightCapKg)), volumeM3: Math.max(...fleet.map((v) => v.volumeCapM3)) } : null

    return {
      today,
      nowMin,
      cutoffMin,
      brand: outlet.brand,
      tempOptions: outlet.brand === "FRESH" ? ["AMBIENT", "CHILLED"] : ["AMBIENT"],
      earliestDate: earliest ? toDateOnly(earliest.date) : addDays(today, 1),
      latestDate,
      closedDates: days.filter((d) => !d.isOperating).map((d) => toDateOnly(d.date)),
      window: { openMin: outlet.windowOpenMin, closeMin: outlet.windowCloseMin },
      limits: { CHILLED: limit(chilled), AMBIENT: limit(ambient) },
    }
  }

  async products(user: SessionUser, temp: StoreTemp, q?: string): Promise<StoreProduct[]> {
    const outlet = await this.outletOf(user)
    return this.db.product.findMany({
      where: {
        brand: outlet.brand,
        temp,
        isActive: true,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, sku: true, name: true, category: true, temp: true, unitLabel: true, unitWeightKg: true, unitVolumeM3: true, maxQty: true },
    })
  }

  async create(user: SessionUser, input: CreateStoreOrderInput): Promise<StoreOrderSaved> {
    const outlet = await this.outletOf(user)

    // Idempotency: a replayed request returns what the first one produced.
    const replay = await this.db.order.findUnique({ where: { clientRequestId: input.clientRequestId }, select: { id: true, outletId: true, status: true } })
    if (replay && replay.outletId !== outlet.id) throw new ConflictException("Request id already used")
    if (replay && replay.status !== "DRAFT") return this.saved(replay.id)
    const draftId = input.draftId ?? replay?.id

    const submit = input.mode === "submit"
    const { fields, lineRows, units, weightKg } = await this.prepare(user, outlet, input, submit)
    const data = { ...fields, clientRequestId: input.clientRequestId, ...(submit ? { status: "SUBMITTED" as const, submittedAt: new Date() } : {}) }

    const id = await this.db.$transaction(async (tx) => {
      if (draftId) {
        const draft = await tx.order.findFirst({ where: { id: draftId, outletId: outlet.id }, select: { status: true } })
        if (!draft) throw new NotFoundException("Draft not found")
        if (draft.status !== "DRAFT") throw new ConflictException("This order has already been submitted and can no longer be changed here.")
        await tx.orderLine.deleteMany({ where: { orderId: draftId } })
        await tx.order.update({ where: { id: draftId }, data: { ...data, lines: { create: lineRows } } })
      } else {
        const created = await this.insertOrder(tx, user, outlet, { ...data, status: submit ? "SUBMITTED" : "DRAFT", lines: { create: lineRows } })
        return this.finish(tx, user, created, submit, units, weightKg)
      }
      return this.finish(tx, user, draftId, submit, units, weightKg)
    })
    return this.saved(id)
  }

  /**
   * Applies every ordering rule to a set of lines and delivery details. Throws a 422 listing all violations,
   * otherwise returns the rows to store. `submit` is false for drafts, which may be incomplete.
   */
  private async prepare(
    user: SessionUser,
    outlet: Awaited<ReturnType<StoreOrderingService["outletOf"]>>,
    input: Pick<CreateStoreOrderInput, "temp" | "deliveryDate" | "windowPref" | "notes" | "lines">,
    submit: boolean,
  ) {
    const violations: Violation[] = []

    // Brand and temperature
    if (input.temp === "CHILLED" && outlet.brand !== "FRESH")
      violations.push({ rule: "TEMP", message: `${outlet.brand.charAt(0) + outlet.brand.slice(1).toLowerCase()} outlets cannot order chilled goods.` })

    const products = await this.db.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } })
    const byId = new Map(products.map((p) => [p.id, p]))
    for (const l of input.lines) {
      const p = byId.get(l.productId)
      if (!p || !p.isActive) violations.push({ rule: "PRODUCT", message: "A selected product is no longer available." })
      else if (p.brand !== outlet.brand || p.temp !== input.temp) violations.push({ rule: "BRAND", message: `${p.name} cannot be ordered by this outlet as ${input.temp.toLowerCase()}.` })
      else if (l.quantity > p.maxQty) violations.push({ rule: "MAX_QTY", message: `${p.name}: at most ${p.maxQty} per order.` })
    }

    const lines = input.lines.flatMap((l) => {
      const p = byId.get(l.productId)
      return p ? [{ p, quantity: l.quantity, weightKg: round(p.unitWeightKg * l.quantity, 2), volumeM3: round(p.unitVolumeM3 * l.quantity, 4) }] : []
    })
    const units = lines.reduce((s, l) => s + l.quantity, 0)
    const weightKg = round(lines.reduce((s, l) => s + l.weightKg, 0), 2)
    const volumeM3 = round(lines.reduce((s, l) => s + l.volumeM3, 0), 3)

    const rules = await this.rules(user)
    if (submit) {
      if (!lines.length) violations.push({ rule: "EMPTY", message: "Add at least one product." })
      if (!input.deliveryDate) violations.push({ rule: "DATE", message: "Choose a delivery date." })
    }
    if (input.deliveryDate) violations.push(...(await this.dateViolations(input.deliveryDate, rules)))
    if (input.windowPref) {
      const [a, b] = input.windowPref.split("-").map(hhmmToMin)
      if (a >= b || a < rules.window.openMin || b > rules.window.closeMin)
        violations.push({ rule: "WINDOW", message: `Choose a time inside your receiving window (${minToHHMM(rules.window.openMin)}–${minToHHMM(rules.window.closeMin)}).` })
    }
    if (submit && lines.length) {
      const fleet = await this.fleetFor(outlet, input.temp)
      if (!fleet.some((v) => v.weightCapKg >= weightKg && v.volumeCapM3 >= volumeM3)) {
        const lim = rules.limits[input.temp]
        violations.push({
          rule: "SIZE",
          message: lim
            ? `This order (${weightKg} kg, ${volumeM3} m³) is larger than any one vehicle can carry (up to ${Math.round(lim.weightKg)} kg and ${lim.volumeM3} m³). Split it into two orders.`
            : "No vehicle can currently carry this kind of order.",
        })
      }
    }
    if (violations.length) throw new UnprocessableEntityException({ message: "Order not accepted", violations })

    const deliveryDate = dateOnly(input.deliveryDate ?? rules.earliestDate)
    const lineRows = lines.map((l) => ({
      productId: l.p.id,
      description: l.p.name,
      category: l.p.category,
      quantity: l.quantity,
      weightKg: l.weightKg,
      volumeM3: l.volumeM3,
    }))
    const fields = {
      temp: input.temp,
      deliveryDate,
      requestedDate: deliveryDate,
      units,
      weightKg,
      volumeM3,
      notes: input.notes || null,
      windowPref: input.windowPref ?? null,
    }
    return { fields, lineRows, units, weightKg }
  }

  /** Edit a submitted order the dispatcher has not planned yet. Same rules as creating it. */
  async update(user: SessionUser, id: string, input: UpdateStoreOrderInput): Promise<StoreOrderSaved> {
    const outlet = await this.outletOf(user)
    const order = await this.db.order.findFirst({ where: { id, outletId: outlet.id }, select: { status: true } })
    if (!order) throw new NotFoundException("Order not found")
    this.assertEditable(order.status)
    const { fields, lineRows, units, weightKg } = await this.prepare(user, outlet, input, true)

    await this.db.$transaction(async (tx) => {
      // Re-check inside the transaction: a plan may have been published since the page loaded.
      const fresh = await tx.order.findUniqueOrThrow({ where: { id }, select: { status: true } })
      this.assertEditable(fresh.status)
      await tx.orderLine.deleteMany({ where: { orderId: id } })
      await tx.order.update({ where: { id }, data: { ...fields, lines: { create: lineRows } } })
      await tx.auditLog.create({ data: { actorId: user.sub, action: "ORDER_EDITED", entityType: "Order", entityId: id, after: { units, weightKg } } })
    })
    return this.saved(id)
  }

  /** Cancel a submitted order the dispatcher has not planned yet. Same rule as editing. */
  async cancel(user: SessionUser, id: string, input: CancelStoreOrderInput): Promise<StoreOrderSaved> {
    const outlet = await this.outletOf(user)
    const order = await this.db.order.findFirst({ where: { id, outletId: outlet.id }, select: { status: true } })
    if (!order) throw new NotFoundException("Order not found")
    this.assertCancellable(order.status)

    // Take it out of any draft plan first, so publishing that draft cannot bring a cancelled order back.
    await this.planning.dropOrderFromDrafts(id)
    await this.db.$transaction(async (tx) => {
      // The status guard is in the UPDATE itself, so a plan published a moment ago wins the race.
      const { count } = await tx.order.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: "CANCELLED" } })
      if (!count) throw new ConflictException("Dispatch has just planned this order, so it can no longer be cancelled. Message dispatch instead.")
      await tx.auditLog.create({
        data: { actorId: user.sub, action: "ORDER_CANCELLED", entityType: "Order", entityId: id, before: { status: "SUBMITTED" }, after: { reason: input.reason, note: input.note ?? null } },
      })
    })
    return this.saved(id)
  }

  private assertCancellable(status: string) {
    if (status === "SUBMITTED") return
    throw new ConflictException(
      status === "CANCELLED"
        ? "This order is already cancelled."
        : status === "DRAFT"
          ? "Drafts are not submitted orders. Open the draft to change it."
          : "Dispatch has already planned this order, so it can no longer be cancelled here. Message dispatch if it has to change.",
    )
  }

  private assertEditable(status: string) {
    if (status !== "SUBMITTED")
      throw new ConflictException(
        status === "DRAFT"
          ? "Drafts are edited from the order wizard."
          : status === "CANCELLED"
            ? "This order is cancelled and can no longer be edited."
            : "Dispatch has already planned this order, so it can no longer be edited. Message dispatch if something has to change.",
      )
  }

  private async finish(tx: Prisma.TransactionClient, user: SessionUser, id: string, submit: boolean, units: number, weightKg: number) {
    if (submit)
      await tx.auditLog.create({ data: { actorId: user.sub, action: "ORDER_SUBMITTED", entityType: "Order", entityId: id, after: { units, weightKg } } })
    return id
  }

  /** Creates the order with the next number from `order_ref_seq`, which is unique across every outlet. */
  private async insertOrder(
    tx: Prisma.TransactionClient,
    user: SessionUser,
    outlet: { id: string; brand: Prisma.OrderUncheckedCreateInput["brand"]; depotId: string },
    data: Omit<Prisma.OrderUncheckedCreateInput, "ref" | "outletId" | "brand" | "depotId" | "createdById">,
  ) {
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_ref_seq') AS n`
    const order = await tx.order.create({
      data: { ...data, ref: formatOrderRef(Number(n)), outletId: outlet.id, brand: outlet.brand, depotId: outlet.depotId, createdById: user.sub },
      select: { id: true },
    })
    return order.id
  }

  private async dateViolations(date: string, rules: StoreOrderRules): Promise<Violation[]> {
    if (date < rules.earliestDate || date > rules.latestDate) {
      const closedForCutoff = date > rules.today && date < rules.earliestDate && !rules.closedDates.includes(date)
      return [
        {
          rule: closedForCutoff ? "CUTOFF" : "DATE_RANGE",
          message: closedForCutoff
            ? `Orders for that day closed at ${minToHHMM(rules.cutoffMin)} the day before. The earliest delivery date is ${rules.earliestDate}.`
            : `Choose a delivery date between ${rules.earliestDate} and ${rules.latestDate}.`,
        },
      ]
    }
    if (rules.closedDates.includes(date)) return [{ rule: "CALENDAR", message: "We do not deliver on that day. Choose an operating day (Mon–Sat, excluding holidays)." }]
    return []
  }

  private beforeCutoff(date: string, today: string, nowMin: number, cutoffMin: number) {
    // Orders for day D close at the cutoff on D-1; an earlier D-1 has already passed.
    const closes = addDays(date, -1)
    return closes > today || (closes === today && nowMin < cutoffMin)
  }

  private async cutoffMin() {
    const s = await this.db.appSetting.findUnique({ where: { key: "orderCutoffMin" } })
    return typeof s?.value === "number" ? s.value : RULES.orderCutoffMin
  }

  private async saved(id: string): Promise<StoreOrderSaved> {
    const o = await this.db.order.findUniqueOrThrow({
      where: { id },
      select: { id: true, ref: true, status: true, deliveryDate: true, units: true, weightKg: true, _count: { select: { lines: true } } },
    })
    return { id: o.id, ref: o.ref, status: o.status, deliveryDate: toDateOnly(o.deliveryDate), units: o.units, items: o._count.lines, weightKg: o.weightKg }
  }
}
