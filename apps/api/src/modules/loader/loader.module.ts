import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from "@nestjs/common"
import { Prisma } from "@waypoint/db"
import {
  dateOnly,
  LOADER_QUEUE_FILTERS,
  loaderIssueSchema,
  minToHHMM,
  type CreateIssueInput,
  type LoaderCapacityBreach,
  type LoaderCompleteBlocked,
  type LoaderIssueRequest,
  type LoaderIssueResult,
  type LoaderQueueFilter,
  type LoaderTrip,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"
import { IssueChatModule, IssueChatService } from "../issue-chat/issue-chat.module"
import { IssuesModule } from "../issues/issues.module"
import { IssuesService } from "../issues/issues.service"

const isQueueFilter = (f: string): f is LoaderQueueFilter => (LOADER_QUEUE_FILTERS as readonly string[]).includes(f)

/** An open problem raised while loading. */
const OPEN_LOADING_ISSUE: Prisma.IssueWhereInput = { stage: "LOADING", status: { not: "RESOLVED" } }

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

/** Shared by the queue list and every single-trip response, so a returned trip can replace its queue row. */
const queueInclude = {
  vehicle: { select: { id: true, type: true, temp: true, weightCapKg: true, volumeCapM3: true } },
  claimedBy: { select: { id: true, name: true } },
  loadedBy: { select: { id: true, name: true } },
  driver: { select: { name: true } },
  issues: { where: OPEN_LOADING_ISSUE, orderBy: { createdAt: "desc" }, select: { id: true, ref: true, type: true, severity: true, status: true, description: true, stopId: true } },
  stops: {
    orderBy: { seq: "asc" },
    select: {
      id: true,
      seq: true,
      loadStatus: true,
      order: {
        select: {
          id: true,
          ref: true,
          temp: true,
          units: true,
          weightKg: true,
          volumeM3: true,
          lines: { select: { id: true, description: true, category: true, quantity: true, weightKg: true, volumeM3: true } },
          outlet: { select: { id: true, name: true, windowOpenMin: true, windowCloseMin: true } },
        },
      },
    },
  },
} satisfies Prisma.TripInclude

type QueueRow = Prisma.TripGetPayload<{ include: typeof queueInclude }>

/** The rule every loading write shares: only the loader holding the trip, and only while it is being loaded. */
function assertLoadingByMe(trip: { claimedById: string | null; status: string }, user: SessionUser) {
  if (trip.claimedById !== user.sub) throw new ForbiddenException("You do not have this trip claimed")
  if (trip.status !== "LOADING") throw new ConflictException("This trip is not being loaded")
}

/** The one shape every loader trip response takes (see LoaderTrip in @waypoint/shared). */
function toLoaderTrip(t: QueueRow): LoaderTrip {
  return {
    id: t.id,
    ref: t.ref,
    tripNo: t.tripNo,
    brand: t.brand,
    status: t.status,
    plannedDepartMin: t.plannedDepartMin,
    loadWeightKg: t.loadWeightKg,
    loadVolumeM3: t.loadVolumeM3,
    claimedBy: t.claimedBy,
    claimedAt: t.claimedAt?.toISOString() ?? null,
    loadedBy: t.loadedBy,
    loadedAt: t.loadedAt?.toISOString() ?? null,
    driver: t.driver,
    vehicle: t.vehicle,
    district: { id: t.districtId },
    issues: t.issues,
    stops: t.stops.map(({ order: { outlet, ...order }, ...s }) => ({ ...s, order, outlet })),
  }
}

@Injectable()
export class LoaderService {
  constructor(
    private readonly db: PrismaService,
    private readonly calendar: ClockService,
    private readonly issues: IssuesService,
    private readonly issueChat: IssueChatService,
  ) {}

  /** The loading bay's trips for today's published plan at the loader's depot. */
  async getQueue(user: SessionUser, filter: LoaderQueueFilter): Promise<LoaderTrip[]> {
    if (!user.depotId) return []
    const date = await this.calendar.operatingDate()
    const plan = await this.db.plan.findFirst({
      where: { depotId: user.depotId, date: dateOnly(date), status: "PUBLISHED" },
      orderBy: { version: "desc" },
      select: { id: true },
    })
    if (!plan) return []

    const byFilter: Record<LoaderQueueFilter, Prisma.TripWhereInput> = {
      all: {},
      unclaimed: { status: "PLANNED" },
      mine: { claimedById: user.sub },
      flagged: { issues: { some: OPEN_LOADING_ISSUE } },
    }
    const rows = await this.db.trip.findMany({
      where: { planId: plan.id, stops: { some: {} }, ...byFilter[filter] },
      orderBy: [{ plannedDepartMin: "asc" }, { ref: "asc" }],
      include: queueInclude,
    })
    return rows.map(toLoaderTrip)
  }

  /** One trip at the loader's own depot, in the queue-row shape. */
  async getTrip(user: SessionUser, tripId: string): Promise<LoaderTrip> {
    const row = user.depotId ? await this.db.trip.findFirst({ where: { id: tripId, plan: { depotId: user.depotId } }, include: queueInclude }) : null
    if (!row) throw new NotFoundException("Trip not found")
    return toLoaderTrip(row)
  }

  /**
   * Take a trip for loading. One conditional write, so two loaders racing for the
   * same trip cannot both win: the loser matches zero rows and its transaction rolls back.
   */
  async claimTrip(user: SessionUser, tripId: string) {
    if (!user.depotId) throw new ForbiddenException("You are not assigned to a depot")
    const depotId = user.depotId
    const result = await this.db.$transaction(async (tx) => {
      const claimedAt = new Date()
      const updated = await tx.trip.updateMany({
        where: { id: tripId, claimedById: null, status: "PLANNED", plan: { depotId } },
        data: { claimedById: user.sub, claimedAt, status: "LOADING" },
      })
      if (updated.count === 0) throw new ConflictException("Trip is already claimed or not available")
      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: "TRIP_CLAIMED",
          entityType: "Trip",
          entityId: tripId,
          before: { status: "PLANNED", claimedById: null },
          after: { status: "LOADING", claimedById: user.sub, claimedAt: claimedAt.toISOString() },
        },
      })
      return tx.trip.findUniqueOrThrow({ where: { id: tripId } })
    })
    return this.getTripDetail(result.id)
  }

  /** Hand a claimed trip back to the queue. Only the loader holding it can. */
  async unclaimTrip(user: SessionUser, tripId: string) {
    const result = await this.db.$transaction(async (tx) => {
      const updated = await tx.trip.updateMany({
        where: { id: tripId, claimedById: user.sub, status: "LOADING" },
        data: { claimedById: null, claimedAt: null, status: "PLANNED" },
      })
      if (updated.count === 0) throw new ForbiddenException("You do not have this trip claimed")
      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: "TRIP_UNCLAIMED",
          entityType: "Trip",
          entityId: tripId,
          before: { status: "LOADING", claimedById: user.sub },
          after: { status: "PLANNED", claimedById: null },
        },
      })
      return tx.trip.findUniqueOrThrow({ where: { id: tripId } })
    })
    return this.getTripDetail(result.id)
  }

  /**
   * Mark a stop's order as stowed on the truck, refusing if it would breach the vehicle's
   * weight or volume cap. The trip row is locked first, so two confirms on the same trip
   * run one after the other and cannot both pass the capacity check.
   */
  async confirmStop(user: SessionUser, stopId: string) {
    return this.db.$transaction(async (tx) => {
      const ref = await tx.stop.findUnique({ where: { id: stopId }, select: { tripId: true } })
      if (!ref) throw new NotFoundException("Stop not found")
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${ref.tripId} FOR UPDATE`

      const stop = await tx.stop.findUniqueOrThrow({
        where: { id: stopId },
        include: {
          order: { select: { ref: true, weightKg: true, volumeM3: true } },
          trip: {
            select: {
              claimedById: true,
              status: true,
              vehicle: { select: { weightCapKg: true, volumeCapM3: true } },
              stops: { select: { id: true, loadStatus: true, order: { select: { weightKg: true, volumeM3: true } } } },
            },
          },
        },
      })
      const { trip } = stop
      assertLoadingByMe(trip, user)
      // Already confirmed: a repeat tap changes nothing and returns the stop as the first confirm did.
      if (stop.loadStatus === "STOWED") return tx.stop.findUniqueOrThrow({ where: { id: stop.id } })

      const stowed = trip.stops.filter((s) => s.id !== stop.id && s.loadStatus === "STOWED")
      const weight = { loaded: round1(stowed.reduce((t, s) => t + s.order.weightKg, stop.order.weightKg)), cap: trip.vehicle.weightCapKg }
      const volume = { loaded: round2(stowed.reduce((t, s) => t + s.order.volumeM3, stop.order.volumeM3)), cap: trip.vehicle.volumeCapM3 }
      if (weight.loaded > weight.cap || volume.loaded > volume.cap) {
        throw new ConflictException({ message: `Loading ${stop.order.ref} would exceed the vehicle's capacity`, weight, volume } satisfies LoaderCapacityBreach)
      }

      const updated = await tx.stop.update({ where: { id: stop.id }, data: { loadStatus: "STOWED" } })
      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: "STOP_LOADED",
          entityType: "Stop",
          entityId: stop.id,
          before: { loadStatus: stop.loadStatus },
          after: { loadStatus: "STOWED", tripId: stop.tripId, weight, volume },
        },
      })
      return updated
    })
  }

  /**
   * Finish loading: the trip becomes LOADED and is handed over for departure. Every stop must be
   * stowed or held back with an unresolved issue (dispatch already knows about it). Only the stowed
   * orders become LOADED; held-back orders stay PLANNED for dispatch to re-plan. The trip row is
   * locked first, so a confirm or a second complete arriving at the same moment waits its turn.
   */
  async completeTrip(user: SessionUser, tripId: string): Promise<LoaderTrip> {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: {
          claimedById: true,
          status: true,
          stops: {
            orderBy: { seq: "asc" },
            select: {
              id: true,
              seq: true,
              loadStatus: true,
              orderId: true,
              order: { select: { ref: true, outlet: { select: { name: true } } } },
              issues: { where: { status: { not: "RESOLVED" } }, select: { id: true } },
            },
          },
        },
      })
      if (!trip) throw new NotFoundException("Trip not found")
      assertLoadingByMe(trip, user)

      const blocking = trip.stops.filter((s) => s.loadStatus !== "STOWED" && s.issues.length === 0)
      if (blocking.length) {
        const list = blocking.map((s) => `${s.order.ref} → ${s.order.outlet.name} (stop ${s.seq}, ${s.loadStatus.toLowerCase()})`).join("; ")
        throw new BadRequestException({
          message: `Cannot finish loading: ${blocking.length === 1 ? "1 stop is" : `${blocking.length} stops are`} neither stowed nor reported: ${list}`,
          blocking: blocking.map((s) => ({ stopId: s.id, seq: s.seq, orderRef: s.order.ref, outletName: s.order.outlet.name, loadStatus: s.loadStatus })),
        } satisfies LoaderCompleteBlocked)
      }

      const stowed = trip.stops.filter((s) => s.loadStatus === "STOWED")
      const heldBack = trip.stops.filter((s) => s.loadStatus !== "STOWED")
      const loadedAt = new Date()
      await tx.trip.update({ where: { id: tripId }, data: { status: "LOADED", loadedById: user.sub, loadedAt } })
      await tx.order.updateMany({ where: { id: { in: stowed.map((s) => s.orderId) }, status: "PLANNED" }, data: { status: "LOADED" } })
      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: "TRIP_LOADED",
          entityType: "Trip",
          entityId: tripId,
          before: { status: "LOADING", loadedAt: null },
          after: { status: "LOADED", loadedById: user.sub, loadedAt: loadedAt.toISOString(), stowed: stowed.length, heldBack: heldBack.map((s) => s.order.ref) },
        },
      })
    })
    return this.getTripDetail(tripId)
  }

  /**
   * A problem found at the loading bay, reported to dispatch. The description is written here from
   * the trip's own data, never taken from the client. Missing and damaged items raise one issue per
   * order line so each shortage can be acted on separately. Everything is checked before anything
   * is written, and each issue's clientId derives from the request's, so a retry never duplicates.
   */
  async reportIssue(user: SessionUser, input: LoaderIssueRequest): Promise<LoaderIssueResult> {
    if (!user.depotId) throw new ForbiddenException("You are not assigned to a depot")
    const row = await this.db.trip.findFirst({ where: { id: input.tripId, plan: { depotId: user.depotId } }, include: queueInclude })
    if (!row) throw new NotFoundException("Trip not found")
    const trip = toLoaderTrip(row)
    const stop = input.stopId ? trip.stops.find((s) => s.id === input.stopId) : undefined
    if (input.stopId && !stop) throw new BadRequestException("That order is not on this trip")

    const on = `${trip.vehicle.id}, ${trip.ref}`
    const at = stop ? `${stop.order.ref} → ${stop.outlet.name}` : ""
    const note = input.notes?.trim() ? ` Note: ${input.notes.trim()}` : ""
    const base = { stage: "LOADING", tripId: trip.id, vehicleId: trip.vehicle.id, stopId: stop?.id, orderId: stop?.order.id, outletId: stop?.outlet.id } as const
    const drafts: CreateIssueInput[] = []

    if (input.kind === "missing" || input.kind === "damaged") {
      for (const pick of input.lines) {
        const line = stop!.order.lines.find((l) => l.id === pick.orderLineId)
        if (!line) throw new BadRequestException(`That item is not on ${stop!.order.ref}`)
        if (pick.units > line.quantity) throw new BadRequestException(`${line.description}: only ${line.quantity} units were ordered`)
        drafts.push({
          ...base,
          clientId: `${input.clientId}:${line.id}`,
          type: input.kind === "missing" ? "LOAD_MISSING" : "LOAD_DAMAGED",
          severity: input.kind === "missing" ? "HIGH" : "MEDIUM",
          orderLineId: line.id,
          quantity: pick.units,
          description: `${line.description}: ${pick.units} of ${line.quantity} units ${input.kind} for ${at} (${on}).${note}`,
        })
      }
    } else if (input.kind === "sequence") {
      const order = [...trip.stops].sort((a, b) => b.seq - a.seq)
      const p = order.findIndex((s) => s.id === stop!.id) + 1
      drafts.push({
        ...base,
        clientId: input.clientId,
        type: "SEQUENCE_ISSUE",
        severity: "MEDIUM",
        description: `${at} is staged out of the loading sequence on ${on}: planned SEQ #${p} of ${order.length} (delivery stop ${stop!.seq}).${note}`,
      })
    } else if (input.kind === "delay") {
      drafts.push({
        ...base,
        clientId: input.clientId,
        type: "DEPARTURE_DELAY",
        severity: input.delayMin! >= 30 ? "HIGH" : "MEDIUM",
        description: `${on} expected to leave ${input.delayMin} min late (planned ${minToHHMM(trip.plannedDepartMin)}). Reason: ${input.delayReason ?? "not given"}.${note}`,
      })
    } else {
      // Recompute the breach from the database rather than trusting the numbers on screen.
      const stowed = trip.stops.filter((s) => s.id !== stop!.id && s.loadStatus === "STOWED")
      const kg = round1(stowed.reduce((t, s) => t + s.order.weightKg, stop!.order.weightKg))
      const m3 = round2(stowed.reduce((t, s) => t + s.order.volumeM3, stop!.order.volumeM3))
      if (kg <= trip.vehicle.weightCapKg && m3 <= trip.vehicle.volumeCapM3) throw new BadRequestException(`${stop!.order.ref} fits on ${trip.vehicle.id}: nothing to report`)
      drafts.push({
        ...base,
        clientId: input.clientId,
        type: "CAPACITY_BREACH",
        severity: "HIGH",
        description:
          `Loading ${at} would overload ${on}: ${kg} / ${trip.vehicle.weightCapKg} kg and ${m3} / ${trip.vehicle.volumeCapM3} m³. ` +
          (input.resolution === "hold" ? "Loader is holding these items back." : "Loader reports a data discrepancy: the recorded weights or volumes look wrong.") +
          note,
      })
    }

    const issues = []
    for (const d of drafts) issues.push(await this.issues.create(user, d))
    return { issues: issues.map((i) => ({ id: i.id, ref: i.ref, type: i.type, description: i.description })) }
  }

  /** One trip in the same shape as a queue row, so the client can swap it in place. */
  private async getTripDetail(tripId: string): Promise<LoaderTrip> {
    return toLoaderTrip(await this.db.trip.findUniqueOrThrow({ where: { id: tripId }, include: queueInclude }))
  }
}

@Roles("LOADER")
@Controller("loader")
export class LoaderController {
  constructor(private readonly loader: LoaderService) {}

  @Get("trips")
  trips(@CurrentUser() user: SessionUser, @Query("filter") filter = "unclaimed") {
    if (!isQueueFilter(filter)) throw new BadRequestException(`filter must be one of: ${LOADER_QUEUE_FILTERS.join(", ")}`)
    return this.loader.getQueue(user, filter)
  }

  @Get("trips/:tripId")
  trip(@CurrentUser() user: SessionUser, @Param("tripId") tripId: string) {
    return this.loader.getTrip(user, tripId)
  }

  @Post("trips/:tripId/claim")
  claim(@CurrentUser() user: SessionUser, @Param("tripId") tripId: string) {
    return this.loader.claimTrip(user, tripId)
  }

  @Post("trips/:tripId/unclaim")
  unclaim(@CurrentUser() user: SessionUser, @Param("tripId") tripId: string) {
    return this.loader.unclaimTrip(user, tripId)
  }

  @Post("trips/:tripId/complete")
  complete(@CurrentUser() user: SessionUser, @Param("tripId") tripId: string) {
    return this.loader.completeTrip(user, tripId)
  }

  @Post("issues")
  reportIssue(@CurrentUser() user: SessionUser, @Body(new ZodPipe(loaderIssueSchema)) body: LoaderIssueRequest) {
    return this.loader.reportIssue(user, body)
  }

  @Post("stops/:stopId/confirm")
  confirm(@CurrentUser() user: SessionUser, @Param("stopId") stopId: string) {
    return this.loader.confirmStop(user, stopId)
  }
}

@Module({ imports: [IssuesModule, IssueChatModule], controllers: [LoaderController], providers: [LoaderService] })
export class LoaderModule {}
