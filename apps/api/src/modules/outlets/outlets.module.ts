import { Controller, Get, Injectable, Module, NotFoundException, Param, Query } from "@nestjs/common"
import { dateOnly, toDateOnly } from "@waypoint/shared"
import { Roles } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"

const HISTORY_LIMIT = 60

@Injectable()
export class OutletsService {
  constructor(private readonly db: PrismaService) {}

  /** Lean list for the Outlets table: who they are, what is coming to them today, and whether anything is wrong. */
  async overview(depotId: string, date: string, q?: string) {
    const day = dateOnly(date)
    const outlets = await this.db.outlet.findMany({
      where: {
        depotId,
        ...(q ? { OR: [{ id: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { districtId: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        brand: true,
        districtId: true,
        windowOpenMin: true,
        windowCloseMin: true,
        parkingConstraint: true,
        lastDeliveredOn: true,
        orders: {
          where: { deliveryDate: day, status: { not: "CANCELLED" } },
          orderBy: { ref: "asc" },
          take: 1,
          select: {
            id: true,
            ref: true,
            status: true,
            units: true,
            deferCount: true,
            stops: {
              where: { trip: { plan: { status: "PUBLISHED" } } },
              take: 1,
              select: { seq: true, plannedArrivalMin: true, trip: { select: { id: true, ref: true, vehicleId: true } } },
            },
          },
        },
        _count: { select: { issues: { where: { status: { not: "RESOLVED" } } } } },
      },
    })
    return outlets.map(({ orders, _count, lastDeliveredOn, ...o }) => {
      const order = orders[0] ?? null
      const stop = order?.stops[0] ?? null
      return {
        ...o,
        lastDeliveredOn: lastDeliveredOn ? toDateOnly(lastDeliveredOn) : null,
        openIssues: _count.issues,
        today: order
          ? { orderId: order.id, orderRef: order.ref, status: order.status, units: order.units, deferCount: order.deferCount, trip: stop?.trip ?? null, stopSeq: stop?.seq ?? null, plannedArrivalMin: stop?.plannedArrivalMin ?? null }
          : null,
      }
    })
  }

  /** One outlet in full: profile, managers, order history with the trip that carried each, issues. */
  async detail(id: string) {
    const outlet = await this.db.outlet.findUnique({
      where: { id },
      include: {
        district: { select: { id: true, centroidLat: true, centroidLng: true } },
        depot: { select: { id: true, name: true } },
        managers: { where: { isActive: true }, select: { id: true, name: true, phone: true, email: true } },
      },
    })
    if (!outlet) throw new NotFoundException("Outlet not found")

    const [orders, totals, byStatus, issues, openIssues] = await Promise.all([
      this.db.order.findMany({
        where: { outletId: id },
        orderBy: [{ deliveryDate: "desc" }, { ref: "desc" }],
        take: HISTORY_LIMIT,
        select: {
          id: true,
          ref: true,
          brand: true,
          temp: true,
          status: true,
          units: true,
          weightKg: true,
          volumeM3: true,
          deferCount: true,
          requestedDate: true,
          deliveryDate: true,
          receipt: { select: { status: true } },
          stops: {
            where: { trip: { plan: { status: "PUBLISHED" } } },
            take: 1,
            select: { seq: true, status: true, plannedArrivalMin: true, trip: { select: { id: true, ref: true, vehicleId: true } } },
          },
        },
      }),
      this.db.order.aggregate({ where: { outletId: id, status: { not: "CANCELLED" } }, _count: true, _sum: { units: true, weightKg: true, deferCount: true } }),
      this.db.order.groupBy({ by: ["status"], where: { outletId: id }, _count: true }),
      this.db.issue.findMany({
        where: { OR: [{ outletId: id }, { order: { outletId: id } }] },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, ref: true, type: true, severity: true, status: true, createdAt: true, tripId: true },
      }),
      this.db.issue.count({ where: { OR: [{ outletId: id }, { order: { outletId: id } }], status: { not: "RESOLVED" } } }),
    ])
    const n = (...s: string[]) => byStatus.filter((b) => s.includes(b.status)).reduce((t, b) => t + b._count, 0)

    return {
      outlet: { ...outlet, lastDeliveredOn: outlet.lastDeliveredOn ? toDateOnly(outlet.lastDeliveredOn) : null },
      stats: {
        orders: totals._count,
        units: totals._sum.units ?? 0,
        weightKg: Math.round(totals._sum.weightKg ?? 0),
        delivered: n("DELIVERED", "RECEIVED", "PARTIAL"),
        refused: n("REFUSED"),
        deferrals: totals._sum.deferCount ?? 0,
        openIssues,
      },
      orders: orders.map(({ stops, requestedDate, deliveryDate, ...o }) => ({
        ...o,
        requestedDate: toDateOnly(requestedDate),
        deliveryDate: toDateOnly(deliveryDate),
        stop: stops[0] ?? null,
      })),
      issues,
    }
  }
}

@Roles("DISPATCHER")
@Controller("outlets")
export class OutletsController {
  constructor(private readonly outlets: OutletsService) {}

  // Declared before ":id" so "overview" is not read as an outlet id.
  @Get("overview")
  overview(@Query("depotId") depotId: string, @Query("date") date: string, @Query("q") q?: string) {
    return this.outlets.overview(depotId, date, q)
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.outlets.detail(id)
  }
}

@Module({ controllers: [OutletsController], providers: [OutletsService] })
export class OutletsModule {}
