import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  ISSUE_TYPE_META,
  type CreateIssueInput,
  type IssueSeverity,
  type IssueStage,
  type IssueType,
  type ResolveIssueInput,
} from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"
import { ChatService } from "../chat/chat.service"
import { IssueChatService } from "../issue-chat/issue-chat.module"

export const SYSTEM_EMAIL = "system@waypoint.lk"

const listInclude = {
  reportedBy: { select: { name: true, role: true } },
  resolvedBy: { select: { name: true } },
  trip: { select: { id: true, ref: true, vehicleId: true, brand: true, districtId: true } },
  stop: { select: { seq: true } },
  order: { select: { id: true, ref: true } },
  outlet: { select: { id: true, name: true, districtId: true } },
} satisfies Prisma.IssueInclude

export interface SystemIssue {
  clientId: string
  stage: IssueStage
  type: IssueType
  severity: IssueSeverity
  description: string
  tripId?: string
  stopId?: string
  orderId?: string
  outletId?: string
  vehicleId?: string
}

@Injectable()
export class IssuesService {
  private systemUserId?: string
  private refLock: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly db: PrismaService,
    private readonly chat: ChatService,
    private readonly issueChat: IssueChatService,
  ) {}

  /** Issues that belong to a depot: via the trip's plan, the outlet or the vehicle. */
  private depotScope(depotId: string): Prisma.IssueWhereInput {
    return { OR: [{ trip: { plan: { depotId } } }, { outlet: { depotId } }, { vehicle: { depotId } }] }
  }

  async list(q: { depotId: string; status?: string; stage?: string; severity?: string; tripId?: string; q?: string }) {
    const where: Prisma.IssueWhereInput = {
      AND: [
        this.depotScope(q.depotId),
        q.status ? { status: q.status as Prisma.EnumIssueStatusFilter["equals"] } : {},
        q.stage ? { stage: q.stage as Prisma.EnumIssueStageFilter["equals"] } : {},
        q.severity ? { severity: q.severity as Prisma.EnumIssueSeverityFilter["equals"] } : {},
        q.tripId ? { tripId: q.tripId } : {},
        q.q
          ? {
              OR: [
                { ref: { contains: q.q, mode: "insensitive" } },
                { description: { contains: q.q, mode: "insensitive" } },
                { outletId: { contains: q.q, mode: "insensitive" } },
                { vehicleId: { contains: q.q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    }
    const [issues, counts] = await Promise.all([
      this.db.issue.findMany({ where, include: listInclude, orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }] }),
      this.db.issue.groupBy({ by: ["status", "severity"], where: this.depotScope(q.depotId), _count: true }),
    ])
    const n = (f: (c: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((s, c) => s + c._count, 0)
    return {
      issues,
      counts: {
        open: n((c) => c.status === "OPEN"),
        acknowledged: n((c) => c.status === "ACKNOWLEDGED"),
        resolved: n((c) => c.status === "RESOLVED"),
        highOpen: n((c) => c.status !== "RESOLVED" && c.severity === "HIGH"),
        all: n(() => true),
      },
    }
  }

  async summary(depotId: string) {
    const open = await this.db.issue.count({ where: { AND: [this.depotScope(depotId), { status: { not: "RESOLVED" } }] } })
    return { open }
  }

  async get(id: string) {
    const issue = await this.db.issue.findUnique({
      where: { id },
      include: {
        ...listInclude,
        reportedBy: { select: { name: true, role: true, phone: true, email: true } },
        trip: {
          select: {
            id: true,
            ref: true,
            vehicleId: true,
            brand: true,
            districtId: true,
            status: true,
            plannedDepartMin: true,
            driver: { select: { name: true, phone: true } },
            plan: { select: { version: true, status: true, date: true } },
          },
        },
        stop: { select: { seq: true, plannedArrivalMin: true, status: true } },
        order: { select: { id: true, ref: true, temp: true, units: true, weightKg: true, volumeM3: true, lines: true } },
        orderLine: true,
        carryOverOrder: {
          select: {
            id: true,
            ref: true,
            status: true,
            deliveryDate: true,
            units: true,
            weightKg: true,
            lines: { select: { id: true, description: true, quantity: true } },
            carryOverIssues: { select: { id: true, ref: true } },
            // Newest plan first: the trip that will carry it, once planned.
            stops: { orderBy: { trip: { plan: { version: "desc" } } }, take: 1, select: { seq: true, trip: { select: { id: true, ref: true, plan: { select: { status: true } } } } } },
          },
        },
        outlet: { select: { id: true, name: true, districtId: true, windowOpenMin: true, windowCloseMin: true, managers: { select: { name: true, phone: true } } } },
        vehicle: { select: { id: true, type: true, temp: true, status: true } },
      },
    })
    if (!issue) throw new NotFoundException("Issue not found")
    const history = await this.db.auditLog.findMany({
      where: { entityType: "Issue", entityId: id },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { name: true } } },
    })
    return { ...issue, history, playbook: ISSUE_TYPE_META[issue.type].playbook }
  }

  async create(user: SessionUser, input: CreateIssueInput) {
    if (input.clientId) {
      const existing = await this.db.issue.findUnique({ where: { clientId: input.clientId } })
      if (existing) return existing // idempotent replay from offline devices
    }
    const issue = await this.withRefs(1, async ([ref]) => {
      const trip = input.tripId ? await this.db.trip.findUnique({ where: { id: input.tripId }, select: { vehicleId: true } }) : null
      return this.db.issue.create({
        data: { ...input, ref, vehicleId: input.vehicleId ?? trip?.vehicleId, reportedById: user.sub },
      })
    })
    void this.issueChat.ensure(issue.id).catch(() => undefined) // everyone the issue affects joins its group chat
    await this.db.auditLog.create({
      data: { actorId: user.sub, action: "ISSUE_REPORTED", entityType: "Issue", entityId: issue.id, after: { type: issue.type, severity: issue.severity } },
    })
    return issue
  }

  async acknowledge(user: SessionUser, id: string) {
    const issue = await this.require(id)
    if (issue.status !== "OPEN") throw new ConflictException("Only open issues can be acknowledged")
    await this.db.$transaction([
      this.db.issue.update({ where: { id }, data: { status: "ACKNOWLEDGED" } }),
      this.db.auditLog.create({ data: { actorId: user.sub, action: "ISSUE_ACKNOWLEDGED", entityType: "Issue", entityId: id } }),
    ])
    void this.chat.postSystemForIssue(id, `${issue.ref} acknowledged by dispatch — someone is on it.`)
    void this.issueChat.systemNote(id, `Dispatch acknowledged ${issue.ref}: someone is on it.`)
    return this.get(id)
  }

  /** Resolve with playbook actions; notification effects are carried out here. */
  async resolve(user: SessionUser, id: string, input: ResolveIssueInput) {
    const issue = await this.db.issue.findUnique({
      where: { id },
      include: { outlet: { select: { managers: { select: { id: true } } } }, trip: { select: { driverId: true, ref: true } }, order: { select: { outletId: true } } },
    })
    if (!issue) throw new NotFoundException("Issue not found")
    if (issue.status === "RESOLVED") throw new ConflictException("Issue is already resolved")

    const playbook = ISSUE_TYPE_META[issue.type].playbook.filter((a) => input.actions.includes(a.id))
    const notes: Prisma.NotificationCreateManyInput[] = []
    if (playbook.some((a) => a.effect === "NOTIFY_STORE")) {
      const outletId = issue.outletId ?? issue.order?.outletId
      const managers = outletId ? await this.db.user.findMany({ where: { role: "STORE_MANAGER", outletId }, select: { id: true } }) : []
      for (const m of managers)
        notes.push({ userId: m.id, type: "ISSUE_UPDATE", title: `${issue.ref}: ${ISSUE_TYPE_META[issue.type].label}`, body: input.resolution, link: `/store-manager/issues/${issue.id}` })
    }
    if (playbook.some((a) => a.effect === "NOTIFY_DRIVER") && issue.trip?.driverId)
      notes.push({ userId: issue.trip.driverId, type: "DISPATCH_MESSAGE", title: `Dispatcher · ${issue.trip.ref}`, body: input.resolution, link: "/driver" })

    await this.db.$transaction([
      this.db.issue.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolvedById: user.sub,
          resolvedAt: new Date(),
          resolution: [playbook.map((a) => a.label).join(" · "), input.resolution].filter(Boolean).join(" — "),
        },
      }),
      this.db.notification.createMany({ data: notes }),
      this.db.auditLog.create({
        data: {
          actorId: user.sub,
          action: "ISSUE_RESOLVED",
          entityType: "Issue",
          entityId: id,
          after: { actions: playbook.map((a) => a.label), notified: notes.length, resolution: input.resolution },
        },
      }),
    ])
    void this.chat.postSystemForIssue(id, `${issue.ref} resolved: ${input.resolution}`)
    void this.issueChat.closeForResolution(id, user, input.resolution)
    return this.get(id)
  }

  /** Issues raised by the system itself (live monitoring). Idempotent on clientId. */
  async raiseSystem(items: SystemIssue[]) {
    if (!items.length) return 0
    const existing = new Set(
      (await this.db.issue.findMany({ where: { clientId: { in: items.map((i) => i.clientId) } }, select: { clientId: true } })).map((i) => i.clientId),
    )
    const fresh = items.filter((i) => !existing.has(i.clientId))
    if (!fresh.length) return 0
    const reportedById = await this.systemUser()
    await this.withRefs(fresh.length, (refs) =>
      this.db.issue.createMany({ data: fresh.map((i, k) => ({ ...i, ref: refs[k], reportedById })), skipDuplicates: true }),
    )
    return fresh.length
  }

  async clearSystem(prefix: string) {
    await this.db.issue.deleteMany({ where: { clientId: { startsWith: prefix } } })
  }

  private async require(id: string) {
    const issue = await this.db.issue.findUnique({ where: { id } })
    if (!issue) throw new NotFoundException("Issue not found")
    return issue
  }

  private async systemUser() {
    if (!this.systemUserId) this.systemUserId = (await this.db.user.findUniqueOrThrow({ where: { email: SYSTEM_EMAIL } })).id
    return this.systemUserId
  }

  /** Sequential human refs (ISS-0001…). Serialised so concurrent writers never collide. */
  private withRefs<T>(n: number, fn: (refs: string[]) => Promise<T>): Promise<T> {
    const run = this.refLock.then(async () => {
      const last = await this.db.issue.findFirst({ orderBy: { ref: "desc" }, select: { ref: true } })
      const start = last ? Number(last.ref.replace(/\D/g, "")) + 1 : 1
      return fn(Array.from({ length: n }, (_, i) => `ISS-${String(start + i).padStart(4, "0")}`))
    })
    this.refLock = run.catch(() => undefined)
    return run
  }
}
