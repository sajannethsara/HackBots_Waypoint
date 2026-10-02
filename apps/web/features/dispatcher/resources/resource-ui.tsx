"use client"

import Link from "next/link"
import { ArrowLeft, MapPinned, MessageSquare, Phone, Route } from "lucide-react"
import { ISSUE_TYPE_META, type LiveStop, type LiveTrip, type LiveTripStatus } from "@waypoint/shared"
import { TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useChatSheet } from "@/features/chat/chat-sheet"
import { minToHHMM, timeAgo } from "@/lib/format"
import type { IssueChip } from "@/lib/types"
import { cn } from "@/lib/utils"
import { IssueStatusBadge, SeverityBadge } from "../issues/issue-badges"
import { TRIP_COLOR, TRIP_TONE, tripLabel } from "../live/status"

/** Trip states in which a vehicle is "live": loading, driving, unloading or heading home. */
export const LIVE_ACTIVE: LiveTripStatus[] = ["LOADING", "ON_ROUTE", "AT_OUTLET", "DELAYED", "RETURNING"]

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="link" size="xs" className="w-fit px-0 text-muted-foreground" nativeButton={false} render={<Link href={href} />}>
      <ArrowLeft data-icon="inline-start" /> {children}
    </Button>
  )
}

export function Fact({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  )
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  )
}

/** Opens the chat sheet with a person; the dispatcher stays on the page they are working on. */
export function MessageButton({ memberId, label, size = "sm" }: { memberId: string; label: string; size?: "xs" | "sm" }) {
  const { open } = useChatSheet()
  return (
    <Button variant="outline" size={size} onClick={() => open({ memberId })}>
      <MessageSquare data-icon="inline-start" /> {label}
    </Button>
  )
}

export function CallLink({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null
  return (
    <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      <Phone className="size-3" /> {phone}
    </a>
  )
}

/** A pulsing dot in the live colour of a status. */
export function LiveDot({ color }: { color: string }) {
  return (
    <span className="relative flex size-2.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex size-2.5 rounded-full" style={{ background: color }} />
    </span>
  )
}

/** Top-of-page highlight when a vehicle has a trip in progress right now. */
export function LiveTripBanner({ trip }: { trip: LiveTrip }) {
  const color = TRIP_COLOR[trip.status]
  return (
    <Card size="sm" className="overflow-hidden border-l-4 py-0" style={{ borderLeftColor: color }}>
      <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <LiveDot color={color} />
            <span className="text-sm font-semibold">Live now</span>
            <TagBadge tone={TRIP_TONE[trip.status]}>{tripLabel(trip.status)}</TagBadge>
            <Link href={`/dispatcher/trips/${trip.id}`} className="text-sm font-medium hover:underline">
              {trip.ref}
            </Link>
            <span className="text-xs text-muted-foreground">
              {trip.districtId} · {trip.driver?.name ?? "No driver"}
            </span>
            {trip.delayMin > 0 && <TagBadge tone={trip.delayMin >= 15 ? "red" : "amber"}>+{trip.delayMin} min late</TagBadge>}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${trip.progressPct}%`, background: color }} />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {trip.stopsDone}/{trip.stops.length} stops · {trip.progressPct}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {trip.locationLabel}
            {trip.nextStop && ` · next ${trip.nextStop.outletId} ~${minToHHMM(trip.nextStop.etaMin)}`} · back at depot ~{minToHHMM(trip.etaReturnMin)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" nativeButton={false} render={<Link href={`/dispatcher/trips/${trip.id}`} />}>
            <Route data-icon="inline-start" /> Open trip
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dispatcher/live" />}>
            <MapPinned data-icon="inline-start" /> Live map
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Highlight for an outlet or order: where its delivery is right now. */
export function LiveStopBanner({ trip, stop, subject }: { trip: LiveTrip; stop: LiveStop; subject: "outlet" | "order" }) {
  const done = stop.status === "COMPLETED"
  const here = stop.status === "IN_PROGRESS"
  const color = done ? "#16a34a" : stop.late ? "#ef4444" : here ? "#3b82f6" : TRIP_COLOR[trip.status]
  const headline = done
    ? `Delivered at ${minToHHMM(stop.completedMin ?? stop.etaMin)}`
    : here
      ? `${trip.vehicleId} is at the ${subject === "outlet" ? "outlet" : "store"} now`
      : trip.status === "SCHEDULED" || trip.status === "LOADING"
        ? `Scheduled for ~${minToHHMM(stop.etaMin)}`
        : `${trip.vehicleId} arriving ~${minToHHMM(stop.etaMin)}`
  return (
    <Card size="sm" className="overflow-hidden border-l-4 py-0" style={{ borderLeftColor: color }}>
      <CardContent className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <LiveDot color={color} />
            <span className="text-sm font-semibold">{headline}</span>
            {stop.late && !done && <TagBadge tone="red">Will miss its window</TagBadge>}
            {stop.delayMin > 0 && !done && <TagBadge tone={stop.delayMin >= 15 ? "red" : "amber"}>+{stop.delayMin} min</TagBadge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Stop {stop.seq} of {trip.stops.length} on{" "}
            <Link href={`/dispatcher/trips/${trip.id}`} className="font-medium text-foreground hover:underline">
              {trip.ref}
            </Link>{" "}
            · {tripLabel(trip.status)} · planned {minToHHMM(stop.plannedArrivalMin)} · window closes {minToHHMM(stop.windowCloseMin)}
            {trip.driver && ` · driver ${trip.driver.name}`}
          </p>
        </div>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dispatcher/trips/${trip.id}`} />}>
          <Route data-icon="inline-start" /> Track trip
        </Button>
      </CardContent>
    </Card>
  )
}

export function IssueList({ issues, empty = "No issues recorded." }: { issues: IssueChip[]; empty?: string }) {
  if (!issues.length) return <p className="text-xs text-muted-foreground">{empty}</p>
  return (
    <ul className="grid gap-1.5">
      {issues.map((i) => (
        <li key={i.id}>
          <Link href={`/dispatcher/issues/${i.id}`} className="flex items-center gap-2 rounded-md border p-2 text-xs hover:bg-muted/50">
            <span className="font-medium">{i.ref}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{ISSUE_TYPE_META[i.type].label}</span>
            <SeverityBadge severity={i.severity} />
            <IssueStatusBadge status={i.status} />
            <span className="hidden text-muted-foreground sm:inline">{timeAgo(i.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function Section({ title, aside, children, className }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {aside && <span className="ml-auto text-xs font-normal text-muted-foreground">{aside}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
