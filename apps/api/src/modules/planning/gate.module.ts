import { BadRequestException, ConflictException, Controller, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException, Param, Post, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { GATE_AUTO_START_MS } from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"
import { LiveModule } from "../live/live.module"
import { DemoService } from "../live/demo-state.service"
import { LiveClockService } from "../live/live-clock.service"
import { LiveService } from "../live/live.service"

/**
 * Depot gate. A published trip only goes live once its driver and its loader have both claimed it
 * and the dispatcher lets it out: Start now, or nothing within a minute of the second claim
 * (the gate opens by itself). Hold keeps a trip at the depot until the dispatcher releases it.
 */
@Injectable()
export class GateService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(GateService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: PrismaService,
    private readonly live: LiveService,
    private readonly demo: DemoService,
    private readonly clock: LiveClockService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.autoStart().catch((e) => this.log.warn(`auto-start failed: ${e}`)), 5_000)
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /** Trips whose crew is complete, not held, and past the grace period go live on their own. */
  async autoStart() {
    // Demo: the gate opens a simulated minute after the second claim, and only while the day is running.
    if (this.demo.isOn()) {
      const clock = this.clock.now()
      if (!clock.running) return
      const claimed = await this.db.trip.findMany({
        where: { liveAt: null, heldAt: null, driverClaimedAt: { not: null }, loaderClaimedAt: { not: null }, plan: { status: "PUBLISHED" } },
        select: { id: true, driverClaimedAt: true, loaderClaimedAt: true },
      })
      for (const t of claimed) {
        const since = Date.now() - Math.max(t.driverClaimedAt!.getTime(), t.loaderClaimedAt!.getTime())
        if ((since / 60_000) * clock.speed >= 1) await this.goLive(t.id, null)
      }
      return
    }
    const due = await this.db.trip.findMany({
      where: {
        liveAt: null,
        heldAt: null,
        driverClaimedAt: { not: null, lte: new Date(Date.now() - GATE_AUTO_START_MS) },
        loaderClaimedAt: { not: null, lte: new Date(Date.now() - GATE_AUTO_START_MS) },
        plan: { status: "PUBLISHED" },
      },
      select: { id: true },
    })
    for (const t of due) await this.goLive(t.id, null)
  }

  private async goLive(tripId: string, actorId: string | null) {
    const res = await this.db.trip.updateMany({ where: { id: tripId, liveAt: null }, data: { liveAt: new Date(), heldAt: null } })
    if (!res.count) return
    if (this.demo.isOn()) {
      this.demo.recordLaunch(tripId, this.clock.now().minute)
      this.demo.touch(tripId)
      await this.demo.save()
    }
    await this.db.auditLog.create({ data: { actorId, action: actorId ? "TRIP_STARTED" : "TRIP_STARTED_AUTO", entityType: "Trip", entityId: tripId } })
    this.live.invalidate()
  }

  private async openTrip(tripId: string) {
    const trip = await this.db.trip.findFirst({ where: { id: tripId, plan: { status: "PUBLISHED" } }, include: { plan: { select: { depotId: true } } } })
    if (!trip) throw new NotFoundException("Trip is not part of a published plan")
    return trip
  }

  /** A driver or loader tells dispatch they are at the depot with this trip. */
  async claim(user: SessionUser, tripId: string, on: boolean) {
    const trip = await this.openTrip(tripId)
    if (trip.liveAt) throw new ConflictException("This trip is already live")
    // Once loading has started the claim belongs to the load list: give the trip back there, not at the gate.
    if (user.role === "LOADER" && !on && trip.status !== "PLANNED") throw new ConflictException("Loading has started: hand the trip back from the vehicle's load list")
    const data =
      user.role === "DRIVER"
        ? trip.driverId === user.sub || (user.vehicleId && trip.vehicleId === user.vehicleId)
          ? on
            ? { driverClaimedAt: trip.driverClaimedAt ?? new Date(), driverId: trip.driverId ?? user.sub }
            : { driverClaimedAt: null }
          : null
        : user.role === "LOADER"
          ? user.depotId === trip.plan.depotId
            ? on
              ? { loaderClaimedAt: trip.loaderClaimedAt ?? new Date(), loaderId: trip.loaderId ?? user.sub }
              : trip.loaderId === user.sub || !trip.loaderId
                ? { loaderClaimedAt: null, loaderId: null }
                : null
            : null
          : null
    if (!data) throw new ForbiddenException("This trip is not yours to claim")
    if (user.role === "LOADER" && on && trip.loaderId && trip.loaderId !== user.sub) throw new ConflictException("Another loader already claimed this trip")
    await this.db.trip.update({ where: { id: tripId }, data })
    await this.db.auditLog.create({ data: { actorId: user.sub, action: on ? "TRIP_CLAIMED" : "TRIP_UNCLAIMED", entityType: "Trip", entityId: tripId, after: { role: user.role } } })
    return { ok: true }
  }

  /** The loader's board: today's published trips at their depot and who has claimed what. */
  async board(user: SessionUser) {
    if (!user.depotId) return []
    const trips = await this.db.trip.findMany({
      where: { plan: { depotId: user.depotId, status: "PUBLISHED" }, stops: { some: {} }, status: { not: "CANCELLED" } },
      orderBy: [{ plannedDepartMin: "asc" }, { ref: "asc" }],
      select: {
        id: true, ref: true, brand: true, districtId: true, vehicleId: true, plannedDepartMin: true, loadWeightKg: true, loadVolumeM3: true,
        driverClaimedAt: true, loaderClaimedAt: true, loaderId: true, heldAt: true, liveAt: true, departedAt: true,
        driver: { select: { name: true } }, loader: { select: { name: true } }, _count: { select: { stops: true } },
      },
    })
    return trips.map(({ _count, departedAt, ...t }) => ({ ...t, stops: _count.stops, live: !!t.liveAt || !!departedAt, mine: t.loaderId === user.sub }))
  }

  async start(user: SessionUser, tripId: string) {
    const trip = await this.openTrip(tripId)
    if (trip.liveAt) return { ok: true }
    if (!trip.driverClaimedAt || !trip.loaderClaimedAt) throw new BadRequestException("Both the driver and the loader must claim the trip first")
    await this.goLive(tripId, user.sub)
    return { ok: true }
  }

  async hold(user: SessionUser, tripId: string, on: boolean) {
    const trip = await this.openTrip(tripId)
    if (trip.liveAt) throw new ConflictException("This trip is already live")
    await this.db.trip.update({ where: { id: tripId }, data: { heldAt: on ? new Date() : null } })
    await this.db.auditLog.create({ data: { actorId: user.sub, action: on ? "TRIP_HELD" : "TRIP_HOLD_CLEARED", entityType: "Trip", entityId: tripId } })
    return { ok: true }
  }
}

@Controller("gate")
export class GateController {
  constructor(private readonly gate: GateService) {}

  @Roles("LOADER")
  @Get("trips")
  board(@CurrentUser() user: SessionUser) {
    return this.gate.board(user)
  }

  @Roles("DRIVER", "LOADER")
  @Post("trips/:id/claim")
  claim(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.gate.claim(user, id, true)
  }

  @Roles("DRIVER", "LOADER")
  @Post("trips/:id/unclaim")
  unclaim(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.gate.claim(user, id, false)
  }

  @Roles("DISPATCHER")
  @Post("trips/:id/start")
  start(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.gate.start(user, id)
  }

  @Roles("DISPATCHER")
  @Post("trips/:id/hold")
  hold(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.gate.hold(user, id, true)
  }

  /** Lifting a hold sends the trip out straight away if the crew is complete. */
  @Roles("DISPATCHER")
  @Post("trips/:id/release")
  async release(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    await this.gate.hold(user, id, false)
    return this.gate.start(user, id)
  }
}

@Module({ imports: [LiveModule], controllers: [GateController], providers: [GateService] })
export class GateModule {}
