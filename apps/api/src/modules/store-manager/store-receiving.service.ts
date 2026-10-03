import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  LINE_CONDITION_LABEL,
  toDateOnly,
  dateOnly,
  type DeliveryStage,
  type IssueSeverity,
  type IssueType,
  type LineCondition,
  type LiveSnapshot,
  type ReceiveDeliveryInput,
  type ReportStoreIssueInput,
  type StoreDeliveriesQuery,
  type StoreDeliveriesResponse,
  type StoreDeliveryItem,
  type StoreDeliveryTab,
  type StoreIssueDetail,
  type StoreIssueRow,
  type StoreMediaSaved,
  type StoreOnTheWay,
  type StoreReceiptResult,
  type StoreReceivingDetail,
  type DriverMediaInput,
} from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { IssuesService } from "../issues/issues.service"
import { LiveService } from "../live/live.service"
import { MediaStorage } from "../media/media.module"

const EXCLUDED = ["DRAFT", "CANCELLED"] as const
const FINISHED = ["DELIVERED", "PARTIAL", "REFUSED", "RECEIVED"] as const

const stopSelect = {
  where: { trip: { plan: { status: "PUBLISHED" as const } } },
  take: 1,
  select: {
    plannedArrivalMin: true,
    etaMin: true,
    status: true,
    trip: { select: { id: true, ref: true, status: true, vehicleId: true, driver: { select: { name: true, phone: true } } } },
  },
} satisfies Prisma.Order$stopsArgs

const itemSelect = {
  id: true,
  ref: true,
  status: true,
  temp: true,
  units: true,
  deliveryDate: true,
  _count: { select: { lines: true } },
  stops: stopSelect,
} satisfies Prisma.OrderSelect

type ItemSource = Prisma.OrderGetPayload<{ select: typeof itemSelect }>

/** Stage on the road, from the order's own status (the driver app moves it) and whether the driver is at the door. */
function stageOf(status: string, stopStatus?: string): DeliveryStage | null {
  switch (status) {
    case "PLANNED":
      return "PLANNED"
    case "LOADED":
      return "LOADED"
    case "IN_TRANSIT":
      return stopStatus === "ARRIVED" ? "ARRIVED" : "ON_THE_WAY"
    case "DELIVERED":
    case "PARTIAL":
      return "DELIVERED"
    case "RECEIVED":
      return "RECEIVED"
    default:
      return null
  }
}

/** Severity from how bad the problem is: most of a line missing, or spoiled chilled stock, is urgent. */
function severityOf(type: IssueType, qty: number | null, expected: number | null, chilled: boolean): IssueSeverity {
  if (type === "RECEIPT_MISSING" && qty && expected && qty / expected >= 0.5) return "HIGH"
  if ((type === "RECEIPT_DAMAGED" || type === "TEMPERATURE") && chilled) return "HIGH"
  return type === "OTHER" ? "LOW" : "MEDIUM"
}

@Injectable()
export class StoreReceivingService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
    private readonly live: LiveService,
    private readonly issues: IssuesService,
    private readonly storage: MediaStorage,
  ) {}

  private outletOf(user: SessionUser) {
    if (!user.outletId) throw new ForbiddenException("This account is not linked to an outlet")
    return user.outletId
  }

  // ───────────────────────────── Deliveries ─────────────────────────────

  async deliveries(user: SessionUser, q: StoreDeliveriesQuery): Promise<StoreDeliveriesResponse> {
    const outletId = this.outletOf(user)
    const today = await this.clock.operatingDate()
    const day = dateOnly(today)
    const base: Prisma.OrderWhereInput = { outletId, status: { notIn: [...EXCLUDED] } }
    const tabWhere: Record<StoreDeliveryTab, Prisma.OrderWhereInput> = {
      upcoming: { ...base, deliveryDate: { gt: day } },
      today: { ...base, deliveryDate: day },
      history: { ...base, deliveryDate: { lt: day }, status: { in: [...FINISHED] } },
    }

    const [total, rows, upcoming, todayN, history, active] = await Promise.all([
      this.db.order.count({ where: tabWhere[q.tab] }),
      this.db.order.findMany({
        where: tabWhere[q.tab],
        orderBy: q.tab === "upcoming" ? [{ deliveryDate: "asc" }, { ref: "asc" }] : [{ deliveryDate: "desc" }, { ref: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: itemSelect,
      }),
      this.db.order.count({ where: tabWhere.upcoming }),
      this.db.order.count({ where: tabWhere.today }),
      this.db.order.count({ where: tabWhere.history }),
      // The "on the way" card always looks at today's run, whichever tab is open.
      this.db.order.findMany({ where: { ...tabWhere.today, status: { in: ["PLANNED", "LOADED", "IN_TRANSIT"] } }, select: itemSelect }),
    ])

    const snapshot = active.length ? await this.snapshot(outletId, today) : null
    const liveStop = (orderId: string) => {
      for (const t of snapshot?.trips ?? []) {
        const s = t.stops.find((x) => x.orderId === orderId)
        if (s) return { trip: t, stop: s }
      }
      return null
    }

    const toItem = (o: ItemSource): StoreDeliveryItem => {
      const stop = o.stops[0]
      const lv = o.status === "IN_TRANSIT" || o.status === "PLANNED" || o.status === "LOADED" ? liveStop(o.id) : null
      return {
        orderId: o.id,
        orderRef: o.ref,
        status: o.status,
        stage: stageOf(o.status, stop?.status),
        deliveryDate: toDateOnly(o.deliveryDate),
        temp: o.temp,
        units: o.units,
        items: o._count.lines,
        vehicleId: stop?.trip.vehicleId ?? null,
        driverName: stop?.trip.driver?.name ?? null,
        plannedArrivalMin: stop?.plannedArrivalMin ?? null,
        etaMin: lv ? Math.round(lv.stop.etaMin) : (stop?.etaMin ?? null),
        canReceive: o.status === "DELIVERED" || o.status === "PARTIAL",
      }
    }

    return {
      tab: q.tab,
      today,
      items: rows.map(toItem),
      total,
      page: q.page,
      pageSize: q.pageSize,
      counts: { upcoming, today: todayN, history },
      onTheWay: this.pickOnTheWay(active, liveStop, snapshot),
    }
  }

  private pickOnTheWay(
    active: ItemSource[],
    liveStop: (orderId: string) => { trip: LiveSnapshot["trips"][number]; stop: LiveSnapshot["trips"][number]["stops"][number] } | null,
    snapshot: LiveSnapshot | null,
  ): StoreOnTheWay | null {
    const rank = (o: ItemSource) => ({ IN_TRANSIT: 0, LOADED: 1, PLANNED: 2 })[o.status as "IN_TRANSIT"] ?? 3
    const o = [...active].filter((x) => x.stops[0]).sort((a, b) => rank(a) - rank(b) || a.ref.localeCompare(b.ref))[0]
    if (!o) return null
    const stop = o.stops[0]
    const lv = liveStop(o.id)
    const stage = stageOf(o.status, stop.status) as DeliveryStage
    const mine = lv?.stop
    const trip = lv?.trip
    const stopsBefore = trip && mine ? trip.stops.filter((s) => s.seq < mine.seq && s.status !== "COMPLETED").length : 0
    return {
      orderId: o.id,
      orderRef: o.ref,
      stage,
      tripRef: stop.trip.ref,
      vehicleId: stop.trip.vehicleId,
      vehicleLabel: trip?.vehicleLabel ?? stop.trip.vehicleId,
      driver: stop.trip.driver,
      plannedArrivalMin: stop.plannedArrivalMin,
      etaMin: Math.round(mine?.etaMin ?? stop.etaMin ?? stop.plannedArrivalMin),
      delayMin: Math.round(mine?.delayMin ?? 0),
      windowOpenMin: mine?.windowOpenMin ?? 0,
      windowCloseMin: mine?.windowCloseMin ?? 0,
      stopsBefore,
      totalStops: trip?.stops.length ?? 0,
      live: !!snapshot && (!!trip?.reported || snapshot.clock.running),
      units: o.units,
      items: o._count.lines,
    }
  }

  /** The depot's live picture for today, or null when there is no plan to follow. The store only ever sees its own stop. */
  private async snapshot(outletId: string, date: string): Promise<LiveSnapshot | null> {
    const outlet = await this.db.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { depotId: true } })
    return this.live.snapshot(outlet.depotId, date).catch(() => null)
  }

  // ───────────────────────────── Receiving ─────────────────────────────

  async receiving(user: SessionUser, orderId: string): Promise<StoreReceivingDetail> {
    const outletId = this.outletOf(user)
    const order = await this.db.order.findFirst({
      where: { id: orderId, outletId },
      select: {
        id: true,
        ref: true,
        status: true,
        temp: true,
        receipt: { select: { id: true } },
        lines: { orderBy: { description: "asc" }, select: { id: true, description: true, category: true, quantity: true } },
      },
    })
    if (!order) throw new NotFoundException("Order not found")
    const pod = await this.db.proofOfDelivery.findFirst({
      where: { stop: { orderId } },
      select: { recipientName: true, notes: true, capturedAt: true, lines: { select: { orderLineId: true, deliveredQty: true, refusedQty: true, reason: true } } },
    })
    const byLine = new Map(pod?.lines.map((l) => [l.orderLineId, l]))
    return {
      orderId: order.id,
      orderRef: order.ref,
      status: order.status,
      temp: order.temp,
      deliveredAt: pod?.capturedAt.toISOString() ?? null,
      recipientName: pod?.recipientName ?? null,
      driverNotes: pod?.notes ?? null,
      received: !!order.receipt,
      canReceive: (order.status === "DELIVERED" || order.status === "PARTIAL") && !order.receipt,
      lines: order.lines.map((l) => {
        const d = byLine.get(l.id)
        // No signed proof for this line (older data): assume the driver delivered what was ordered.
        return {
          orderLineId: l.id,
          description: l.description,
          category: l.category,
          orderedQty: l.quantity,
          expectedQty: d ? d.deliveredQty : pod ? 0 : l.quantity,
          refusedQty: d?.refusedQty ?? 0,
          reason: d?.reason ?? null,
        }
      }),
    }
  }

  async receive(user: SessionUser, orderId: string, input: ReceiveDeliveryInput): Promise<StoreReceiptResult> {
    const detail = await this.receiving(user, orderId)
    if (detail.received) throw new ConflictException("This delivery has already been counted in.")
    if (!detail.canReceive)
      throw new ConflictException(
        detail.status === "REFUSED" ? "This delivery was refused, so there is nothing to receive." : "The driver has not delivered this order yet, so it cannot be received.",
      )

    const expected = new Map(detail.lines.map((l) => [l.orderLineId, l]))
    const violations: { rule: string; message: string }[] = []
    const counted = new Map(input.lines.map((l) => [l.orderLineId, l]))
    for (const l of input.lines) {
      const e = expected.get(l.orderLineId)
      if (!e) violations.push({ rule: "LINE", message: "A line does not belong to this order." })
      else if (l.receivedQty > e.expectedQty) violations.push({ rule: "OVER", message: `${e.description}: you cannot receive more than the ${e.expectedQty} the driver delivered.` })
    }
    for (const e of detail.lines)
      if (e.expectedQty > 0 && !counted.has(e.orderLineId)) violations.push({ rule: "MISSING_LINE", message: `Count ${e.description} before confirming.` })
    if (violations.length) throw new UnprocessableEntityException({ message: "Receipt not accepted", violations })

    // One problem per kind per line: a shortage, and separately anything that arrived in bad shape.
    type Problem = { type: IssueType; orderLineId: string; description: string; quantity: number; expected: number }
    const problems: Problem[] = []
    for (const e of detail.lines) {
      const c = counted.get(e.orderLineId)
      if (!c) continue
      if (c.receivedQty < e.expectedQty)
        problems.push({
          type: "RECEIPT_MISSING",
          orderLineId: e.orderLineId,
          quantity: e.expectedQty - c.receivedQty,
          expected: e.expectedQty,
          description: `${e.description}: ${c.receivedQty} of ${e.expectedQty} received (${e.expectedQty - c.receivedQty} short).${c.notes ? ` ${c.notes}` : ""}`,
        })
      if (c.condition !== "GOOD" && c.receivedQty > 0)
        problems.push({
          type: c.condition === "WRONG_ITEM" ? "RECEIPT_WRONG_ITEMS" : "RECEIPT_DAMAGED",
          orderLineId: e.orderLineId,
          quantity: c.receivedQty,
          expected: e.expectedQty,
          description: `${e.description}: ${c.receivedQty} received as ${LINE_CONDITION_LABEL[c.condition as LineCondition].toLowerCase()}.${c.notes ? ` ${c.notes}` : ""}`,
        })
    }

    const receiptStatus = problems.length ? "CONFIRMED_WITH_ISSUES" : "CONFIRMED"
    await this.db.$transaction(async (tx) => {
      // Guard inside the write: a double click or second device cannot count the same delivery twice.
      const { count } = await tx.order.updateMany({ where: { id: orderId, status: { in: ["DELIVERED", "PARTIAL"] } }, data: { status: "RECEIVED" } })
      if (!count) throw new ConflictException("This delivery has already been counted in.")
      await tx.receipt.create({
        data: {
          orderId,
          status: receiptStatus,
          notes: input.notes || null,
          confirmedById: user.sub,
          lines: {
            create: input.lines.map((l) => ({
              orderLineId: l.orderLineId,
              expectedQty: expected.get(l.orderLineId)!.expectedQty,
              receivedQty: l.receivedQty,
              condition: l.condition,
              notes: l.notes || null,
            })),
          },
        },
      })
      await tx.auditLog.create({ data: { actorId: user.sub, action: "ORDER_RECEIVED", entityType: "Order", entityId: orderId, after: { receiptStatus, problems: problems.length } } })
    })

    const raised = await this.raiseIssues(user, orderId, detail.temp === "CHILLED", problems)
    return { orderId, orderRef: detail.orderRef, receiptStatus, issues: raised }
  }

  /** Stage RECEIPT issues for the order, linked to the trip and stop that carried it. Idempotent per line and kind. */
  private async raiseIssues(
    user: SessionUser,
    orderId: string,
    chilled: boolean,
    problems: { type: IssueType; orderLineId: string; description: string; quantity: number; expected: number }[],
  ) {
    const stop = await this.db.stop.findFirst({ where: { orderId, trip: { plan: { status: "PUBLISHED" } } }, select: { id: true, tripId: true } })
    const out: { id: string; ref: string; type: string }[] = []
    for (const p of problems) {
      try {
        const issue = await this.issues.create(user, {
          clientId: `rcpt-${orderId}-${p.orderLineId}-${p.type}`,
          stage: "RECEIPT",
          type: p.type,
          severity: severityOf(p.type, p.quantity, p.expected, chilled),
          description: p.description,
          quantity: p.quantity,
          orderId,
          orderLineId: p.orderLineId,
          outletId: user.outletId ?? undefined,
          tripId: stop?.tripId,
          stopId: stop?.id,
        })
        out.push({ id: issue.id, ref: issue.ref, type: issue.type })
      } catch {
        // The receipt is already saved; a failed issue must not undo it. The store can report it by hand.
      }
    }
    return out
  }

  // ───────────────────────────── Issues ─────────────────────────────

  async reportIssue(user: SessionUser, orderId: string, input: ReportStoreIssueInput) {
    const outletId = this.outletOf(user)
    const order = await this.db.order.findFirst({
      where: { id: orderId, outletId },
      select: { id: true, status: true, temp: true, lines: { select: { id: true, description: true, quantity: true } } },
    })
    if (!order) throw new NotFoundException("Order not found")
    if (!["DELIVERED", "PARTIAL", "RECEIVED", "REFUSED"].includes(order.status))
      throw new ConflictException("You can report a problem once the delivery has arrived.")
    const line = input.orderLineId ? order.lines.find((l) => l.id === input.orderLineId) : undefined
    if (input.orderLineId && !line) throw new UnprocessableEntityException({ message: "Issue not accepted", violations: [{ rule: "LINE", message: "That line is not part of this order." }] })
    if (input.photoId && !(await this.db.mediaAsset.findUnique({ where: { id: input.photoId }, select: { id: true } })))
      throw new UnprocessableEntityException({ message: "Issue not accepted", violations: [{ rule: "PHOTO", message: "The photo did not upload. Try attaching it again." }] })

    const stop = await this.db.stop.findFirst({ where: { orderId, trip: { plan: { status: "PUBLISHED" } } }, select: { id: true, tripId: true } })
    const issue = await this.issues.create(user, {
      clientId: input.clientId,
      stage: "RECEIPT",
      type: input.type,
      severity: severityOf(input.type, input.quantity ?? null, line?.quantity ?? null, order.temp === "CHILLED"),
      description: input.description,
      quantity: input.quantity,
      orderId,
      orderLineId: input.orderLineId,
      outletId,
      tripId: stop?.tripId,
      stopId: stop?.id,
      ...(input.photoId ? { photoId: input.photoId } : {}),
    } as Parameters<IssuesService["create"]>[1])
    return { id: issue.id, ref: issue.ref, type: issue.type }
  }

  private issueScope(outletId: string): Prisma.IssueWhereInput {
    return { OR: [{ outletId }, { order: { outletId } }] }
  }

  private toIssueRow(i: {
    id: string
    ref: string
    type: string
    severity: string
    status: string
    description: string
    quantity: number | null
    createdAt: Date
    resolution: string | null
    order: { id: string; ref: string } | null
  }): StoreIssueRow {
    return {
      id: i.id,
      ref: i.ref,
      type: i.type,
      severity: i.severity,
      status: i.status,
      description: i.description,
      quantity: i.quantity,
      createdAt: i.createdAt.toISOString(),
      orderId: i.order?.id ?? null,
      orderRef: i.order?.ref ?? null,
      resolution: i.resolution,
    }
  }

  async issueList(user: SessionUser, status?: string): Promise<StoreIssueRow[]> {
    const outletId = this.outletOf(user)
    const rows = await this.db.issue.findMany({
      where: { AND: [this.issueScope(outletId), status === "open" ? { status: { not: "RESOLVED" } } : status === "resolved" ? { status: "RESOLVED" } : {}] },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: { id: true, ref: true, type: true, severity: true, status: true, description: true, quantity: true, createdAt: true, resolution: true, order: { select: { id: true, ref: true } } },
    })
    return rows.map((r) => this.toIssueRow(r))
  }

  async issue(user: SessionUser, id: string): Promise<StoreIssueDetail> {
    const outletId = this.outletOf(user)
    const i = await this.db.issue.findFirst({
      where: { id, ...this.issueScope(outletId) },
      select: {
        id: true,
        ref: true,
        type: true,
        severity: true,
        status: true,
        stage: true,
        description: true,
        quantity: true,
        createdAt: true,
        resolution: true,
        resolvedAt: true,
        photoId: true,
        order: { select: { id: true, ref: true } },
        orderLine: { select: { description: true } },
        reportedBy: { select: { name: true } },
        resolvedBy: { select: { name: true } },
      },
    })
    if (!i) throw new NotFoundException("Issue not found")
    const audit = await this.db.auditLog.findMany({
      where: { entityType: "Issue", entityId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    })
    return {
      ...this.toIssueRow(i),
      stage: i.stage,
      line: i.orderLine?.description ?? null,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      resolvedBy: i.resolvedBy?.name ?? null,
      reportedBy: i.reportedBy.name,
      photoId: i.photoId,
      timeline: audit.map((a) => ({ id: a.id, action: a.action, at: a.createdAt.toISOString(), actor: a.actor?.name ?? "System" })),
    }
  }

  // ───────────────────────────── Media ─────────────────────────────

  /**
   * Issue photo evidence. The image goes to the uploads folder (`store/<outlet>/<date>/<id>.jpg`, see MediaStorage);
   * the database keeps only the record that points at it.
   */
  async saveMedia(user: SessionUser, input: DriverMediaInput): Promise<StoreMediaSaved> {
    const outletId = this.outletOf(user)
    const bytes = Buffer.from(input.data, "base64")
    if (!bytes.length) throw new UnprocessableEntityException({ message: "Photo not accepted", violations: [{ rule: "EMPTY", message: "The photo is empty." }] })
    const existing = await this.db.mediaAsset.findUnique({ where: { id: input.id }, select: { id: true } })
    if (!existing) {
      const filePath = await this.storage.save({ id: input.id, mimeType: input.mimeType, bytes, folder: `store/${outletId}/${toDateOnly(new Date())}` })
      await this.db.mediaAsset.create({ data: { id: input.id, kind: "PHOTO", mimeType: input.mimeType, sizeBytes: bytes.length, data: Buffer.alloc(0), filePath } })
    }
    return { id: input.id, sizeBytes: bytes.length }
  }
}
