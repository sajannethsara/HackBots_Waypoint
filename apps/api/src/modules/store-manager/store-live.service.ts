import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import type { LiveRoute, StoreLiveView } from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { LiveService } from "../live/live.service"
import { roadAheadTo } from "./route-cut"
import { stageOf } from "./store-receiving.service"

const ROUTE_TTL_MS = 5 * 60_000

/**
 * Live tracking for one order, for the store that placed it. It reads the same live engine the dispatcher's map
 * uses (plan + clock + driver GPS), then keeps only what this outlet is allowed to see.
 */
@Injectable()
export class StoreLiveService {
  private routes = new Map<string, { at: number; route: LiveRoute | null }>()

  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
    private readonly live: LiveService,
  ) {}

  async view(user: SessionUser, orderId: string): Promise<StoreLiveView> {
    if (!user.outletId) throw new ForbiddenException("This account is not linked to an outlet")
    const order = await this.db.order.findFirst({
      where: { id: orderId, outletId: user.outletId },
      select: { id: true, ref: true, status: true, outlet: { select: { depotId: true } } },
    })
    if (!order) throw new NotFoundException("Order not found")

    const today = await this.clock.operatingDate()
    const snap = await this.live.snapshot(order.outlet.depotId, today)
    const trip = snap.trips.find((t) => t.stops.some((s) => s.orderId === orderId))
    const stopIndex = trip ? trip.stops.findIndex((s) => s.orderId === orderId) : -1
    if (!trip || stopIndex < 0) throw new NotFoundException("This order is not on a delivery trip today")
    const stop = trip.stops[stopIndex]

    const stage = stageOf(order.status, stop.status === "IN_PROGRESS" ? "ARRIVED" : undefined)
    const departed = trip.actualDepartMin != null || ["ON_ROUTE", "AT_OUTLET", "DELAYED", "RETURNING", "COMPLETED"].includes(trip.status)
    const route = await this.routeFor(trip.id)
    const ahead = departed && stop.status === "PENDING" ? roadAheadTo(trip, stopIndex, route) : []

    return {
      orderId: order.id,
      orderRef: order.ref,
      stage: stage ?? "PLANNED",
      generatedAt: snap.generatedAt,
      live: !!trip.reported || snap.clock.running,
      depot: snap.depot,
      destination: { name: stop.outletName, position: stop.position, windowOpenMin: stop.windowOpenMin, windowCloseMin: stop.windowCloseMin },
      vehicle: {
        id: trip.vehicleId,
        label: trip.vehicleLabel,
        position: trip.position,
        heading: trip.heading,
        departed,
        status: trip.status,
        lastSeenMin: trip.reported?.fixAgeMin ?? null,
        fromDriver: !!trip.reported,
        simulatedGps: !!trip.reported?.simulated,
      },
      etaMin: Math.round(stop.etaMin),
      delayMin: Math.round(stop.delayMin),
      // A count only: the store learns how many stops come first, never which outlets they are.
      stopsBefore: trip.stops.filter((s, i) => i < stopIndex && s.status !== "COMPLETED").length,
      totalStops: trip.stops.length,
      route: ahead,
      // Mapbox geometry only counts when it covers every leg; otherwise the line is stop-to-stop straight segments.
      routeSource: ahead.length ? (route && route.legs.length === trip.stops.length + 1 ? route.source : "straight") : null,
    }
  }

  /** Road geometry is cached on the trip; read it from the database and compute it in the background if it is missing. */
  private async routeFor(tripId: string): Promise<LiveRoute | null> {
    const hit = this.routes.get(tripId)
    if (hit && Date.now() - hit.at < ROUTE_TTL_MS) return hit.route
    const trip = await this.db.trip.findUnique({ where: { id: tripId }, select: { route: true } })
    const route = (trip?.route as unknown as LiveRoute | null) ?? null
    if (route) this.routes.set(tripId, { at: Date.now(), route })
    else void this.live.routesFor([tripId]).catch(() => undefined)
    return route
  }
}
