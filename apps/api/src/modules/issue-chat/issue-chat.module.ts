import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from "@nestjs/common"
import { Prisma } from "@waypoint/db"
import {
  bodyPreview,
  canPostIssueChat,
  ISSUE_TYPE_META,
  issueChatInviteSchema,
  issueChatMessageSchema,
  ROLE_LABEL,
  type IssueChatCandidate,
  type IssueChatInviteInput,
  type IssueChatDetail,
  type IssueChatMemberInfo,
  type IssueChatMessageDto,
  type IssueChatMessageEvent,
  type IssueChatMessageInput,
  type IssueChatSummary,
  type Role,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"
import { ChatGateway } from "../chat/chat.gateway"
import { ChatModule } from "../chat/chat.module"
import { ChatService } from "../chat/chat.service"

const PAGE = 50
const HOME: Record<Role, string> = { DISPATCHER: "/dispatcher/issues", LOADER: "/loader", DRIVER: "/driver", STORE_MANAGER: "/store-manager/inbox" }

const personSelect = { id: true, name: true, role: true, isActive: true, vehicleId: true, outlet: { select: { name: true } } } satisfies Prisma.UserSelect

const issueSelect = {
  id: true,
  ref: true,
  type: true,
  status: true,
  severity: true,
  description: true,
  stage: true,
  createdAt: true,
  reportedById: true,
  reportedBy: { select: { role: true, name: true } },
  tripId: true,
  outletId: true,
  vehicleId: true,
  trip: { select: { ref: true, driverId: true, loadedById: true, plan: { select: { depotId: true } } } },
  order: { select: { outletId: true, depotId: true, outlet: { select: { name: true } } } },
  outlet: { select: { name: true, depotId: true } },
  vehicle: { select: { depotId: true } },
} satisfies Prisma.IssueSelect
type IssueRow = Prisma.IssueGetPayload<{ select: typeof issueSelect }>

const summaryInclude = (userId: string) =>
  ({
    issue: { select: issueSelect },
    _count: { select: { members: true } },
    members: { where: { userId }, select: { unread: true } },
    messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, kind: true, createdAt: true, sender: { select: { name: true } } } },
  }) satisfies Prisma.IssueChatInclude
type ChatRow = Prisma.IssueChatGetPayload<{ include: ReturnType<typeof summaryInclude> }>

const senderSelect = { select: { id: true, name: true, role: true } } as const

const issueDepot = (i: IssueRow) => i.trip?.plan.depotId ?? i.outlet?.depotId ?? i.order?.depotId ?? i.vehicle?.depotId ?? null

@Injectable()
export class IssueChatService {
  constructor(
    private readonly db: PrismaService,
    private readonly gateway: ChatGateway,
    private readonly chatService: ChatService,
  ) {}

  // ───────────────────────────── Creating the room ─────────────────────────────

  /**
   * Make sure an issue has its group chat and that everyone it affects is in it. Safe to call
   * repeatedly. `notify` tells the new members (skipped for machine-raised issues, which would flood).
   */
  async ensure(issueId: string, opts: { notify?: boolean } = {}): Promise<string | null> {
    const issue = await this.db.issue.findUnique({ where: { id: issueId }, select: issueSelect })
    if (!issue) return null
    const depotId = issueDepot(issue)
    if (!depotId) return null
    const people = await this.people(issue, depotId)

    let chat = await this.db.issueChat.findUnique({ where: { issueId }, include: { members: { select: { userId: true } } } })
    if (!chat) {
      try {
        chat = await this.db.issueChat.create({
          data: {
            issueId,
            depotId,
            lastMessageAt: new Date(),
            members: { create: people.map((p) => ({ userId: p.id, relation: p.relation })) },
            messages: { create: { kind: "SYSTEM", body: this.opening(issue, people) } },
          },
          include: { members: { select: { userId: true } } },
        })
        if (opts.notify !== false && people.length)
          await this.db.notification
            .createMany({
              data: people
                .filter((p) => p.id !== issue.reportedById)
                .map((p) => ({ userId: p.id, type: "ISSUE_CHAT", title: `${issue.ref}: you are in the issue chat`, body: issue.description.slice(0, 140), link: HOME[p.role] })),
            })
            .catch(() => undefined)
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e
        chat = await this.db.issueChat.findUniqueOrThrow({ where: { issueId }, include: { members: { select: { userId: true } } } })
      }
    } else {
      const have = new Set(chat.members.map((m) => m.userId))
      const add = people.filter((p) => !have.has(p.id))
      if (add.length) await this.db.issueChatMember.createMany({ data: add.map((p) => ({ chatId: chat!.id, userId: p.id, relation: p.relation })), skipDuplicates: true })
    }
    return chat.id
  }

  private opening(issue: IssueRow, people: IssueChatMemberInfo[]) {
    const by = issue.reportedBy.name
    const names = people.length ? people.map((p) => p.name).join(", ") : "nobody yet"
    return `${issue.ref} · ${ISSUE_TYPE_META[issue.type].label}, reported by ${by}. This chat is for everyone it affects: ${names}. Dispatch updates the issue status here.`
  }

  /** The people an issue affects, never dispatchers. */
  private async people(issue: IssueRow, depotId: string): Promise<IssueChatMemberInfo[]> {
    const found = new Map<string, IssueChatMemberInfo>()
    const add = (u: { id: string; name: string; role: Role; isActive: boolean } | null | undefined, relation: string) => {
      if (u && u.isActive && u.role !== "DISPATCHER" && !found.has(u.id)) found.set(u.id, { id: u.id, name: u.name, role: u.role, relation })
    }
    if (issue.reportedBy.role !== "DISPATCHER") add(await this.db.user.findUnique({ where: { id: issue.reportedById }, select: personSelect }), "Reported this issue")
    if (issue.trip?.driverId) add(await this.db.user.findUnique({ where: { id: issue.trip.driverId }, select: personSelect }), `Driver on ${issue.trip.ref}`)
    else if (issue.vehicleId) add(await this.db.user.findFirst({ where: { vehicleId: issue.vehicleId, isActive: true }, select: personSelect }), `Driver of ${issue.vehicleId}`)
    if (issue.trip?.loadedById) add(await this.db.user.findUnique({ where: { id: issue.trip.loadedById }, select: personSelect }), `Loaded ${issue.trip.ref}`)
    else if (issue.stage === "LOADING" || issue.type === "LOAD_MISSING" || issue.type === "LOAD_DAMAGED")
      for (const l of await this.db.user.findMany({ where: { role: "LOADER", depotId, isActive: true }, select: personSelect, take: 3 })) add(l, "Loader at the depot")
    const outletId = issue.outletId ?? issue.order?.outletId
    if (outletId)
      for (const m of await this.db.user.findMany({ where: { role: "STORE_MANAGER", outletId, isActive: true }, select: personSelect, take: 3 }))
        add(m, `Store manager · ${m.outlet?.name ?? outletId}`)
    return [...found.values()]
  }

  // ───────────────────────────── Reading ─────────────────────────────

  /**
   * Issues raised before group chats existed (or by live monitoring) have no room yet. The dispatcher's
   * inbox should list every open issue, so give those their chat, quietly. At most once a minute per depot.
   */
  private lastBackfill = new Map<string, number>()
  private async backfill(depotId: string) {
    if (Date.now() - (this.lastBackfill.get(depotId) ?? 0) < 60_000) return
    this.lastBackfill.set(depotId, Date.now())
    const missing = await this.db.issue.findMany({
      where: { status: { not: "RESOLVED" }, chat: null, OR: [{ trip: { plan: { depotId } } }, { outlet: { depotId } }, { vehicle: { depotId } }, { order: { depotId } }] },
      select: { id: true },
      take: 50,
    })
    for (const i of missing) await this.ensure(i.id, { notify: false }).catch(() => undefined)
  }

  async list(user: SessionUser, q: { status?: string; depotId?: string }): Promise<IssueChatSummary[]> {
    const depotId = q.depotId || user.depotId
    if (user.role === "DISPATCHER" && depotId) await this.backfill(depotId)
    const where: Prisma.IssueChatWhereInput = {
      AND: [
        user.role === "DISPATCHER" ? { depotId: depotId ?? "-" } : { members: { some: { userId: user.sub } } },
        q.status === "closed" ? { closedAt: { not: null } } : q.status === "all" ? {} : { closedAt: null },
      ],
    }
    const rows = await this.db.issueChat.findMany({ where, orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }], take: 100, include: summaryInclude(user.sub) })
    return rows.map((r) => this.toSummary(user, r))
  }

  /** Open an issue's chat (creating it for older issues), as dispatcher or member. */
  async byIssue(user: SessionUser, issueId: string) {
    await this.ensure(issueId, { notify: false })
    const chat = await this.db.issueChat.findUnique({ where: { issueId }, select: { id: true } })
    if (!chat) throw new NotFoundException("Issue not found")
    return this.detail(user, chat.id, {})
  }

  async detail(user: SessionUser, chatId: string, q: { before?: string }): Promise<IssueChatDetail> {
    const chat = await this.access(user, chatId)
    const rows = await this.db.issueChatMessage.findMany({
      where: { chatId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(q.before ? { cursor: { id: q.before }, skip: 1 } : {}),
      include: { sender: senderSelect },
    })
    const members = await this.db.issueChatMember.findMany({ where: { chatId }, include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { joinedAt: "asc" } })
    return {
      chat: {
        ...this.toSummary(user, chat),
        closedAt: chat.closedAt?.toISOString() ?? null,
        members: members.map((m) => ({ id: m.user.id, name: m.user.name, role: m.user.role, relation: m.relation })),
      },
      messages: rows.slice(0, PAGE).reverse().map((m) => this.toMessage(m)),
      hasMore: rows.length > PAGE,
      canPost: canPostIssueChat(user.role) && !chat.closedAt,
    }
  }

  // ───────────────────────────── Writing ─────────────────────────────

  async send(user: SessionUser, chatId: string, input: IssueChatMessageInput): Promise<IssueChatMessageDto> {
    if (!canPostIssueChat(user.role)) throw new ForbiddenException("You cannot post in this chat")
    const chat = await this.access(user, chatId)
    if (chat.closedAt) throw new ConflictException("This chat is closed")

    if (input.clientId) {
      const prior = await this.db.issueChatMessage.findUnique({ where: { clientId: input.clientId }, include: { sender: senderSelect } })
      if (prior && prior.chatId === chatId && prior.senderId === user.sub) return this.toMessage(prior) // resend of a stored message
    }
    // @mentions are checked against what this member may reference, and stored in canonical form.
    const { body } = await this.chatService.resolveMentionsForIssue(user, chat.issue.id, input.body)
    const [message] = await this.db.$transaction([
      this.db.issueChatMessage.create({ data: { chatId, senderId: user.sub, body, clientId: input.clientId }, include: { sender: senderSelect } }),
      this.db.issueChat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } }),
      this.db.issueChatMember.updateMany({ where: { chatId, userId: { not: user.sub } }, data: { unread: { increment: 1 } } }),
      this.db.issueChatMember.updateMany({ where: { chatId, userId: user.sub }, data: { unread: 0 } }),
    ])
    return this.publish(chat, message)
  }

  async mentionOptions(user: SessionUser, chatId: string, q: { q?: string; type?: string }) {
    const chat = await this.access(user, chatId)
    return this.chatService.mentionOptionsForIssue(user, chat.issue.id, q)
  }

  async markRead(user: SessionUser, chatId: string) {
    await this.access(user, chatId)
    if (user.role !== "DISPATCHER") await this.db.issueChatMember.updateMany({ where: { chatId, userId: user.sub, unread: { gt: 0 } }, data: { unread: 0 } })
    return { ok: true }
  }

  /** Dispatch closes (or reopens) the chat. Members can still read it. */
  async setClosed(user: SessionUser, chatId: string, closed: boolean) {
    const chat = await this.access(user, chatId)
    if (user.role !== "DISPATCHER") throw new ForbiddenException("Only dispatch can close an issue chat")
    if (!closed && chat.issue.status === "RESOLVED") throw new ConflictException("A resolved issue keeps its chat closed")
    if (!!chat.closedAt === closed) return this.detail(user, chatId, {})
    const message = await this.db.$transaction(async (tx) => {
      await tx.issueChat.update({ where: { id: chatId }, data: { closedAt: closed ? new Date() : null, closedById: closed ? user.sub : null, lastMessageAt: new Date() } })
      return tx.issueChatMessage.create({
        data: { chatId, kind: "SYSTEM", body: closed ? `${user.name} (dispatch) closed this chat. Open the issue for updates.` : `${user.name} (dispatch) reopened this chat.` },
        include: { sender: senderSelect },
      })
    })
    this.publish(chat, message)
    return this.detail(user, chatId, {})
  }

  /** Status changes posted into the room (acknowledged, resolved). Never fails the caller. */
  async systemNote(issueId: string, text: string) {
    try {
      const chat = await this.db.issueChat.findUnique({ where: { issueId }, select: { id: true, depotId: true, members: { select: { userId: true } } } })
      if (!chat) return
      const [message] = await this.db.$transaction([
        this.db.issueChatMessage.create({ data: { chatId: chat.id, kind: "SYSTEM", body: text }, include: { sender: senderSelect } }),
        this.db.issueChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } }),
        this.db.issueChatMember.updateMany({ where: { chatId: chat.id }, data: { unread: { increment: 1 } } }),
      ])
      this.publish(chat, message)
    } catch {
      /* messaging must never block issue handling */
    }
  }

  // ───────────────────────────── Dispatcher: bring more people in ─────────────────────────────

  /** Who dispatch can still add: the rest of the trip crew and the stores it is serving. */
  async candidates(user: SessionUser, chatId: string): Promise<IssueChatCandidate[]> {
    if (user.role !== "DISPATCHER") throw new ForbiddenException("Only dispatch can invite people")
    const chat = await this.access(user, chatId)
    const [members, issue] = await Promise.all([
      this.db.issueChatMember.findMany({ where: { chatId }, select: { userId: true } }),
      this.db.issue.findUniqueOrThrow({
        where: { id: chat.issue.id },
        select: {
          vehicleId: true,
          outletId: true,
          order: { select: { outletId: true } },
          trip: { select: { ref: true, driverId: true, loadedById: true, stops: { orderBy: { seq: "asc" }, select: { seq: true, order: { select: { outletId: true, outlet: { select: { name: true } } } } } } } },
        },
      }),
    ])
    const inChat = new Set(members.map((m) => m.userId))
    const found = new Map<string, IssueChatCandidate>()
    const add = (u: { id: string; name: string; role: Role; isActive: boolean } | null | undefined, relation: string) => {
      if (u && u.isActive && u.role !== "DISPATCHER" && !inChat.has(u.id) && !found.has(u.id)) found.set(u.id, { id: u.id, name: u.name, role: u.role, relation })
    }
    const tripRef = issue.trip?.ref
    if (issue.trip?.driverId) add(await this.db.user.findUnique({ where: { id: issue.trip.driverId }, select: personSelect }), `Driver on ${tripRef}`)
    else if (issue.vehicleId) add(await this.db.user.findFirst({ where: { vehicleId: issue.vehicleId, isActive: true }, select: personSelect }), `Driver of ${issue.vehicleId}`)
    if (issue.trip?.loadedById) add(await this.db.user.findUnique({ where: { id: issue.trip.loadedById }, select: personSelect }), `Loaded ${tripRef}`)
    for (const l of await this.db.user.findMany({ where: { role: "LOADER", depotId: chat.depotId, isActive: true }, select: personSelect, take: 5 })) add(l, "Loader at the depot")

    // Every store on the trip, with where it falls in the run.
    const stores = new Map<string, string>()
    for (const st of issue.trip?.stops ?? []) if (!stores.has(st.order.outletId)) stores.set(st.order.outletId, `${st.order.outlet.name} (stop ${st.seq}${tripRef ? ` on ${tripRef}` : ""})`)
    for (const id of [issue.outletId, issue.order?.outletId]) if (id && !stores.has(id)) stores.set(id, id)
    if (stores.size) {
      const managers = await this.db.user.findMany({ where: { role: "STORE_MANAGER", outletId: { in: [...stores.keys()] }, isActive: true }, select: { ...personSelect, outletId: true }, orderBy: { name: "asc" } })
      for (const m of managers) add(m, `Store manager · ${stores.get(m.outletId!) ?? m.outlet?.name ?? m.outletId}`)
    }
    return [...found.values()]
  }

  async invite(user: SessionUser, chatId: string, input: IssueChatInviteInput): Promise<IssueChatDetail> {
    const chat = await this.access(user, chatId)
    if (user.role !== "DISPATCHER") throw new ForbiddenException("Only dispatch can invite people")
    if (chat.closedAt) throw new ConflictException("Reopen the chat to add people")
    const person = (await this.candidates(user, chatId)).find((c) => c.id === input.userId)
    if (!person) throw new ForbiddenException("That person is not connected to this issue's trip, or is already in the chat")
    const message = await this.db.$transaction(async (tx) => {
      await tx.issueChatMember.create({ data: { chatId, userId: person.id, relation: `Invited · ${person.relation}`, unread: 1 } })
      await tx.issueChat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } })
      return tx.issueChatMessage.create({
        data: { chatId, kind: "SYSTEM", body: `${person.name} (${ROLE_LABEL[person.role]}) was added to this chat by ${user.name} (dispatch).` },
        include: { sender: senderSelect },
      })
    })
    await this.db.notification
      .create({ data: { userId: person.id, type: "ISSUE_CHAT", title: `${chat.issue.ref}: dispatch added you to the issue chat`, body: chat.issue.description.slice(0, 140), link: HOME[person.role] } })
      .catch(() => undefined)
    this.publish(chat, message)
    return this.detail(user, chatId, {})
  }

  /** Dispatch can take back an invitation (people the issue itself brings in stay). */
  async removeInvited(user: SessionUser, chatId: string, userId: string): Promise<IssueChatDetail> {
    const chat = await this.access(user, chatId)
    if (user.role !== "DISPATCHER") throw new ForbiddenException("Only dispatch can remove people")
    const member = await this.db.issueChatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, include: { user: { select: { name: true } } } })
    if (!member) throw new NotFoundException("They are not in this chat")
    if (!member.relation.startsWith("Invited")) throw new ForbiddenException("Only people dispatch invited can be removed")
    const message = await this.db.$transaction(async (tx) => {
      await tx.issueChatMember.delete({ where: { chatId_userId: { chatId, userId } } })
      return tx.issueChatMessage.create({ data: { chatId, kind: "SYSTEM", body: `${member.user.name} was removed from this chat by ${user.name} (dispatch).` }, include: { sender: senderSelect } })
    })
    this.publish(chat, message)
    return this.detail(user, chatId, {})
  }

  /** Resolving the issue ends the conversation: post the outcome, close the room, tell everyone in it. */
  async closeForResolution(issueId: string, user: SessionUser, resolution: string) {
    try {
      const chat = await this.db.issueChat.findUnique({
        where: { issueId },
        select: { id: true, depotId: true, closedAt: true, issue: { select: { ref: true } }, members: { select: { userId: true, user: { select: { role: true } } } } },
      })
      if (!chat) return
      const [message] = await this.db.$transaction([
        this.db.issueChatMessage.create({
          data: { chatId: chat.id, kind: "SYSTEM", body: `Resolved by ${user.name} (dispatch): ${resolution} This chat is now closed; you can still read it.` },
          include: { sender: senderSelect },
        }),
        this.db.issueChat.update({ where: { id: chat.id }, data: { closedAt: chat.closedAt ?? new Date(), closedById: user.sub, lastMessageAt: new Date() } }),
        this.db.issueChatMember.updateMany({ where: { chatId: chat.id }, data: { unread: { increment: 1 } } }),
        this.db.notification.createMany({
          data: chat.members.map((m) => ({ userId: m.userId, type: "ISSUE_UPDATE", title: `${chat.issue.ref} resolved`, body: resolution.slice(0, 140), link: HOME[m.user.role] })),
        }),
      ])
      this.publish(chat, message)
    } catch {
      /* messaging must never block issue handling */
    }
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private publish(chat: { id: string; depotId: string }, message: Parameters<IssueChatService["toMessage"]>[0]) {
    const out = this.toMessage(message)
    void this.db.issueChatMember.findMany({ where: { chatId: chat.id }, select: { userId: true } }).then((members) =>
      this.gateway.publishTo(chat.depotId, members.map((m) => m.userId), "issue-chat:message", { chatId: chat.id, message: out } satisfies IssueChatMessageEvent),
    )
    return out
  }

  private async access(user: SessionUser, chatId: string): Promise<ChatRow> {
    const chat = await this.db.issueChat.findFirst({
      // Dispatchers work across depots (the depot switcher), so they reach any issue chat; members only their own.
      where: { id: chatId, ...(user.role === "DISPATCHER" ? {} : { members: { some: { userId: user.sub } } }) },
      include: summaryInclude(user.sub),
    })
    if (!chat) throw new NotFoundException("Chat not found") // also hides other people's chats
    return chat
  }

  private toSummary(user: SessionUser, c: ChatRow): IssueChatSummary {
    const last = c.messages[0]
    const i = c.issue
    return {
      id: c.id,
      issue: {
        id: i.id,
        ref: i.ref,
        type: i.type,
        status: i.status,
        severity: i.severity,
        description: i.description,
        tripRef: i.trip?.ref ?? null,
        outletName: i.outlet?.name ?? i.order?.outlet.name ?? null,
        createdAt: i.createdAt.toISOString(),
      },
      closed: !!c.closedAt,
      memberCount: c._count.members,
      lastMessage: last ? { body: bodyPreview(last.body), at: last.createdAt.toISOString(), senderName: last.sender?.name ?? null, kind: last.kind } : null,
      unread: user.role === "DISPATCHER" ? 0 : (c.members[0]?.unread ?? 0),
      updatedAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
    }
  }

  private toMessage(m: { id: string; chatId: string; kind: "TEXT" | "SYSTEM"; senderId: string | null; sender: { id: string; name: string; role: Role } | null; body: string; clientId: string | null; createdAt: Date }): IssueChatMessageDto {
    return { id: m.id, chatId: m.chatId, kind: m.kind, senderId: m.senderId, sender: m.sender, body: m.body, clientId: m.clientId, createdAt: m.createdAt.toISOString() }
  }
}

@Controller("issue-chats")
export class IssueChatController {
  constructor(private readonly chats: IssueChatService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query("status") status?: string, @Query("depotId") depotId?: string) {
    return this.chats.list(user, { status, depotId })
  }

  @Get("by-issue/:issueId")
  byIssue(@CurrentUser() user: SessionUser, @Param("issueId") issueId: string) {
    return this.chats.byIssue(user, issueId)
  }

  @Get(":id/mentions")
  mentions(@CurrentUser() user: SessionUser, @Param("id") id: string, @Query("q") q?: string, @Query("type") type?: string) {
    return this.chats.mentionOptions(user, id, { q, type })
  }

  @Get(":id")
  detail(@CurrentUser() user: SessionUser, @Param("id") id: string, @Query("before") before?: string) {
    return this.chats.detail(user, id, { before })
  }

  @Post(":id/messages")
  send(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(issueChatMessageSchema)) body: IssueChatMessageInput) {
    return this.chats.send(user, id, body)
  }

  @Post(":id/read")
  read(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.chats.markRead(user, id)
  }

  @Roles("DISPATCHER")
  @Post(":id/close")
  close(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.chats.setClosed(user, id, true)
  }

  @Roles("DISPATCHER")
  @Post(":id/reopen")
  reopen(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.chats.setClosed(user, id, false)
  }

  @Roles("DISPATCHER")
  @Get(":id/candidates")
  candidates(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.chats.candidates(user, id)
  }

  @Roles("DISPATCHER")
  @Post(":id/members")
  invite(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(issueChatInviteSchema)) body: IssueChatInviteInput) {
    return this.chats.invite(user, id, body)
  }

  @Roles("DISPATCHER")
  @Delete(":id/members/:userId")
  removeMember(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("userId") userId: string) {
    return this.chats.removeInvited(user, id, userId)
  }
}

@Module({ imports: [ChatModule], controllers: [IssueChatController], providers: [IssueChatService], exports: [IssueChatService] })
export class IssueChatModule {}
