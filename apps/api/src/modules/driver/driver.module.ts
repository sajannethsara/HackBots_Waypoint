import { Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Post } from "@nestjs/common"
import { Prisma } from "@waypoint/db"
import {
  bodyPreview,
  DOCK_LABEL,
  PARKING_LABEL,
  dateOnly,
  driverMediaSchema,
  driverSyncSchema,
  type DriverBundle,
  type DriverConfig,
  type DriverChatInput,
  type DriverEventInput,
  type DriverIssue,
  type DriverNavStep,
  type DriverMediaInput,
  type DriverSyncInput,
  type DriverSyncResult,
  type DriverTrip,
  type LiveRoute,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"
import { IssueChatModule, IssueChatService } from "../issue-chat/issue-chat.module"
import { IssuesModule } from "../issues/issues.module"
import { IssuesService } from "../issues/issues.service"
import { LiveModule } from "../live/live.module"
import { LiveClockService } from "../live/live-clock.service"
import { RoutingModule, RoutingService } from "../routing/routing.service"

/** Demo mode is switched on in .env (DEMO_MODE=true): the phone simulates GPS along the route. */
function driverConfig(): DriverConfig {
  const demo = process.env.DEMO_MODE === "true"
  const prod = Number(process.env.GPS_PING_SECONDS) || 240
  const demoSec = Number(process.env.DEMO_PING_SECONDS) || 10
  return { demo, pingSeconds: demo ? demoSec : prod, arriveRadiusM: Number(process.env.ARRIVE_RADIUS_M) || 150 }
}

const COMPLETING = ["DELIVERED", "PARTIAL", "REFUSED"] as const
type Completing = (typeof COMPLETING)[number]
const isCompleting = (t: string): t is Completing => (COMPLETING as readonly string[]).includes(t)

@Injectable()
export class DriverService {
  constructor(
    private readonly db: PrismaService,
    private readonly calendar: ClockService,
    private readonly clock: LiveClockService,
    private readonly routing: RoutingService,
    private readonly issues: IssuesService,
    private readonly issueChat: IssueChatService,
  ) {}

  /** Trips this driver may act on: assigned to them, or on their vehicle. */
  private tripScope(user: SessionUser): Prisma.TripWhereInput {
    return { OR: [{ driverId: user.sub }, ...(user.vehicleId ? [{ vehicleId: user.vehicleId }] : [])] }
  }

  /**
   * Everything the phone needs to work offline for the day, and nothing it does not:
   * no scores, weights, fuel quotas or other drivers' trips.
   */
  async bundle(user: SessionUser): Promise<DriverBundle> {
    const me = await this.db.user.findUniqueOrThrow({ where: { id: user.sub }, select: { id: true, name: true, phone: true, depotId: true } })
    const date = await this.calendar.operatingDate()
    const plan = me.depotId
      ? await this.db.plan.findFirst({ where: { depotId: me.depotId, date: dateOnly(date), status: "PUBLISHED" }, orderBy: { version: "desc" }, select: { id: true } })
      : null

    let trips: DriverTrip[] = []
    if (plan) {
      const where: Prisma.TripWhereInput = { planId: plan.id, status: { not: "CANCELLED" }, stops: { some: {} }, ...this.tripScope(user) }
      const ids = (await this.db.trip.findMany({ where, select: { id: true } })).map((t) => t.id)
      // Road geometry is cached on the trip; compute it once if it is missing (bounded wait).
      await Promise.race([this.routing.ensure(ids), new Promise((r) => setTimeout(r, 8_000))]).catch(() => {})
      const rows = await this.db.trip.findMany({
        where,
        orderBy: { tripNo: "asc" },
        include: {
          vehicle: true,
          plan: { select: { depot: { select: { name: true, lat: true, lng: true } } } },
          stops: {
            orderBy: { seq: "asc" },
            include: { order: { include: { lines: true, outlet: { include: { district: { select: { id: true } } } } } } },
          },
        },
      })
      trips = rows.map((t) => {
        const depot = { lat: t.plan.depot.lat ?? 6.96, lng: t.plan.depot.lng ?? 79.88 }
        return {
          id: t.id,
          ref: t.ref,
          tripNo: t.tripNo,
          brand: t.brand,
          status: t.status,
          plannedDepartMin: t.plannedDepartMin,
          plannedKm: Math.round(t.plannedKm * 10) / 10,
          plannedDurationMin: Math.round(t.plannedDurationMin),
          depot: { name: t.plan.depot.name, position: depot },
          legs: (t.route as unknown as LiveRoute | null)?.legs ?? null,
          steps: ((t.route as unknown as LiveRoute | null)?.steps as DriverNavStep[][] | undefined) ?? null,
          vehicle: {
            id: t.vehicleId,
            label: `${t.vehicle.temp === "REEFER" ? "Reefer" : "Ambient"} ${t.vehicle.type.toLowerCase()}`,
            chilled: t.vehicle.temp === "REEFER",
          },
          departedAt: t.departedAt?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
          stops: t.stops.map((s) => {
            const o = s.order.outlet
            let open = o.windowOpenMin
            let close = o.windowCloseMin
            if (o.mallWindowOpenMin != null && o.mallWindowCloseMin != null) {
              open = Math.max(open, o.mallWindowOpenMin)
              close = Math.min(close, o.mallWindowCloseMin)
            }
            const access = [DOCK_LABEL[o.dockType], o.parkingConstraint === "NORMAL" ? null : PARKING_LABEL[o.parkingConstraint]].filter(Boolean).join(" · ")
            return {
              id: s.id,
              seq: s.seq,
              orderRef: s.order.ref,
              outlet: { id: o.id, name: o.name, district: o.districtId, position: { lat: o.lat ?? depot.lat, lng: o.lng ?? depot.lng }, access: access || null },
              windowOpenMin: open,
              windowCloseMin: close,
              plannedArrivalMin: s.plannedArrivalMin,
              etaMin: s.etaMin,
              chilled: s.order.temp === "CHILLED",
              units: s.order.units,
              note: s.order.notes,
              lines: s.order.lines.map((l) => ({ id: l.id, description: l.description, category: l.category, quantity: l.quantity })),
              status: s.status,
              arrivedAt: s.arrivedAt?.toISOString() ?? null,
              completedAt: s.completedAt?.toISOString() ?? null,
            }
          }),
        }
      })
    }

    return {
      generatedAt: new Date().toISOString(),
      date,
      driver: { id: me.id, name: me.name, phone: me.phone },
      config: driverConfig(),
      clock: this.clock.now(),
      trips,
      issues: await this.tripIssues(user, trips.map((t) => t.id)),
    }
  }

  /** Issues on the driver's trips, whoever raised them, with their group chat. */
  private async tripIssues(user: SessionUser, tripIds: string[]): Promise<DriverIssue[]> {
    const where: Prisma.IssueWhereInput = {
      OR: [{ tripId: { in: tripIds } }, { reportedById: user.sub }, ...(user.vehicleId ? [{ vehicleId: user.vehicleId, status: { not: "RESOLVED" as const } }] : [])],
    }
    const include = {
      reportedBy: { select: { name: true, role: true, email: true } },
      outlet: { select: { name: true } },
      order: { select: { outlet: { select: { name: true } } } },
      trip: { select: { ref: true } },
      chat: { select: { id: true, closedAt: true, members: { where: { userId: user.sub }, select: { unread: true } }, messages: { orderBy: { createdAt: "desc" as const }, take: 1, select: { body: true } } } },
    } satisfies Prisma.IssueInclude
    let rows = await this.db.issue.findMany({ where, orderBy: { createdAt: "desc" }, take: 30, include })
    // Older and machine-raised issues get their chat on first sight (quietly: nobody is notified).
    const missing = rows.filter((r) => !r.chat)
    if (missing.length) {
      await Promise.all(missing.map((r) => this.issueChat.ensure(r.id, { notify: false }).catch(() => null)))
      rows = await this.db.issue.findMany({ where, orderBy: { createdAt: "desc" }, take: 30, include })
    }
    return rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      type: r.type,
      severity: r.severity,
      status: r.status,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      reportedBy: r.reportedBy.email === "system@waypoint.lk" ? { name: "Live monitoring", role: "SYSTEM" as const } : { name: r.reportedBy.name, role: r.reportedBy.role },
      outletName: r.outlet?.name ?? r.order?.outlet.name ?? null,
      tripRef: r.trip?.ref ?? null,
      resolution: r.resolution,
      chat: r.chat ? { id: r.chat.id, unread: r.chat.members[0]?.unread ?? 0, closed: !!r.chat.closedAt, lastMessage: r.chat.messages[0] ? bodyPreview(r.chat.messages[0].body) : null } : null,
    }))
  }

  async saveMedia(input: DriverMediaInput) {
    const bytes = Buffer.from(input.data, "base64")
    await this.db.mediaAsset.upsert({
      where: { id: input.id },
      create: { id: input.id, kind: input.kind, mimeType: input.mimeType, sizeBytes: bytes.length, data: bytes },
      update: {},
    })
    return { id: input.id, sizeBytes: bytes.length }
  }

  /** Replay the phone's outbox. Idempotent: every record has a client id. */
  async sync(user: SessionUser, input: DriverSyncInput): Promise<DriverSyncResult> {
    const result: DriverSyncResult = {
      serverTime: new Date().toISOString(),
      clock: this.clock.now(),
      accepted: { events: [], locations: [], issues: [], chats: [] },
      rejected: [],
    }

    // Events in the order they happened on the device.
    for (const ev of [...input.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      try {
        const verdict = await this.applyEvent(user, ev, input.deviceId)
        if (verdict === "ok") result.accepted.events.push(ev.id)
        else if (verdict !== "retry") result.rejected.push({ kind: "event", id: ev.id, reason: verdict })
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") result.accepted.events.push(ev.id)
        // Anything else is a transient server problem: leave it in the outbox.
      }
    }

    if (input.locations.length) {
      const owned = new Set((await this.db.trip.findMany({ where: { id: { in: [...new Set(input.locations.map((l) => l.tripId).filter(Boolean) as string[])] }, ...this.tripScope(user) }, select: { id: true } })).map((t) => t.id))
      await this.db.driverLocation.createMany({
        data: input.locations.map((l) => ({
          id: l.id,
          driverId: user.sub,
          tripId: l.tripId && owned.has(l.tripId) ? l.tripId : null,
          lat: l.lat,
          lng: l.lng,
          accuracyM: l.accuracyM,
          speedKmh: l.speedKmh,
          heading: l.heading,
          simulated: l.simulated,
          capturedAt: new Date(l.capturedAt),
        })),
        skipDuplicates: true,
      })
      result.accepted.locations.push(...input.locations.map((l) => l.id))
    }

    for (const issue of input.issues) {
      try {
        if (issue.photoId && !(await this.db.mediaAsset.findUnique({ where: { id: issue.photoId }, select: { id: true } }))) continue // photo not uploaded yet: retry
        await this.issues.create(user, issue)
        result.accepted.issues.push(issue.clientId)
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") result.accepted.issues.push(issue.clientId)
      }
    }

    for (const m of [...input.chats].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const verdict = await this.sendChat(user, m)
      if (verdict === "ok") result.accepted.chats.push(m.id)
      else if (verdict !== "retry") result.rejected.push({ kind: "chat", id: m.id, reason: verdict })
    }
    return result
  }

  private async sendChat(user: SessionUser, m: DriverChatInput): Promise<"ok" | "retry" | string> {
    try {
      await this.issueChat.send(user, m.chatId, { body: m.body, clientId: m.id })
      return "ok"
    } catch (e) {
      if (e instanceof ConflictException || e instanceof ForbiddenException || e instanceof NotFoundException) return e.message
      return "retry"
    }
  }

  private async applyEvent(user: SessionUser, ev: DriverEventInput, deviceId?: string): Promise<"ok" | "retry" | string> {
    if (await this.db.deliveryEvent.findUnique({ where: { id: ev.id }, select: { id: true } })) return "ok"
    const trip = await this.db.trip.findFirst({
      where: { id: ev.tripId, ...this.tripScope(user) },
      include: { plan: { select: { date: true } }, stops: { select: { id: true, status: true, orderId: true, order: { select: { outletId: true, ref: true } } } } },
    })
    if (!trip) return "This trip is no longer assigned to you"
    const stop = ev.stopId ? trip.stops.find((s) => s.id === ev.stopId) : undefined
    if (ev.type !== "TRIP_DEPARTED" && ev.type !== "TRIP_COMPLETED" && !stop) return "This stop is no longer on the trip"

    const at = new Date(ev.occurredAt)
    const base = { id: ev.id, tripId: trip.id, stopId: stop?.id, driverId: user.sub, type: ev.type, occurredAt: at, deviceId, payload: ev.reason || ev.pod || ev.location ? ({ reason: ev.reason, podId: ev.pod?.id, location: ev.location } as Prisma.InputJsonValue) : undefined } as const

    if (ev.type === "TRIP_DEPARTED") {
      await this.db.$transaction([
        this.db.trip.update({ where: { id: trip.id }, data: { status: "DEPARTED", departedAt: trip.departedAt ?? at, driverId: trip.driverId ?? user.sub } }),
        this.db.order.updateMany({ where: { id: { in: trip.stops.map((s) => s.orderId) }, status: { in: ["PLANNED", "LOADED"] } }, data: { status: "IN_TRANSIT" } }),
        this.db.deliveryEvent.create({ data: base }),
      ])
      return "ok"
    }

    if (ev.type === "TRIP_COMPLETED") {
      await this.db.$transaction([
        this.db.trip.update({ where: { id: trip.id }, data: { status: "COMPLETED", completedAt: at } }),
        this.db.deliveryEvent.create({ data: base }),
      ])
      return "ok"
    }

    if (ev.type === "ARRIVED") {
      await this.db.$transaction([
        ...(stop!.status === "PENDING" ? [this.db.stop.update({ where: { id: stop!.id }, data: { status: "ARRIVED", arrivedAt: at } })] : []),
        this.db.deliveryEvent.create({ data: base }),
      ])
      return "ok"
    }

    if (!isCompleting(ev.type)) return "Unknown event"
    // Proof must exist before the delivery that cites it; the phone uploads media first.
    for (const m of [ev.pod?.signatureId, ev.pod?.photoId]) {
      if (m && !(await this.db.mediaAsset.findUnique({ where: { id: m }, select: { id: true } }))) return "retry"
    }
    const already = stop!.status === "DELIVERED" || stop!.status === "PARTIAL" || stop!.status === "REFUSED"
    const ops: Prisma.PrismaPromise<unknown>[] = []
    if (!already) {
      ops.push(this.db.stop.update({ where: { id: stop!.id }, data: { status: ev.type, completedAt: at, arrivedAt: at } }))
      ops.push(this.db.order.update({ where: { id: stop!.orderId }, data: { status: ev.type } }))
      if (ev.type !== "REFUSED")
        ops.push(this.db.outlet.update({ where: { id: stop!.order.outletId }, data: { lastDeliveredOn: trip.plan.date } }))
      if (ev.pod && !(await this.db.proofOfDelivery.findUnique({ where: { stopId: stop!.id }, select: { id: true } }))) {
        ops.push(
          this.db.proofOfDelivery.create({
            data: {
              id: ev.pod.id,
              stopId: stop!.id,
              recipientName: ev.pod.recipientName,
              notes: ev.pod.notes,
              capturedAt: new Date(ev.pod.capturedAt),
              signatureId: ev.pod.signatureId,
              photoId: ev.pod.photoId,
              lines: { create: ev.pod.lines.map((l) => ({ orderLineId: l.orderLineId, deliveredQty: l.deliveredQty, refusedQty: l.refusedQty, reason: l.reason })) },
            },
          }),
        )
      }
      // The store manager sees what happened at their counter.
      const managers = await this.db.user.findMany({ where: { role: "STORE_MANAGER", outletId: stop!.order.outletId }, select: { id: true } })
      if (managers.length)
        ops.push(
          this.db.notification.createMany({
            data: managers.map((m) => ({
              userId: m.id,
              type: "DELIVERY_UPDATE",
              title: `${stop!.order.ref} ${ev.type === "DELIVERED" ? "delivered" : ev.type === "PARTIAL" ? "partly delivered" : "refused"}`,
              body: ev.pod ? `Received by ${ev.pod.recipientName}. Please confirm what arrived.` : (ev.reason ?? "Delivery recorded by the driver."),
              link: `/store-manager/orders/${stop!.orderId}`,
            })),
          }),
        )
    }
    ops.push(this.db.deliveryEvent.create({ data: base }))
    await this.db.$transaction(ops)
    return "ok"
  }
}

@Roles("DRIVER")
@Controller("driver")
export class DriverController {
  constructor(private readonly driver: DriverService) {}

  @Get("bundle")
  bundle(@CurrentUser() user: SessionUser) {
    return this.driver.bundle(user)
  }

  @Post("media")
  media(@Body(new ZodPipe(driverMediaSchema)) body: DriverMediaInput) {
    return this.driver.saveMedia(body)
  }

  @Post("sync")
  sync(@CurrentUser() user: SessionUser, @Body(new ZodPipe(driverSyncSchema)) body: DriverSyncInput) {
    return this.driver.sync(user, body)
  }
}

@Module({ imports: [LiveModule, RoutingModule, IssuesModule, IssueChatModule], controllers: [DriverController], providers: [DriverService] })
export class DriverModule {}
