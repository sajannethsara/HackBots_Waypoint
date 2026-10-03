import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  bodyPreview,
  canChat,
  ISSUE_TYPE_META,
  mentionToken,
  parseBody,
  type ChatContact,
  type ChatMessage,
  type ChatMessageEvent,
  type ChatPerson,
  type ConversationSummary,
  type IssueParticipant,
  type MentionOption,
  type MentionRef,
  type MentionType,
  type OpenConversationInput,
  type Role,
  type SendMessageInput,
} from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { ChatGateway } from "./chat.gateway"

const SYSTEM_EMAIL = "system@waypoint.lk"
const PAGE = 40
const MAX_MENTIONS = 10
/** Trips and orders this far either side of the operating day count as "current". */
const WINDOW_DAYS = 7
const HOME: Record<Role, string> = { DISPATCHER: "/dispatcher/inbox", LOADER: "/loader/inbox", DRIVER: "/driver", STORE_MANAGER: "/store" }

const personSelect = {
  id: true,
  name: true,
  role: true,
  phone: true,
  isActive: true,
  depotId: true,
  outletId: true,
  vehicleId: true,
  depot: { select: { name: true } },
  outlet: { select: { name: true, depotId: true } },
} satisfies Prisma.UserSelect
type Member = Prisma.UserGetPayload<{ select: typeof personSelect }>

const issueChipSelect = { id: true, ref: true, type: true, status: true, severity: true } satisfies Prisma.IssueSelect

const issueFullSelect = {
  ...issueChipSelect,
  stage: true,
  reportedById: true,
  reportedBy: { select: { role: true } },
  tripId: true,
  orderId: true,
  outletId: true,
  vehicleId: true,
  trip: { select: { ref: true, driverId: true, loadedById: true, plan: { select: { depotId: true } } } },
  order: { select: { outletId: true, depotId: true } },
  outlet: { select: { depotId: true } },
  vehicle: { select: { depotId: true } },
} satisfies Prisma.IssueSelect
type IssueFull = Prisma.IssueGetPayload<{ select: typeof issueFullSelect }>

const senderSelect = { select: { id: true, name: true, role: true } } as const

const summaryInclude = {
  member: { select: personSelect },
  issue: { select: issueChipSelect },
  messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, kind: true, createdAt: true, sender: { select: { role: true } } } },
} satisfies Prisma.ConversationInclude
type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof summaryInclude }>

interface Scope {
  issue: Prisma.IssueWhereInput
  trip: Prisma.TripWhereInput
  order: Prisma.OrderWhereInput
  outlet: Prisma.OutletWhereInput
  vehicle: Prisma.VehicleWhereInput
}

const person = (u: Member): ChatPerson => ({
  id: u.id,
  name: u.name,
  role: u.role,
  phone: u.phone,
  detail: u.role === "STORE_MANAGER" ? (u.outlet?.name ?? null) : u.role === "DRIVER" ? u.vehicleId : (u.depot?.name ?? null),
})

const memberDepot = (u: Member) => u.depotId ?? u.outlet?.depotId ?? null

@Injectable()
export class ChatService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
    private readonly gateway: ChatGateway,
  ) {}

  // ───────────────────────────── Conversations ─────────────────────────────

  async list(user: SessionUser, q: { scope?: string; q?: string }): Promise<ConversationSummary[]> {
    const where: Prisma.ConversationWhereInput = {
      AND: [
        this.mine(user),
        { lastMessageAt: { not: null } },
        q.scope === "issues" ? { kind: "ISSUE" } : {},
        q.scope === "unread" ? { [this.unreadField(user)]: { gt: 0 } } : {},
        q.q
          ? {
              OR: [
                { member: { name: { contains: q.q, mode: "insensitive" } } },
                { member: { outlet: { name: { contains: q.q, mode: "insensitive" } } } },
                { member: { vehicleId: { contains: q.q, mode: "insensitive" } } },
                { issue: { ref: { contains: q.q, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    }
    const rows = await this.db.conversation.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: 100, include: summaryInclude })
    return rows.map((r) => this.toSummary(user, r))
  }

  /** Total unread for the signed-in side: drives the sidebar badge. */
  async unread(user: SessionUser) {
    const field = this.unreadField(user)
    const rows = await this.db.conversation.findMany({
      where: { AND: [this.mine(user), { [field]: { gt: 0 } }] },
      select: { deskUnread: true, memberUnread: true },
    })
    return { unread: rows.reduce((n, r) => n + r[field], 0), conversations: rows.length }
  }

  /** Dispatcher: everyone reachable at the depot, with their direct thread when there is one. */
  async contacts(user: SessionUser, q: { q?: string; role?: string }): Promise<ChatContact[]> {
    const depotId = this.requireDesk(user)
    const reachable = ["LOADER", "DRIVER", "STORE_MANAGER"] as Role[]
    const roles = q.role ? reachable.filter((r) => r === q.role) : reachable
    const term = q.q?.trim()
    const contains = (v: string) => ({ contains: v, mode: "insensitive" as const })
    const users = await this.db.user.findMany({
      where: {
        isActive: true,
        email: { not: SYSTEM_EMAIL },
        role: { in: roles },
        AND: [
          { OR: [{ depotId }, { outlet: { depotId } }] },
          term ? { OR: [{ name: contains(term) }, { vehicleId: contains(term) }, { outletId: contains(term) }, { outlet: { name: contains(term) } }] } : {},
        ],
      },
      select: personSelect,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: 60,
    })
    const threads = await this.db.conversation.findMany({
      where: { depotId, kind: "DIRECT", memberId: { in: users.map((u) => u.id) } },
      select: { id: true, memberId: true, deskUnread: true, lastMessageAt: true },
    })
    const byMember = new Map(threads.map((t) => [t.memberId, t]))
    return users.map((u) => {
      const t = byMember.get(u.id)
      return { ...person(u), conversationId: t?.lastMessageAt ? t.id : null, unread: t?.deskUnread ?? 0 }
    })
  }

  /** Find or create the thread between the desk and a member (optionally about one issue). */
  async open(user: SessionUser, input: OpenConversationInput): Promise<ConversationSummary> {
    let member: Member
    let depotId: string
    if (user.role === "DISPATCHER") {
      depotId = this.requireDesk(user)
      if (!input.memberId) throw new BadRequestException("Choose who to message")
      member = await this.member(input.memberId)
      if (!canChat(user.role, member.role)) throw new ForbiddenException("You can't message that account")
      if (memberDepot(member) !== depotId) throw new ForbiddenException("That person works at another depot")
    } else {
      if (input.memberId && input.memberId !== user.sub) throw new ForbiddenException("You can only message the dispatch desk")
      member = await this.member(user.sub)
      const d = memberDepot(member)
      if (!d) throw new ForbiddenException("Your account is not linked to a depot")
      depotId = d
    }

    let issue: IssueFull | null = null
    if (input.issueId) {
      issue = await this.db.issue.findUnique({ where: { id: input.issueId }, select: issueFullSelect })
      if (!issue || this.issueDepot(issue) !== depotId) throw new NotFoundException("Issue not found")
      const involved = await this.participants(issue, depotId)
      if (!involved.some((p) => p.id === member.id)) throw new ForbiddenException("That person is not involved in this issue")
    }

    const key = `${member.id}:${issue?.id ?? "direct"}`
    let conv = await this.db.conversation.findUnique({ where: { key }, include: summaryInclude })
    if (!conv) {
      try {
        conv = await this.db.conversation.create({
          data: { key, kind: issue ? "ISSUE" : "DIRECT", depotId, memberId: member.id, issueId: issue?.id },
          include: summaryInclude,
        })
      } catch {
        conv = await this.db.conversation.findUnique({ where: { key }, include: summaryInclude }) // lost a creation race
        if (!conv) throw new BadRequestException("Could not open the conversation")
      }
    }
    return this.toSummary(user, conv)
  }

  async messages(user: SessionUser, id: string, q: { before?: string; limit?: number }) {
    const conv = await this.access(user, id)
    const take = Math.min(Math.max(q.limit ?? PAGE, 1), 100)
    const rows = await this.db.message.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(q.before ? { cursor: { id: q.before }, skip: 1 } : {}),
      include: { sender: senderSelect },
    })
    return {
      conversation: this.toSummary(user, conv),
      messages: rows.slice(0, take).reverse().map((m) => this.toMessage(m)),
      hasMore: rows.length > take,
    }
  }

  async send(user: SessionUser, id: string, input: SendMessageInput): Promise<ChatMessage> {
    const conv = await this.access(user, id)
    if (!conv.member.isActive) throw new BadRequestException("This account is no longer active")

    if (input.clientId) {
      const prior = await this.db.message.findUnique({ where: { clientId: input.clientId }, include: { sender: senderSelect } })
      if (prior && prior.conversationId === id && prior.senderId === user.sub) return this.toMessage(prior) // resend of a message already stored
    }

    const { body, mentions } = await this.resolveMentions(conv.member, conv.issue?.id ?? null, input.body)
    const fromDesk = user.role === "DISPATCHER"
    const memberAlreadyUnread = conv.memberUnread > 0

    const [message] = await this.db.$transaction([
      this.db.message.create({
        data: { conversationId: id, senderId: user.sub, body, mentions: mentions as unknown as Prisma.InputJsonValue, clientId: input.clientId },
        include: { sender: senderSelect },
      }),
      this.db.conversation.update({
        where: { id },
        // Replying implies the sender has read everything so far; the other side gets +1.
        data: { lastMessageAt: new Date(), ...(fromDesk ? { deskUnread: 0, memberUnread: { increment: 1 } } : { memberUnread: 0, deskUnread: { increment: 1 } }) },
      }),
    ])

    // One notification per unread burst, so a busy thread does not flood the member's feed.
    if (fromDesk && !memberAlreadyUnread) {
      await this.db.notification
        .create({
          data: {
            userId: conv.memberId,
            type: "CHAT_MESSAGE",
            title: conv.issue ? `Dispatcher · ${conv.issue.ref}` : `Dispatcher · ${user.name}`,
            body: bodyPreview(body).slice(0, 140),
            link: `${HOME[conv.member.role]}?c=${id}`,
          },
        })
        .catch(() => undefined)
    }

    const out = this.toMessage(message)
    this.gateway.publish(conv, "message", { conversationId: id, message: out } satisfies ChatMessageEvent)
    return out
  }

  async markRead(user: SessionUser, id: string) {
    const conv = await this.access(user, id)
    const field = this.unreadField(user)
    if (conv[field] === 0) return { ok: true }
    await this.db.conversation.update({ where: { id }, data: { [field]: 0 } })
    this.gateway.publish(conv, "read", { conversationId: id })
    return { ok: true }
  }

  /** Status updates posted into an issue's threads (acknowledged, resolved). Never fails the caller. */
  async postSystemForIssue(issueId: string, text: string) {
    try {
      const threads = await this.db.conversation.findMany({ where: { issueId, lastMessageAt: { not: null } }, select: { id: true, depotId: true, memberId: true } })
      for (const t of threads) {
        const [message] = await this.db.$transaction([
          this.db.message.create({ data: { conversationId: t.id, kind: "SYSTEM", body: text }, include: { sender: senderSelect } }),
          this.db.conversation.update({ where: { id: t.id }, data: { lastMessageAt: new Date() } }),
        ])
        this.gateway.publish(t, "message", { conversationId: t.id, message: this.toMessage(message) } satisfies ChatMessageEvent)
      }
    } catch {
      /* messaging must never block issue handling */
    }
  }

  // ───────────────────────────── Issue participants ─────────────────────────────

  /** The people an issue concerns: the buttons on the issue's Resolve panel. */
  async issueParticipants(user: SessionUser, issueId: string): Promise<IssueParticipant[]> {
    const depotId = this.requireDesk(user)
    const issue = await this.db.issue.findUnique({ where: { id: issueId }, select: issueFullSelect })
    if (!issue || this.issueDepot(issue) !== depotId) throw new NotFoundException("Issue not found")
    const people = await this.participants(issue, depotId)
    const threads = await this.db.conversation.findMany({
      where: { issueId, memberId: { in: people.map((p) => p.id) } },
      select: { memberId: true, id: true, deskUnread: true, lastMessageAt: true },
    })
    const byMember = new Map(threads.map((t) => [t.memberId, t]))
    return people.map((p) => {
      const t = byMember.get(p.id)
      return { ...p, conversationId: t?.lastMessageAt ? t.id : null, unread: t?.deskUnread ?? 0 }
    })
  }

  private async participants(issue: IssueFull, depotId: string): Promise<(ChatPerson & { relation: string })[]> {
    const found = new Map<string, ChatPerson & { relation: string }>()
    const add = (u: Member | null | undefined, relation: string) => {
      if (u && u.isActive && u.role !== "DISPATCHER" && !found.has(u.id)) found.set(u.id, { ...person(u), relation })
    }
    if (issue.reportedBy.role !== "DISPATCHER") add(await this.db.user.findUnique({ where: { id: issue.reportedById }, select: personSelect }), "Reported this issue")
    if (issue.trip?.driverId) add(await this.db.user.findUnique({ where: { id: issue.trip.driverId }, select: personSelect }), `Driver on ${issue.trip.ref}`)
    else if (issue.vehicleId) add(await this.db.user.findFirst({ where: { vehicleId: issue.vehicleId, isActive: true }, select: personSelect }), `Driver of ${issue.vehicleId}`)
    if (issue.trip?.loadedById) add(await this.db.user.findUnique({ where: { id: issue.trip.loadedById }, select: personSelect }), `Loaded ${issue.trip.ref}`)
    else if (issue.stage === "LOADING") {
      for (const l of await this.db.user.findMany({ where: { role: "LOADER", depotId, isActive: true }, select: personSelect, take: 3 })) add(l, "Loader at the depot")
    }
    const outletId = issue.outletId ?? issue.order?.outletId
    if (outletId) {
      for (const m of await this.db.user.findMany({ where: { role: "STORE_MANAGER", outletId, isActive: true }, select: personSelect, take: 3 }))
        add(m, `Store manager · ${m.outlet?.name ?? outletId}`)
    }
    return [...found.values()]
  }

  private issueDepot(i: IssueFull) {
    return i.trip?.plan.depotId ?? i.outlet?.depotId ?? i.order?.depotId ?? i.vehicle?.depotId ?? null
  }

  // ───────────────────────────── @mentions ─────────────────────────────

  /** Things worth mentioning in this thread: relevant to the member, never "everything". */
  async mentionOptions(user: SessionUser, q: { conversationId?: string; q?: string; type?: string }): Promise<MentionOption[]> {
    const { member, issueId } = await this.mentionContext(user, q.conversationId)
    return this.mentionOptionsFor(member, issueId, q)
  }

  /** Mentions inside an issue group chat: what the signed-in member may reference, plus the issue's own context. */
  async mentionOptionsForIssue(user: SessionUser, issueId: string, q: { q?: string; type?: string }): Promise<MentionOption[]> {
    return this.mentionOptionsFor(await this.member(user.sub), issueId, q)
  }

  /** Validate and canonicalise @mentions in an issue chat message. */
  async resolveMentionsForIssue(user: SessionUser, issueId: string, raw: string) {
    return this.resolveMentions(await this.member(user.sub), issueId, raw)
  }

  private async mentionOptionsFor(member: Member, issueId: string | null, q: { q?: string; type?: string }): Promise<MentionOption[]> {
    const scope = await this.scope(member, issueId)
    const term = q.q?.trim()
    const types = (q.type ? [q.type] : ["issue", "trip", "outlet", "vehicle", "order"]) as MentionType[]
    const contains = (v: string) => ({ contains: v, mode: "insensitive" as const })
    const take = types.length === 1 ? 8 : 4

    const jobs: Record<MentionType, () => Promise<MentionOption[]>> = {
      issue: async () =>
        (
          await this.db.issue.findMany({
            where: { AND: [scope.issue, term ? { OR: [{ ref: contains(term) }, { description: contains(term) }] } : {}] },
            select: { id: true, ref: true, type: true, status: true },
            orderBy: { createdAt: "desc" },
            take,
          })
        ).map((r) => ({ type: "issue" as const, id: r.id, label: r.ref, hint: `${ISSUE_TYPE_META[r.type].label} · ${r.status.toLowerCase()}` })),
      trip: async () =>
        (
          await this.db.trip.findMany({
            where: { AND: [scope.trip, term ? { OR: [{ ref: contains(term) }, { vehicleId: contains(term) }] } : {}] },
            select: { id: true, ref: true, vehicleId: true, districtId: true, status: true },
            orderBy: { ref: "asc" },
            take,
          })
        ).map((r) => ({ type: "trip" as const, id: r.id, label: r.ref, hint: `${r.vehicleId} · ${r.districtId} · ${r.status.toLowerCase()}` })),
      outlet: async () =>
        (
          await this.db.outlet.findMany({
            where: { AND: [scope.outlet, term ? { OR: [{ id: contains(term) }, { name: contains(term) }] } : {}] },
            select: { id: true, name: true, districtId: true },
            orderBy: { name: "asc" },
            take,
          })
        ).map((r) => ({ type: "outlet" as const, id: r.id, label: r.name, hint: `${r.id} · ${r.districtId}` })),
      vehicle: async () =>
        (
          await this.db.vehicle.findMany({
            where: { AND: [scope.vehicle, term ? { id: contains(term) } : {}] },
            select: { id: true, type: true, temp: true },
            orderBy: { id: "asc" },
            take,
          })
        ).map((r) => ({ type: "vehicle" as const, id: r.id, label: r.id, hint: `${r.type.toLowerCase()} · ${r.temp.toLowerCase()}` })),
      order: async () =>
        (
          await this.db.order.findMany({
            where: { AND: [scope.order, term ? { OR: [{ ref: contains(term) }, { outlet: { name: contains(term) } }] } : {}] },
            select: { id: true, ref: true, units: true, outlet: { select: { name: true } } },
            orderBy: { ref: "desc" },
            take,
          })
        ).map((r) => ({ type: "order" as const, id: r.id, label: r.ref, hint: `${r.outlet.name} · ${r.units} units` })),
    }
    return (await Promise.all(types.filter((t) => t in jobs).map((t) => jobs[t]()))).flat()
  }

  /** Reject mentions outside what this thread may reference; rewrite labels to the canonical ones. */
  private async resolveMentions(member: Member, issueId: string | null, raw: string) {
    const parts = parseBody(raw)
    const refs = parts.filter((p): p is MentionRef => typeof p !== "string")
    if (!refs.length) return { body: raw, mentions: [] as MentionRef[] }
    if (refs.length > MAX_MENTIONS) throw new BadRequestException(`Mention at most ${MAX_MENTIONS} items per message`)

    const scope = await this.scope(member, issueId)
    const ids = (t: MentionType) => [...new Set(refs.filter((r) => r.type === t).map((r) => r.id))]
    const [issues, trips, outlets, vehicles, orders] = await Promise.all([
      this.db.issue.findMany({ where: { AND: [scope.issue, { id: { in: ids("issue") } }] }, select: { id: true, ref: true } }),
      this.db.trip.findMany({ where: { AND: [scope.trip, { id: { in: ids("trip") } }] }, select: { id: true, ref: true } }),
      this.db.outlet.findMany({ where: { AND: [scope.outlet, { id: { in: ids("outlet") } }] }, select: { id: true, name: true } }),
      this.db.vehicle.findMany({ where: { AND: [scope.vehicle, { id: { in: ids("vehicle") } }] }, select: { id: true } }),
      this.db.order.findMany({ where: { AND: [scope.order, { id: { in: ids("order") } }] }, select: { id: true, ref: true } }),
    ])
    const label = new Map<string, string>([
      ...issues.map((r) => [`issue:${r.id}`, r.ref] as const),
      ...trips.map((r) => [`trip:${r.id}`, r.ref] as const),
      ...outlets.map((r) => [`outlet:${r.id}`, r.name] as const),
      ...vehicles.map((r) => [`vehicle:${r.id}`, r.id] as const),
      ...orders.map((r) => [`order:${r.id}`, r.ref] as const),
    ])
    const mentions = new Map<string, MentionRef>()
    const body = parts
      .map((p) => {
        if (typeof p === "string") return p
        const l = label.get(`${p.type}:${p.id}`)
        if (!l) throw new BadRequestException(`"${p.label}" isn't something you can mention in this conversation`)
        const ref: MentionRef = { type: p.type, id: p.id, label: l }
        mentions.set(`${p.type}:${p.id}`, ref)
        return mentionToken(ref)
      })
      .join("")
    return { body, mentions: [...mentions.values()] }
  }

  private async mentionContext(user: SessionUser, conversationId?: string) {
    if (conversationId) {
      const conv = await this.access(user, conversationId)
      return { member: conv.member, issueId: conv.issue?.id ?? null }
    }
    if (user.role === "DISPATCHER") throw new BadRequestException("Open a conversation first")
    return { member: await this.member(user.sub), issueId: null }
  }

  /** What is relevant to one member: their run, their store, or the depot's loading floor. */
  private async scope(m: Member, issueId: string | null): Promise<Scope> {
    const day = new Date(`${await this.clock.operatingDate()}T00:00:00Z`)
    const from = new Date(day.getTime() - WINDOW_DAYS * 86_400_000)
    const to = new Date(day.getTime() + WINDOW_DAYS * 86_400_000)
    const published: Prisma.TripWhereInput = { plan: { status: "PUBLISHED", date: { gte: from, lte: to } } }

    let trip: Prisma.TripWhereInput
    let order: Prisma.OrderWhereInput
    let outlet: Prisma.OutletWhereInput
    let vehicle: Prisma.VehicleWhereInput
    const issueOr: Prisma.IssueWhereInput[] = [{ reportedById: m.id }]

    if (m.role === "DRIVER") {
      trip = { AND: [published, { OR: [{ driverId: m.id }, { vehicleId: m.vehicleId ?? "-" }] }] }
      issueOr.push({ trip }, { vehicleId: m.vehicleId ?? "-" })
      vehicle = { id: m.vehicleId ?? "-" }
      order = { stops: { some: { trip } } }
      outlet = { orders: { some: { stops: { some: { trip } } } } }
    } else if (m.role === "STORE_MANAGER") {
      const outletId = m.outletId ?? "-"
      trip = { AND: [published, { stops: { some: { order: { outletId } } } }] }
      issueOr.push({ outletId }, { order: { outletId } })
      vehicle = { trips: { some: trip } }
      order = { outletId, deliveryDate: { gte: from, lte: to } }
      outlet = { id: outletId }
    } else {
      const depotId = m.depotId ?? "-"
      trip = { AND: [published, { plan: { depotId } }] }
      issueOr.push({ stage: "LOADING", trip: { plan: { depotId } } })
      vehicle = { trips: { some: trip } }
      order = { stops: { some: { trip } } }
      outlet = { orders: { some: { stops: { some: { trip } } } } }
    }

    // The issue a thread is about always brings its own context along.
    if (issueId) {
      const i = await this.db.issue.findUnique({ where: { id: issueId }, select: { id: true, tripId: true, orderId: true, outletId: true, vehicleId: true } })
      if (i) {
        issueOr.push({ id: i.id })
        if (i.tripId) trip = { OR: [trip, { id: i.tripId }] }
        if (i.orderId) order = { OR: [order, { id: i.orderId }] }
        if (i.outletId) outlet = { OR: [outlet, { id: i.outletId }] }
        if (i.vehicleId) vehicle = { OR: [vehicle, { id: i.vehicleId }] }
      }
    }
    return { issue: { OR: issueOr }, trip, order, outlet, vehicle }
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private requireDesk(user: SessionUser) {
    if (user.role !== "DISPATCHER" || !user.depotId) throw new ForbiddenException("Only a dispatcher can do this")
    return user.depotId
  }

  /** Which conversations the signed-in user may see: the depot's desk threads, or their own. */
  private mine(user: SessionUser): Prisma.ConversationWhereInput {
    if (user.role === "DISPATCHER") return { depotId: this.requireDesk(user) }
    return { memberId: user.sub }
  }

  private unreadField(user: SessionUser) {
    return user.role === "DISPATCHER" ? ("deskUnread" as const) : ("memberUnread" as const)
  }

  private async member(id: string) {
    const u = await this.db.user.findUnique({ where: { id }, select: personSelect })
    if (!u || !u.isActive) throw new NotFoundException("Account not found")
    return u
  }

  private async access(user: SessionUser, id: string) {
    const conv = await this.db.conversation.findFirst({ where: { AND: [{ id }, this.mine(user)] }, include: summaryInclude })
    if (!conv) throw new NotFoundException("Conversation not found") // also hides other people's threads
    return conv
  }

  private toSummary(user: SessionUser, c: ConversationRow): ConversationSummary {
    const last = c.messages[0]
    return {
      id: c.id,
      kind: c.kind,
      member: person(c.member),
      issue: c.issue,
      lastMessage: last ? { body: bodyPreview(last.body), at: last.createdAt.toISOString(), senderRole: last.sender?.role ?? null, kind: last.kind } : null,
      unread: user.role === "DISPATCHER" ? c.deskUnread : c.memberUnread,
      updatedAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
    }
  }

  private toMessage(m: {
    id: string
    conversationId: string
    kind: "TEXT" | "SYSTEM"
    senderId: string | null
    sender: { id: string; name: string; role: Role } | null
    body: string
    mentions: Prisma.JsonValue
    clientId: string | null
    createdAt: Date
  }): ChatMessage {
    return {
      id: m.id,
      conversationId: m.conversationId,
      kind: m.kind,
      senderId: m.senderId,
      sender: m.sender,
      body: m.body,
      mentions: (m.mentions as unknown as MentionRef[]) ?? [],
      clientId: m.clientId,
      createdAt: m.createdAt.toISOString(),
    }
  }
}
