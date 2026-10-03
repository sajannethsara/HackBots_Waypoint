import { Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Query } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  dateOnly,
  storeOrdersQuerySchema,
  toDateOnly,
  type StoreDashboard,
  type StoreOrderDetail,
  type StoreOrderRow,
  type StoreOrdersQuery,
  type StoreOrdersResponse,
  type StoreOrderTab,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"

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

  async order(user: SessionUser, id: string): Promise<StoreOrderDetail> {
    const outletId = this.outletOf(user)
    const o = await this.db.order.findFirst({
      where: { id, outletId },
      select: {
        ...rowSelect,
        volumeM3: true,
        notes: true,
        outlet: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        lines: { orderBy: { description: "asc" }, select: { id: true, description: true, category: true, quantity: true, weightKg: true, volumeM3: true } },
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
    const { stops, receipt, createdBy, volumeM3, notes, outlet, lines, issues, ...row } = o
    const stop = stops[0]
    const audit = await this.db.auditLog.findMany({
      where: { entityType: "Order", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    })
    return {
      ...toRow(row),
      volumeM3,
      notes,
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
      timeline: audit.map((a) => ({ id: a.id, action: a.action, at: a.createdAt.toISOString(), actor: a.actor?.name ?? "System" })),
    }
  }
}

@Roles("STORE_MANAGER")
@Controller("store")
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: SessionUser) {
    return this.store.dashboard(user)
  }

  @Get("orders")
  orders(@CurrentUser() user: SessionUser, @Query(new ZodPipe(storeOrdersQuerySchema)) q: StoreOrdersQuery) {
    return this.store.orders(user, q)
  }

  @Get("orders/:id")
  order(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.store.order(user, id)
  }
}

@Module({ controllers: [StoreController], providers: [StoreService] })
export class StoreModule {}
