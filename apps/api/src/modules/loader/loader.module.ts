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
  type LoaderIssueDetail,
  type LoaderIssueRequest,
  type LoaderIssueResult,
  type LoaderQueueFilter,
  type LoaderTrip,
  stopCountSchema,
  type StopCountRequest,
  type StopCountResult,
  stopLineSchema,
  type StopLineInput,
  type StopLineResult,
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
  plan: { select: { status: true, version: true } },
  claimedBy: { select: { id: true, name: true } },
  loadedBy: { select: { id: true, name: true } },
  driver: { select: { name: true } },
  issues: { where: OPEN_LOADING_ISSUE, orderBy: { createdAt: "desc" }, select: { id: true, ref: true, type: true, severity: true, status: true, description: true, stopId: true, orderLineId: true } },
  stops: {
    orderBy: { seq: "asc" },
    select: {
      id: true,
      seq: true,
      loadStatus: true,
      loadLines: { select: { orderLineId: true, loadedQty: true, damagedQty: true, countedAt: true } },
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
function assertLoadingByMe(trip: { claimedById: string | null; status: string; plan: { status: string; version: number } }, user: SessionUser) {
  // Dispatch re-published the day: this trip belongs to a replaced plan and must not be loaded any further.
  if (trip.plan.status !== "PUBLISHED") throw new ConflictException(`Dispatch replaced this plan: version ${trip.plan.version} is no longer current`)
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
    plan: t.plan,
    claimedBy: t.claimedBy,
    claimedAt: t.claimedAt?.toISOString() ?? null,
    loadedBy: t.loadedBy,
    loadedAt: t.loadedAt?.toISOString() ?? null,
    driver: t.driver,
    vehicle: t.vehicle,
    district: { id: t.districtId },
    issues: t.issues,
    stops: t.stops.map(({ order: { outlet, lines, ...order }, loadLines, ...s }) => ({
      ...s,
      order: {
        ...order,
        lines: lines.map((l) => {
          const c = loadLines.find((x) => x.orderLineId === l.id)
          return { ...l, count: c ? { loadedQty: c.loadedQty, damagedQty: c.damagedQty, countedAt: c.countedAt.toISOString() } : null }
        }),
      },
      outlet,
    })),
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
      loaded: { loadedById: user.sub },
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
        // loaderId/loaderClaimedAt are the depot gate's claim: set here too so dispatch sees this loader, and skip a trip another loader already took at the gate.
        where: { id: tripId, claimedById: null, status: "PLANNED", plan: { depotId, status: "PUBLISHED" }, OR: [{ loaderId: null }, { loaderId: user.sub }] },
        data: { claimedById: user.sub, claimedAt, status: "LOADING", loaderId: user.sub, loaderClaimedAt: claimedAt },
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

  /**
   * Hand a claimed trip back to the queue. Only the loader holding it can, and only before anything
   * is stowed: a half-loaded truck must be finished (or its stops reported), never abandoned. The trip
   * row is locked first, so an unclaim cannot slip past a confirm that is still being written.
   */
  async unclaimTrip(user: SessionUser, tripId: string) {
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`
      const updated = await tx.trip.updateMany({
        where: { id: tripId, claimedById: user.sub, status: "LOADING", stops: { none: { loadStatus: "STOWED" } } },
        data: { claimedById: null, claimedAt: null, status: "PLANNED", loaderId: null, loaderClaimedAt: null },
      })
      if (updated.count === 0) {
        // Say why: held by me but already part-loaded, or not mine to give back.
        const stowed = await tx.stop.count({ where: { tripId, loadStatus: "STOWED", trip: { claimedById: user.sub, status: "LOADING" } } })
        if (stowed) throw new ConflictException(`${stowed} ${stowed === 1 ? "stop is" : "stops are"} already stowed: finish loading or report the remaining stops instead`)
        throw new ForbiddenException("You do not have this trip claimed")
      }
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
          order: { select: { ref: true, weightKg: true, volumeM3: true, lines: { select: { id: true, quantity: true } } } },
          trip: {
            select: {
              claimedById: true,
              status: true,
              plan: { select: { status: true, version: true } },
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

      // Items not ticked or counted individually went on whole: record them, so item ticks and the order agree.
      await tx.loadLine.createMany({
        data: stop.order.lines.map((l) => ({ stopId: stop.id, orderLineId: l.id, loadedQty: l.quantity, damagedQty: 0, countedById: user.sub })),
        skipDuplicates: true,
      })
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
          plan: { select: { status: true, version: true } },
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
   * Tick (or untick) one item of a stop as fully loaded in good condition, item by item from the load list.
   * Same lock and holder rule as every loading write; a stowed stop is final. When the tick completes the
   * order (every item fully loaded), the stop is stowed through confirmStop, so the capacity check applies;
   * a breach keeps the tick but leaves the stop unstowed.
   */
  async markLine(user: SessionUser, stopId: string, lineId: string, input: StopLineInput): Promise<StopLineResult> {
    const complete = await this.db.$transaction(async (tx) => {
      const ref = await tx.stop.findUnique({ where: { id: stopId }, select: { tripId: true } })
      if (!ref) throw new NotFoundException("Stop not found")
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${ref.tripId} FOR UPDATE`
      const stop = await tx.stop.findUniqueOrThrow({
        where: { id: stopId },
        select: {
          loadStatus: true,
          trip: { select: { claimedById: true, status: true, plan: { select: { status: true, version: true } } } },
          order: { select: { ref: true, lines: { select: { id: true, description: true, quantity: true } } } },
          loadLines: { select: { orderLineId: true, loadedQty: true, damagedQty: true } },
        },
      })
      assertLoadingByMe(stop.trip, user)
      if (stop.loadStatus === "STOWED") throw new ConflictException(`${stop.order.ref} is already confirmed loaded`)
      const line = stop.order.lines.find((l) => l.id === lineId)
      if (!line) throw new BadRequestException(`That item is not on ${stop.order.ref}`)

      if (input.loaded) {
        await tx.loadLine.upsert({
          where: { stopId_orderLineId: { stopId, orderLineId: line.id } },
          create: { stopId, orderLineId: line.id, loadedQty: line.quantity, damagedQty: 0, countedById: user.sub },
          update: { loadedQty: line.quantity, damagedQty: 0, countedById: user.sub },
        })
      } else {
        await tx.loadLine.deleteMany({ where: { stopId, orderLineId: line.id } })
      }
      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: input.loaded ? "ITEM_LOADED" : "ITEM_UNMARKED",
          entityType: "Stop",
          entityId: stopId,
          after: { item: line.description, orderLineId: line.id, units: input.loaded ? line.quantity : 0 },
        },
      })

      const counts = new Map(stop.loadLines.map((c) => [c.orderLineId, c]))
      if (input.loaded) counts.set(line.id, { orderLineId: line.id, loadedQty: line.quantity, damagedQty: 0 })
      else counts.delete(line.id)
      return stop.order.lines.every((l) => counts.get(l.id)?.loadedQty === l.quantity && counts.get(l.id)?.damagedQty === 0)
    })

    if (!complete) return { stop: { id: stopId, loadStatus: "PENDING" }, breach: null }
    try {
      return { stop: { id: stopId, loadStatus: (await this.confirmStop(user, stopId)).loadStatus }, breach: null }
    } catch (err) {
      const body = err instanceof ConflictException ? err.getResponse() : null
      if (body && typeof body === "object" && "weight" in body) return { stop: { id: stopId, loadStatus: "PENDING" }, breach: body as LoaderCapacityBreach }
      throw err
    }
  }

  /**
   * Save the item checklist for one stop: what went on the truck, line by line. Every order line must be
   * counted exactly once (loaded + damaged never above what was ordered). Shortfalls raise a missing and/or
   * damaged issue through reportIssue; if any good units were loaded the stop is stowed through confirmStop,
   * so the capacity check and audit trail are the same as ticking it off. A breach keeps the stop unstowed
   * but the count and issues are still saved. Retries with the same clientId never duplicate issues.
   */
  async countStop(user: SessionUser, stopId: string, input: StopCountRequest): Promise<StopCountResult> {
    const counted = await this.db.$transaction(async (tx) => {
      const ref = await tx.stop.findUnique({ where: { id: stopId }, select: { tripId: true } })
      if (!ref) throw new NotFoundException("Stop not found")
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${ref.tripId} FOR UPDATE`
      const stop = await tx.stop.findUniqueOrThrow({
        where: { id: stopId },
        select: {
          tripId: true,
          loadStatus: true,
          trip: { select: { claimedById: true, status: true, plan: { select: { status: true, version: true } } } },
          order: { select: { ref: true, lines: { select: { id: true, description: true, quantity: true } } } },
        },
      })
      assertLoadingByMe(stop.trip, user)
      if (stop.loadStatus === "STOWED") throw new ConflictException(`${stop.order.ref} is already confirmed loaded`)

      const byLine = new Map(input.lines.map((l) => [l.orderLineId, l]))
      if (byLine.size !== input.lines.length) throw new BadRequestException("Count each item once")
      const foreign = input.lines.find((l) => !stop.order.lines.some((x) => x.id === l.orderLineId))
      if (foreign) throw new BadRequestException(`That item is not on ${stop.order.ref}`)
      const uncounted = stop.order.lines.filter((l) => !byLine.has(l.id))
      if (uncounted.length) throw new BadRequestException(`Count every item: ${uncounted.map((l) => l.description).join(", ")} not counted`)
      for (const l of stop.order.lines) {
        const c = byLine.get(l.id)!
        if (c.loadedQty + c.damagedQty > l.quantity)
          throw new BadRequestException(`${l.description}: ${c.loadedQty} loaded + ${c.damagedQty} damaged is more than the ${l.quantity} ordered`)
      }

      for (const l of stop.order.lines) {
        const { loadedQty, damagedQty } = byLine.get(l.id)!
        await tx.loadLine.upsert({
          where: { stopId_orderLineId: { stopId, orderLineId: l.id } },
          create: { stopId, orderLineId: l.id, loadedQty, damagedQty, countedById: user.sub },
          update: { loadedQty, damagedQty, countedById: user.sub },
        })
      }
      const lines = stop.order.lines.map((l) => ({ line: l, ...byLine.get(l.id)! }))
      await tx.auditLog.create({
        data: {
          actorId: user.sub,
          action: "STOP_COUNTED",
          entityType: "Stop",
          entityId: stopId,
          after: { lines: lines.map((c) => ({ item: c.line.description, ordered: c.line.quantity, loaded: c.loadedQty, damaged: c.damagedQty })) },
        },
      })
      return { tripId: stop.tripId, lines }
    })

    const shortfall = {
      missing: counted.lines.map((c) => ({ orderLineId: c.line.id, units: c.line.quantity - c.loadedQty - c.damagedQty })).filter((l) => l.units > 0),
      damaged: counted.lines.map((c) => ({ orderLineId: c.line.id, units: c.damagedQty })).filter((l) => l.units > 0),
    }
    const issues: LoaderIssueResult["issues"] = []
    for (const kind of ["missing", "damaged"] as const) {
      if (!shortfall[kind].length) continue
      const r = await this.reportIssue(user, { clientId: `${input.clientId}:${kind}`, kind, tripId: counted.tripId, stopId, lines: shortfall[kind], notes: input.notes })
      issues.push(...r.issues)
    }

    let loadStatus: StopCountResult["stop"]["loadStatus"] = "PENDING"
    let breach: LoaderCapacityBreach | null = null
    if (counted.lines.some((c) => c.loadedQty > 0)) {
      try {
        loadStatus = (await this.confirmStop(user, stopId)).loadStatus
      } catch (err) {
        const body = err instanceof ConflictException ? err.getResponse() : null
        if (body && typeof body === "object" && "weight" in body) breach = body as LoaderCapacityBreach
        else throw err
      }
    }
    return { stop: { id: stopId, loadStatus }, issues, breach }
  }

  /** Issues the loader can read back (the confirmation screen): raised by them or on a trip at their depot. */
  async getIssues(user: SessionUser, ids: string[]): Promise<LoaderIssueDetail[]> {
    if (!ids.length) return []
    const rows = await this.db.issue.findMany({
      where: { id: { in: ids.slice(0, 50) }, OR: [{ reportedById: user.sub }, ...(user.depotId ? [{ trip: { plan: { depotId: user.depotId } } }] : [])] },
      orderBy: { ref: "asc" },
      select: {
        id: true,
        ref: true,
        type: true,
        severity: true,
        status: true,
        description: true,
        quantity: true,
        createdAt: true,
        resolution: true,
        resolvedAt: true,
        reportedBy: { select: { name: true } },
        trip: { select: { id: true, ref: true, vehicleId: true } },
        order: { select: { ref: true } },
        outlet: { select: { name: true } },
        orderLine: { select: { description: true } },
        chat: { select: { id: true } },
      },
    })
    return rows.map(({ chat, createdAt, resolvedAt, ...r }) => ({ ...r, createdAt: createdAt.toISOString(), resolvedAt: resolvedAt?.toISOString() ?? null, chatId: chat?.id ?? null }))
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

  @Get("issues")
  issues(@CurrentUser() user: SessionUser, @Query("ids") ids = "") {
    return this.loader.getIssues(user, ids.split(",").filter(Boolean))
  }

  @Post("stops/:stopId/lines/:lineId")
  markLine(
    @CurrentUser() user: SessionUser,
    @Param("stopId") stopId: string,
    @Param("lineId") lineId: string,
    @Body(new ZodPipe(stopLineSchema)) body: StopLineInput,
  ) {
    return this.loader.markLine(user, stopId, lineId, body)
  }

  @Post("stops/:stopId/count")
  count(@CurrentUser() user: SessionUser, @Param("stopId") stopId: string, @Body(new ZodPipe(stopCountSchema)) body: StopCountRequest) {
    return this.loader.countStop(user, stopId, body)
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
