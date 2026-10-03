import { BadRequestException, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, Param, Post, Query } from "@nestjs/common"
import { Prisma } from "@waypoint/db"
import { dateOnly } from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { IssueChatModule, IssueChatService } from "../issue-chat/issue-chat.module"
import { IssuesModule } from "../issues/issues.module"
import { IssuesService } from "../issues/issues.service"

const QUEUE_FILTERS = ["unclaimed", "mine", "flagged"] as const
export type LoaderQueueFilter = (typeof QUEUE_FILTERS)[number]
const isQueueFilter = (f: string): f is LoaderQueueFilter => (QUEUE_FILTERS as readonly string[]).includes(f)

/** An open problem raised while loading. */
const OPEN_LOADING_ISSUE: Prisma.IssueWhereInput = { stage: "LOADING", status: { not: "RESOLVED" } }

const queueInclude = {
  vehicle: true,
  district: true,
  claimedBy: { select: { id: true, name: true } },
  issues: { where: OPEN_LOADING_ISSUE, orderBy: { createdAt: "desc" }, select: { id: true, ref: true, type: true, severity: true, status: true, description: true } },
  stops: {
    orderBy: { seq: "asc" },
    include: { order: { include: { lines: true, outlet: { select: { id: true, name: true, districtId: true } } } } },
  },
} satisfies Prisma.TripInclude

@Injectable()
export class LoaderService {
  constructor(
    private readonly db: PrismaService,
    private readonly calendar: ClockService,
    private readonly issues: IssuesService,
    private readonly issueChat: IssueChatService,
  ) {}

  /** The loading bay's trips for today's published plan at the loader's depot. */
  async getQueue(user: SessionUser, filter: LoaderQueueFilter) {
    if (!user.depotId) return []
    const date = await this.calendar.operatingDate()
    const plan = await this.db.plan.findFirst({
      where: { depotId: user.depotId, date: dateOnly(date), status: "PUBLISHED" },
      orderBy: { version: "desc" },
      select: { id: true },
    })
    if (!plan) return []

    const byFilter: Record<LoaderQueueFilter, Prisma.TripWhereInput> = {
      unclaimed: { status: "PLANNED" },
      mine: { claimedById: user.sub },
      flagged: { issues: { some: OPEN_LOADING_ISSUE } },
    }
    return this.db.trip.findMany({
      where: { planId: plan.id, stops: { some: {} }, ...byFilter[filter] },
      orderBy: [{ plannedDepartMin: "asc" }, { ref: "asc" }],
      include: queueInclude,
    })
  }

  /**
   * Take a trip for loading. One conditional write, so two loaders racing for the
   * same trip cannot both win: the loser matches zero rows.
   */
  async claimTrip(user: SessionUser, tripId: string) {
    if (!user.depotId) throw new ForbiddenException("You are not assigned to a depot")
    const result = await this.db.trip.updateMany({
      where: { id: tripId, claimedById: null, status: "PLANNED", plan: { depotId: user.depotId } },
      data: { claimedById: user.sub, claimedAt: new Date(), status: "LOADING" },
    })
    if (result.count === 0) throw new ConflictException("Trip is already claimed or not available")
    return this.db.trip.findUnique({ where: { id: tripId }, include: queueInclude })
  }

  /** Hand a claimed trip back to the queue. Only the loader holding it can. */
  async releaseTrip(user: SessionUser, tripId: string) {
    const result = await this.db.trip.updateMany({
      where: { id: tripId, claimedById: user.sub, status: "LOADING" },
      data: { claimedById: null, claimedAt: null, status: "PLANNED" },
    })
    if (result.count === 0) throw new ForbiddenException("You do not have this trip claimed")
    return this.db.trip.findUnique({ where: { id: tripId }, include: queueInclude })
  }
}

@Roles("LOADER")
@Controller("loader")
export class LoaderController {
  constructor(private readonly loader: LoaderService) {}

  @Get("trips")
  trips(@CurrentUser() user: SessionUser, @Query("filter") filter = "unclaimed") {
    if (!isQueueFilter(filter)) throw new BadRequestException(`filter must be one of: ${QUEUE_FILTERS.join(", ")}`)
    return this.loader.getQueue(user, filter)
  }

  @Post("trips/:tripId/claim")
  claim(@CurrentUser() user: SessionUser, @Param("tripId") tripId: string) {
    return this.loader.claimTrip(user, tripId)
  }

  @Post("trips/:tripId/release")
  release(@CurrentUser() user: SessionUser, @Param("tripId") tripId: string) {
    return this.loader.releaseTrip(user, tripId)
  }
}

@Module({ imports: [IssuesModule, IssueChatModule], controllers: [LoaderController], providers: [LoaderService] })
export class LoaderModule {}
