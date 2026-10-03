import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  cancelStoreOrderSchema,
  createStoreOrderSchema,
  driverMediaSchema,
  receiveDeliverySchema,
  reportStoreIssueSchema,
  storeDeliveriesQuerySchema,
  dateOnly,
  storeOrdersQuerySchema,
  updateStoreOrderSchema,
  toDateOnly,
  type CancelStoreOrderInput,
  type CreateStoreOrderInput,
  type DriverMediaInput,
  type ReceiveDeliveryInput,
  type ReportStoreIssueInput,
  type StoreDeliveriesQuery,
  type StoreCancelReason,
  type StoreDashboard,
  type StoreOrderDetail,
  type StoreOrderRow,
  type StoreOrdersQuery,
  type StoreOrdersResponse,
  type StoreOrderTab,
  type StoreTemp,
  type UpdateStoreOrderInput,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"
import { IssuesModule } from "../issues/issues.module"
import { LiveModule } from "../live/live.module"
import { MediaModule } from "../media/media.module"
import { PlanningModule } from "../planning/planning.module"
import { StoreLiveService } from "./store-live.service"
import { StoreOrderingService } from "./store-ordering.service"
import { StoreReceivingService } from "./store-receiving.service"

const TAB_WHERE: Record<StoreOrderTab, Prisma.OrderWhereInput> = {
  orders: { status: { notIn: ["DRAFT", "CANCELLED"] } },
  drafts: { status: "DRAFT" },
  cancelled: { status: "CANCELLED" },
}
const INCOMING = ["PLANNED", "LOADED", "IN_TRANSIT"] as const

const rowSelect = {
  id: true,
  ref: true,
  brand: true,
  temp: true,
  status: true,
  units: true,
  weightKg: true,
  deliveryDate: true,
  requestedDate: true,
  submittedAt: true,
  deferCount: true,
  _count: { select: { lines: true } },
} satisfies Prisma.OrderSelect

type RowSource = Prisma.OrderGetPayload<{ select: typeof rowSelect }>

const toRow = ({ _count, deliveryDate, requestedDate, submittedAt, ...o }: RowSource): StoreOrderRow => ({
  ...o,
  editable: o.status === "DRAFT" || o.status === "SUBMITTED",
  items: _count.lines,
  deliveryDate: toDateOnly(deliveryDate),
  requestedDate: toDateOnly(requestedDate),
  submittedAt: submittedAt.toISOString(),
})

/** Everything a store manager sees is scoped to their own outlet; nothing here reads another outlet's orders. */
@Injectable()
export class StoreService {
  constructor(private readonly db: PrismaService) {}

  private outletOf(user: SessionUser) {
    if (!user.outletId) throw new ForbiddenException("This account is not linked to an outlet")
    return user.outletId
  }

  async dashboard(user: SessionUser): Promise<StoreDashboard> {
    const outletId = this.outletOf(user)
    const [total, incoming, received, awaiting, openIssues, recent, stops] = await Promise.all([
      this.db.order.count({ where: { outletId, ...TAB_WHERE.orders } }),
      this.db.order.count({ where: { outletId, status: { in: [...INCOMING] } } }),
      this.db.order.count({ where: { outletId, status: "RECEIVED" } }),
      this.db.order.count({ where: { outletId, status: { in: ["DELIVERED", "PARTIAL"] } } }),
      this.db.issue.count({ where: { status: { not: "RESOLVED" }, OR: [{ outletId }, { order: { outletId } }] } }),
      this.db.order.findMany({
        where: { outletId, status: { not: "DRAFT" } },
        orderBy: [{ submittedAt: "desc" }, { ref: "desc" }],
        take: 5,
        select: rowSelect,
      }),
      this.db.stop.findMany({
        where: { order: { outletId }, trip: { plan: { status: "PUBLISHED" } } },
        orderBy: { trip: { plan: { date: "desc" } } },
        take: 5,
        select: {
          plannedArrivalMin: true,
          etaMin: true,
          trip: { select: { vehicleId: true } },
          order: { select: { id: true, ref: true, status: true, deliveryDate: true } },
        },
      }),
    ])
    return {
      kpis: { totalOrders: total, incoming, received, awaitingReceipt: awaiting, openIssues },
      recentOrders: recent.map(toRow),
      recentDeliveries: stops.map((s) => ({
        orderId: s.order.id,
        orderRef: s.order.ref,
        status: s.order.status,
        deliveryDate: toDateOnly(s.order.deliveryDate),
        vehicleId: s.trip.vehicleId,
        etaMin: s.etaMin,
        plannedArrivalMin: s.plannedArrivalMin,
      })),
    }
  }

  async orders(user: SessionUser, q: StoreOrdersQuery): Promise<StoreOrdersResponse> {
    const outletId = this.outletOf(user)
    const where: Prisma.OrderWhereInput = {
      outletId,
      ...TAB_WHERE[q.tab],
      ...(q.status && q.tab === "orders" ? { status: q.status as Prisma.EnumOrderStatusFilter["equals"] } : {}),
      ...(q.q ? { ref: { contains: q.q, mode: "insensitive" } } : {}),
      ...(q.from || q.to ? { deliveryDate: { ...(q.from ? { gte: dateOnly(q.from) } : {}), ...(q.to ? { lte: dateOnly(q.to) } : {}) } } : {}),
    }
    const [total, rows, orders, drafts, cancelled] = await Promise.all([
      this.db.order.count({ where }),
      this.db.order.findMany({
        where,
        orderBy: [{ deliveryDate: "desc" }, { ref: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: rowSelect,
      }),
      this.db.order.count({ where: { outletId, ...TAB_WHERE.orders } }),
      this.db.order.count({ where: { outletId, ...TAB_WHERE.drafts } }),
      this.db.order.count({ where: { outletId, ...TAB_WHERE.cancelled } }),
    ])
    return { items: rows.map(toRow), total, page: q.page, pageSize: q.pageSize, counts: { orders, drafts, cancelled } }
  }

  private cancellation(audit: { action: string; after: Prisma.JsonValue; createdAt: Date; actor: { name: string } | null }[]): StoreOrderDetail["cancellation"] {
    const c = audit.find((a) => a.action === "ORDER_CANCELLED")
    const after = (c?.after ?? {}) as { reason?: StoreCancelReason; note?: string | null }
    return c && after.reason ? { reason: after.reason, note: after.note ?? null, at: c.createdAt.toISOString(), by: c.actor?.name ?? "System" } : null
  }

  async order(user: SessionUser, id: string): Promise<StoreOrderDetail> {
    const outletId = this.outletOf(user)
    const o = await this.db.order.findFirst({
      where: { id, outletId },
      select: {
        ...rowSelect,
        volumeM3: true,
        notes: true,
        windowPref: true,
        outlet: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        lines: { orderBy: { description: "asc" }, select: { id: true, productId: true, description: true, category: true, quantity: true, weightKg: true, volumeM3: true } },
        receipt: { select: { status: true, notes: true, confirmedAt: true, confirmedBy: { select: { name: true } } } },
        issues: { orderBy: { createdAt: "desc" }, select: { id: true, ref: true, type: true, status: true } },
        // The stop on the published plan is the one that counts; drafts and superseded plans are internal to dispatch.
        stops: {
          where: { trip: { plan: { status: "PUBLISHED" } } },
          take: 1,
          select: {
            status: true,
            plannedArrivalMin: true,
            etaMin: true,
            completedAt: true,
            trip: { select: { id: true, ref: true, status: true, vehicleId: true, driver: { select: { name: true, phone: true } } } },
          },
        },
      },
    })
    // Another outlet's order is "not found" rather than "forbidden": no hint that it exists.
    if (!o) throw new NotFoundException("Order not found")
    const { stops, receipt, createdBy, volumeM3, notes, windowPref, outlet, lines, issues, ...row } = o
    const stop = stops[0]
    const audit = await this.db.auditLog.findMany({
      where: { entityType: "Order", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, after: true, createdAt: true, actor: { select: { name: true } } },
    })
    return {
      ...toRow(row),
      volumeM3,
      notes,
      windowPref,
      outlet,
      createdBy: createdBy.name,
      lines,
      issues,
      delivery: stop
        ? {
            tripId: stop.trip.id,
            tripRef: stop.trip.ref,
            tripStatus: stop.trip.status,
            vehicleId: stop.trip.vehicleId,
            driver: stop.trip.driver,
            stopStatus: stop.status,
            plannedArrivalMin: stop.plannedArrivalMin,
            etaMin: stop.etaMin,
            completedAt: stop.completedAt?.toISOString() ?? null,
          }
        : null,
      receipt: receipt
        ? { status: receipt.status, notes: receipt.notes, confirmedAt: receipt.confirmedAt.toISOString(), confirmedBy: receipt.confirmedBy.name }
        : null,
      cancellation: this.cancellation(audit),
      timeline: audit.map((a) => ({ id: a.id, action: a.action, at: a.createdAt.toISOString(), actor: a.actor?.name ?? "System" })),
    }
  }
}

@Roles("STORE_MANAGER")
@Controller("store")
export class StoreController {
  constructor(
    private readonly store: StoreService,
    private readonly ordering: StoreOrderingService,
    private readonly receiving: StoreReceivingService,
    private readonly liveTracking: StoreLiveService,
  ) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: SessionUser) {
    return this.store.dashboard(user)
  }

  @Get("orders")
  orders(@CurrentUser() user: SessionUser, @Query(new ZodPipe(storeOrdersQuerySchema)) q: StoreOrdersQuery) {
    return this.store.orders(user, q)
  }

  @Get("deliveries")
  deliveries(@CurrentUser() user: SessionUser, @Query(new ZodPipe(storeDeliveriesQuerySchema)) q: StoreDeliveriesQuery) {
    return this.receiving.deliveries(user, q)
  }

  @Get("orders/:id/live")
  live(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.liveTracking.view(user, id)
  }

  @Get("orders/:id/receiving")
  receivingDetail(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.receiving.receiving(user, id)
  }

  @Post("orders/:id/receipt")
  receive(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(receiveDeliverySchema)) body: ReceiveDeliveryInput) {
    return this.receiving.receive(user, id, body)
  }

  @Post("orders/:id/issues")
  reportIssue(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(reportStoreIssueSchema)) body: ReportStoreIssueInput) {
    return this.receiving.reportIssue(user, id, body)
  }

  @Post("media")
  media(@CurrentUser() user: SessionUser, @Body(new ZodPipe(driverMediaSchema)) body: DriverMediaInput) {
    return this.receiving.saveMedia(user, body)
  }

  @Get("issues")
  issues(@CurrentUser() user: SessionUser, @Query("status") status?: string) {
    return this.receiving.issueList(user, status)
  }

  @Get("issues/:id")
  issue(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.receiving.issue(user, id)
  }

  @Get("order-rules")
  rules(@CurrentUser() user: SessionUser) {
    return this.ordering.rules(user)
  }

  @Get("products")
  products(@CurrentUser() user: SessionUser, @Query("temp") temp: string, @Query("q") q?: string) {
    return this.ordering.products(user, (temp === "CHILLED" ? "CHILLED" : "AMBIENT") as StoreTemp, q?.trim().slice(0, 60) || undefined)
  }

  @Post("orders")
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(createStoreOrderSchema)) body: CreateStoreOrderInput) {
    return this.ordering.create(user, body)
  }

  @Patch("orders/:id")
  update(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(updateStoreOrderSchema)) body: UpdateStoreOrderInput) {
    return this.ordering.update(user, id, body)
  }

  @Post("orders/:id/cancel")
  cancel(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(cancelStoreOrderSchema)) body: CancelStoreOrderInput) {
    return this.ordering.cancel(user, id, body)
  }

  @Get("orders/:id")
  order(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.store.order(user, id)
  }
}

@Module({ imports: [PlanningModule, IssuesModule, LiveModule, MediaModule], controllers: [StoreController], providers: [StoreService, StoreOrderingService, StoreReceivingService, StoreLiveService] })
export class StoreModule {}
