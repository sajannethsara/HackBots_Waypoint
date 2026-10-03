import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  minToHHMM,
  NOTIFICATION_GROUPS,
  NOTIFICATION_GROUP_META,
  type ChangeRequestInput,
  type DecideRequestInput,
  type NotificationPrefs,
  type StoreChangeRequest,
  type StoreDepartment,
  type StoreLeader,
  type StoreNotifications,
  type StoreProfile,
  type StoreSettings,
  type UpdateAboutInput,
  type UpdateLeadershipInput,
  type UpdateReceivingInput,
} from "@waypoint/shared"
import type { SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"

const DEFAULT_PREFS: NotificationPrefs = { orders: true, deliveries: true, issues: true, messages: true }
const LABEL = { REAR_DOCK: "rear dock", STREET: "street side", MALL_BAY: "mall bay", NORMAL: "normal access", VAN_ONLY: "vans only", MALL_DOCK: "mall dock" } as Record<string, string>

const prefsOf = (raw: Prisma.JsonValue | null | undefined): NotificationPrefs => {
  const v = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Partial<NotificationPrefs>
  return Object.fromEntries(NOTIFICATION_GROUPS.map((g) => [g, v[g] !== false])) as NotificationPrefs
}

/** Notification types the user has switched off. Types we don't know about are always shown. */
const mutedTypes = (prefs: NotificationPrefs) => NOTIFICATION_GROUPS.filter((g) => !prefs[g]).flatMap((g) => NOTIFICATION_GROUP_META[g].types)

const toRequest = (r: { id: string; kind: string; status: string; current: Prisma.JsonValue; proposed: Prisma.JsonValue; reason: string; createdAt: Date; decidedAt: Date | null; decisionNote: string | null }): StoreChangeRequest => ({
  id: r.id,
  kind: r.kind as StoreChangeRequest["kind"],
  status: r.status as StoreChangeRequest["status"],
  current: r.current as Record<string, unknown>,
  proposed: r.proposed as Record<string, unknown>,
  reason: r.reason,
  createdAt: r.createdAt.toISOString(),
  decidedAt: r.decidedAt?.toISOString() ?? null,
  decisionNote: r.decisionNote,
})

/**
 * The outlet's own page: profile, receiving details, settings and notifications.
 * Everything here is scoped to the signed-in manager's outlet. Details the planner depends on
 * (receiving window, dock, parking) are never edited directly: they become a request the dispatcher decides.
 */
@Injectable()
export class StoreProfileService {
  constructor(private readonly db: PrismaService) {}

  private outletOf(user: SessionUser) {
    if (!user.outletId) throw new ForbiddenException("This account is not linked to an outlet")
    return user.outletId
  }

  // ───────────────────────────── Profile ─────────────────────────────

  async profile(user: SessionUser): Promise<StoreProfile> {
    const id = this.outletOf(user)
    const o = await this.db.outlet.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        brand: true,
        districtId: true,
        depot: { select: { id: true, name: true } },
        dockType: true,
        parkingConstraint: true,
        windowOpenMin: true,
        windowCloseMin: true,
        mallWindowOpenMin: true,
        mallWindowCloseMin: true,
        profile: true,
        changeRequests: { orderBy: { createdAt: "desc" }, take: 8 },
      },
    })
    const p = o.profile
    return {
      outlet: {
        id: o.id,
        name: o.name,
        brand: o.brand,
        district: o.districtId,
        depot: o.depot,
        dockType: o.dockType,
        parkingConstraint: o.parkingConstraint,
        windowOpenMin: o.windowOpenMin,
        windowCloseMin: o.windowCloseMin,
        mallWindowOpenMin: o.mallWindowOpenMin,
        mallWindowCloseMin: o.mallWindowCloseMin,
      },
      about: {
        address: p?.address ?? null,
        phone: p?.phone ?? null,
        email: p?.email ?? null,
        tradingOpenMin: p?.tradingOpenMin ?? null,
        tradingCloseMin: p?.tradingCloseMin ?? null,
        floorAreaM2: p?.floorAreaM2 ?? null,
      },
      departments: (p?.departments as unknown as StoreDepartment[] | undefined) ?? [],
      leadership: (p?.leadership as unknown as StoreLeader[] | undefined) ?? [],
      receiving: {
        contactName: p?.receivingContactName ?? null,
        contactPhone: p?.receivingContactPhone ?? null,
        staff: p?.receivingStaff ?? null,
        hasForklift: p?.hasForklift ?? false,
        hasColdRoom: p?.hasColdRoom ?? false,
        notes: p?.receivingNotes ?? null,
      },
      requests: o.changeRequests.map(toRequest),
    }
  }

  private async save(user: SessionUser, data: Prisma.OutletProfileUpdateInput, what: string) {
    const outletId = this.outletOf(user)
    await this.db.$transaction([
      this.db.outletProfile.upsert({ where: { outletId }, create: { ...(data as Prisma.OutletProfileUncheckedCreateInput), outletId }, update: data }),
      this.db.auditLog.create({ data: { actorId: user.sub, action: "OUTLET_PROFILE_UPDATED", entityType: "Outlet", entityId: outletId, after: { section: what } } }),
    ])
    return this.profile(user)
  }

  updateAbout(user: SessionUser, i: UpdateAboutInput) {
    return this.save(user, { address: i.address, phone: i.phone, email: i.email, tradingOpenMin: i.tradingOpenMin, tradingCloseMin: i.tradingCloseMin, floorAreaM2: i.floorAreaM2, departments: i.departments }, "about")
  }

  updateLeadership(user: SessionUser, i: UpdateLeadershipInput) {
    return this.save(user, { leadership: i.leadership }, "leadership")
  }

  updateReceiving(user: SessionUser, i: UpdateReceivingInput) {
    return this.save(
      user,
      { receivingContactName: i.contactName, receivingContactPhone: i.contactPhone, receivingStaff: i.staff, hasForklift: i.hasForklift, hasColdRoom: i.hasColdRoom, receivingNotes: i.notes },
      "receiving",
    )
  }

  // ───────────────────────────── Change requests ─────────────────────────────

  /** Ask the dispatcher to change the receiving window or the dock and parking details. */
  async requestChange(user: SessionUser, input: ChangeRequestInput): Promise<StoreChangeRequest> {
    const outletId = this.outletOf(user)
    const outlet = await this.db.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { name: true, depotId: true, windowOpenMin: true, windowCloseMin: true, dockType: true, parkingConstraint: true } })
    const open = await this.db.outletChangeRequest.findFirst({ where: { outletId, kind: input.kind, status: "PENDING" }, select: { id: true } })
    if (open) throw new ConflictException("You already have a pending request for this. Cancel it or wait for dispatch to decide.")

    const current = input.kind === "WINDOW" ? { windowOpenMin: outlet.windowOpenMin, windowCloseMin: outlet.windowCloseMin } : { dockType: outlet.dockType, parkingConstraint: outlet.parkingConstraint }
    const proposed = input.kind === "WINDOW" ? { windowOpenMin: input.windowOpenMin, windowCloseMin: input.windowCloseMin } : { dockType: input.dockType, parkingConstraint: input.parkingConstraint }
    if (JSON.stringify(current) === JSON.stringify(proposed)) throw new ConflictException("That is already how your outlet is set up.")

    const summary = input.kind === "WINDOW" ? `receiving window ${minToHHMM(outlet.windowOpenMin)}–${minToHHMM(outlet.windowCloseMin)} → ${minToHHMM(input.windowOpenMin)}–${minToHHMM(input.windowCloseMin)}` : `${LABEL[outlet.dockType]}, ${LABEL[outlet.parkingConstraint]} → ${LABEL[input.dockType]}, ${LABEL[input.parkingConstraint]}`
    const dispatchers = await this.db.user.findMany({ where: { role: "DISPATCHER", depotId: outlet.depotId, isActive: true }, select: { id: true } })

    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.outletChangeRequest.create({ data: { outletId, kind: input.kind, current, proposed, reason: input.reason, requestedById: user.sub } })
      await tx.notification.createMany({
        data: dispatchers.map((d) => ({ userId: d.id, type: "OUTLET_REQUEST", title: `${outlet.name} asks to change its setup`, body: `${summary}. Reason: ${input.reason}`, link: `/dispatcher/outlets/${outletId}` })),
      })
      await tx.auditLog.create({ data: { actorId: user.sub, action: "OUTLET_CHANGE_REQUESTED", entityType: "Outlet", entityId: outletId, after: { kind: input.kind, proposed } } })
      return created
    })
    return toRequest(row)
  }

  async cancelRequest(user: SessionUser, id: string): Promise<StoreChangeRequest> {
    const outletId = this.outletOf(user)
    const r = await this.db.outletChangeRequest.findFirst({ where: { id, outletId } })
    if (!r) throw new NotFoundException("Request not found")
    if (r.status !== "PENDING") throw new ConflictException("Dispatch has already decided this request.")
    const { count } = await this.db.outletChangeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } })
    if (!count) throw new ConflictException("Dispatch has already decided this request.")
    return toRequest(await this.db.outletChangeRequest.findUniqueOrThrow({ where: { id } }))
  }

  // ── Dispatcher side of the same requests (API only; the screen belongs to the dispatcher app) ──

  async listRequests(user: SessionUser, status?: string) {
    const rows = await this.db.outletChangeRequest.findMany({
      where: { outlet: { depotId: user.depotId ?? undefined }, ...(status ? { status: status as "PENDING" } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { outlet: { select: { id: true, name: true } }, requestedBy: { select: { name: true } } },
    })
    return rows.map((r) => ({ ...toRequest(r), outlet: r.outlet, requestedBy: r.requestedBy.name }))
  }

  /** Approving applies the change to the outlet, so the next plan uses it. */
  async decide(user: SessionUser, id: string, input: DecideRequestInput): Promise<StoreChangeRequest> {
    const r = await this.db.outletChangeRequest.findFirst({ where: { id, outlet: { depotId: user.depotId ?? undefined } }, include: { outlet: { select: { name: true } } } })
    if (!r) throw new NotFoundException("Request not found")
    const managers = await this.db.user.findMany({ where: { role: "STORE_MANAGER", outletId: r.outletId, isActive: true }, select: { id: true } })
    const proposed = r.proposed as Record<string, unknown>

    const row = await this.db.$transaction(async (tx) => {
      const { count } = await tx.outletChangeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: input.decision, decidedById: user.sub, decidedAt: new Date(), decisionNote: input.note || null } })
      if (!count) throw new ConflictException("This request has already been decided.")
      if (input.decision === "APPROVED")
        await tx.outlet.update({
          where: { id: r.outletId },
          data: r.kind === "WINDOW" ? { windowOpenMin: proposed.windowOpenMin as number, windowCloseMin: proposed.windowCloseMin as number } : { dockType: proposed.dockType as "REAR_DOCK", parkingConstraint: proposed.parkingConstraint as "NORMAL" },
        })
      await tx.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          type: "OUTLET_REQUEST",
          title: input.decision === "APPROVED" ? "Your change request was approved" : "Your change request was declined",
          body: input.note || (input.decision === "APPROVED" ? "The new setup applies from the next plan." : "Your setup stays as it is."),
          link: "/store-manager/profile",
        })),
      })
      await tx.auditLog.create({ data: { actorId: user.sub, action: `OUTLET_REQUEST_${input.decision}`, entityType: "Outlet", entityId: r.outletId, after: { requestId: id, kind: r.kind, proposed: proposed as Prisma.InputJsonObject } } })
      return tx.outletChangeRequest.findUniqueOrThrow({ where: { id } })
    })
    return toRequest(row)
  }

  // ───────────────────────────── Settings ─────────────────────────────

  async settings(user: SessionUser): Promise<StoreSettings> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: user.sub }, select: { name: true, email: true, notificationPrefs: true } })
    return { account: { name: u.name, email: u.email }, notifications: prefsOf(u.notificationPrefs) }
  }

  async updatePrefs(user: SessionUser, prefs: NotificationPrefs): Promise<StoreSettings> {
    await this.db.user.update({ where: { id: user.sub }, data: { notificationPrefs: prefs } })
    return this.settings(user)
  }

  // ───────────────────────────── Notifications ─────────────────────────────

  /** Latest notifications for the bell. Groups the manager switched off in Settings are left out, and not counted. */
  async notifications(user: SessionUser): Promise<StoreNotifications> {
    const prefs = prefsOf((await this.db.user.findUniqueOrThrow({ where: { id: user.sub }, select: { notificationPrefs: true } })).notificationPrefs)
    const muted = mutedTypes(prefs)
    const where: Prisma.NotificationWhereInput = { userId: user.sub, ...(muted.length ? { type: { notIn: muted } } : {}) }
    const [rows, unread] = await Promise.all([
      this.db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 20 }),
      this.db.notification.count({ where: { ...where, readAt: null } }),
    ])
    return { unread, items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })) }
  }

  /** Marks the given notifications (or all of them) as read. Only ever touches the caller's own. */
  async markRead(user: SessionUser, ids?: string[]) {
    const { count } = await this.db.notification.updateMany({ where: { userId: user.sub, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } })
    return { marked: count }
  }
}
