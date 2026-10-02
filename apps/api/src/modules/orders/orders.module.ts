import { Controller, Get, Injectable, Module, NotFoundException, Param, Query } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import { dateOnly } from "@waypoint/shared"
import { Roles } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"

export type OrderView = "all" | "unassigned" | "assigned" | "deferred"

@Injectable()
export class OrdersService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Dispatcher order queue for a depot/day, joined with the decision from the latest plan
   * (draft or published), so the list shows Unassigned / Assigned / Deferred in one place.
   */
  async list(q: { depotId: string; date: string; view?: OrderView; brand?: string; district?: string; search?: string }) {
    const date = dateOnly(q.date)
    const plan = await this.db.plan.findFirst({
      where: { depotId: q.depotId, date, status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: [{ status: "asc" }, { version: "desc" }], // DRAFT sorts before PUBLISHED
      select: { id: true, status: true, version: true },
    })

    const where: Prisma.OrderWhereInput = {
      depotId: q.depotId,
      OR: [{ deliveryDate: date }, ...(plan ? [{ decisions: { some: { planId: plan.id } } }] : [])],
      ...(q.brand ? { brand: q.brand as Prisma.EnumBrandFilter["equals"] } : {}),
      ...(q.district ? { outlet: { districtId: q.district } } : {}),
      ...(q.search
        ? { OR: [{ ref: { contains: q.search, mode: "insensitive" } }, { outletId: { contains: q.search, mode: "insensitive" } }] }
        : {}),
    }
    const orders = await this.db.order.findMany({
      where,
      orderBy: [{ brand: "asc" }, { ref: "asc" }],
      include: {
        outlet: { select: { id: true, name: true, districtId: true, dockType: true, parkingConstraint: true, windowOpenMin: true, windowCloseMin: true, mallWindowOpenMin: true, mallWindowCloseMin: true } },
        decisions: plan ? { where: { planId: plan.id }, select: { decision: true, reason: true, explanation: true, priorityScore: true, source: true } } : false,
        stops: plan ? { where: { trip: { planId: plan.id } }, select: { seq: true, plannedArrivalMin: true, atRisk: true, trip: { select: { id: true, ref: true, vehicleId: true } } } } : false,
      },
    })

    const rows = orders.map(({ decisions, stops, ...o }) => {
      const decision = decisions?.[0] ?? null
      const stop = stops?.[0] ?? null
      const state: Exclude<OrderView, "all"> =
        decision?.decision === "DEFERRED" ? "deferred" : stop ? "assigned" : "unassigned"
      return { ...o, decision, stop, state }
    })
    const counts = {
      all: rows.length,
      unassigned: rows.filter((r) => r.state === "unassigned").length,
      assigned: rows.filter((r) => r.state === "assigned").length,
      deferred: rows.filter((r) => r.state === "deferred").length,
    }
    const brandTotals = (["FRESH", "STYLE", "TECH"] as const).map((b) => {
      const xs = rows.filter((r) => r.brand === b)
      return { brand: b, orders: xs.length, chilled: xs.filter((r) => r.temp === "CHILLED").length, assigned: xs.filter((r) => r.state === "assigned").length }
    })
    const view = q.view ?? "all"
    return {
      plan,
      counts,
      brandTotals,
      orders: view === "all" ? rows : rows.filter((r) => r.state === view),
    }
  }

  /** One order in full: items, every planning decision, the trip carrying it, receipt, issues and audit trail. */
  async get(id: string) {
    const order = await this.db.order.findUnique({
      where: { id },
      include: {
        outlet: { include: { district: true, managers: { where: { isActive: true }, select: { id: true, name: true, phone: true } } } },
        depot: { select: { id: true, name: true } },
        lines: true,
        createdBy: { select: { name: true } },
        decisions: { orderBy: { createdAt: "desc" }, include: { plan: { select: { version: true, status: true, date: true } }, overriddenBy: { select: { name: true } } } },
        stops: {
          orderBy: { trip: { plan: { version: "desc" } } },
          include: {
            trip: { select: { id: true, ref: true, vehicleId: true, status: true, plannedDepartMin: true, driver: { select: { name: true, phone: true } }, plan: { select: { status: true, version: true, date: true, depotId: true } } } },
            proof: { select: { recipientName: true, capturedAt: true } },
          },
        },
        receipt: { include: { confirmedBy: { select: { name: true } } } },
        issues: { orderBy: { createdAt: "desc" }, select: { id: true, ref: true, type: true, severity: true, status: true, createdAt: true } },
      },
    })
    if (!order) throw new NotFoundException("Order not found")
    const audit = await this.db.auditLog.findMany({
      where: { OR: [{ entityType: "Order", entityId: id }, { entityType: "Issue", entityId: { in: order.issues.map((i) => i.id) } }] },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: { name: true } } },
    })
    return { ...order, audit: audit.map((a) => ({ id: a.id, action: a.action, at: a.createdAt, actor: a.actor?.name ?? "System", entityType: a.entityType, after: a.after })) }
  }
}

@Roles("DISPATCHER")
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Query("depotId") depotId: string,
    @Query("date") date: string,
    @Query("view") view?: OrderView,
    @Query("brand") brand?: string,
    @Query("district") district?: string,
    @Query("q") search?: string,
  ) {
    return this.orders.list({ depotId, date, view, brand, district, search })
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.orders.get(id)
  }
}

@Module({ controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
