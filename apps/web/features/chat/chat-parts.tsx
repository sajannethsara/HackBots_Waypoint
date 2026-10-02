"use client"

import Link from "next/link"
import { Boxes, CircleAlert, ClipboardList, Route, Store, Truck, Workflow, type LucideIcon } from "lucide-react"
import { parseBody, ROLE_LABEL, type ChatPerson, type ConversationSummary, type MentionRef, type MentionType, type Role } from "@waypoint/shared"
import { TagBadge, type Tone } from "@/components/shared/badges"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

export const ROLE_TONE: Record<Role, Tone> = { DISPATCHER: "violet", DRIVER: "blue", LOADER: "amber", STORE_MANAGER: "green" }
export const ROLE_ICON: Record<Role, LucideIcon> = { DISPATCHER: Workflow, DRIVER: Truck, LOADER: Boxes, STORE_MANAGER: Store }
const AVATAR_TONE: Record<Role, string> = {
  DISPATCHER: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  DRIVER: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  LOADER: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  STORE_MANAGER: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
}

export function RoleTag({ role }: { role: Role }) {
  return <TagBadge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</TagBadge>
}

export function PersonAvatar({ name, role, size = "default" }: { name: string; role: Role; size?: "default" | "sm" | "lg" }) {
  return (
    <Avatar size={size}>
      <AvatarFallback className={cn("text-xs font-medium", AVATAR_TONE[role])}>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

/** Who the signed-in side is talking to: the member for the desk, "Dispatch desk" for everyone else. */
export function counterpart(viewer: Role, c: ConversationSummary): ChatPerson {
  if (viewer === "DISPATCHER") return c.member
  return { id: "desk", name: "Dispatch desk", role: "DISPATCHER", detail: null }
}

const MENTION_ICON: Record<MentionType, LucideIcon> = { issue: CircleAlert, trip: Route, outlet: Store, vehicle: Truck, order: ClipboardList }
export const mentionIcon = (t: MentionType) => MENTION_ICON[t]

/** Only dispatcher screens exist for these; other roles see the chip without a link. */
function mentionHref(m: MentionRef, viewer: Role) {
  if (viewer !== "DISPATCHER") return null
  if (m.type === "trip") return `/dispatcher/trips/${m.id}`
  if (m.type === "issue") return `/dispatcher/issues/${m.id}`
  return null
}

export function MentionChip({ mention, viewer, onBrand }: { mention: MentionRef; viewer: Role; onBrand?: boolean }) {
  const Icon = MENTION_ICON[mention.type]
  const href = mentionHref(mention, viewer)
  const cls = cn(
    "mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-px align-baseline text-[0.8em] leading-5 font-medium",
    onBrand ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary",
    href && "hover:underline",
  )
  const inner = (
    <>
      <Icon className="size-3 shrink-0" />
      {mention.label}
    </>
  )
  return href ? (
    <Link href={href} className={cls} title={`Open ${mention.label}`}>
      {inner}
    </Link>
  ) : (
    <span className={cls} title={`${mention.type} · ${mention.label}`}>
      {inner}
    </span>
  )
}

/** Message text with @[type:id|label] tokens rendered as chips. */
export function MessageBody({ body, viewer, onBrand }: { body: string; viewer: Role; onBrand?: boolean }) {
  return (
    <>
      {parseBody(body).map((p, i) =>
        typeof p === "string" ? <span key={i}>{p}</span> : <MentionChip key={i} mention={p} viewer={viewer} onBrand={onBrand} />,
      )}
    </>
  )
}

export function UnreadDot({ count, className }: { count: number; className?: string }) {
  if (!count) return null
  return (
    <span
      className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums", className)}
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" })
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

/** "now", "5m", "3h", then a date: compact enough for a list row. */
export function shortAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return clock(iso)
  if (s < 86400 * 2) return "Yesterday"
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}
