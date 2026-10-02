"use client"

import Link from "next/link"
import { ArrowLeft, Phone, Route, Store, Truck, User } from "lucide-react"
import { ISSUE_STAGE_LABEL, ISSUE_TYPE_META, ROLE_LABEL, type Role } from "@waypoint/shared"
import { BrandBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, fmtDateTime, fmtNum, minToHHMM, timeAgo } from "@/lib/format"
import type { IssueDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useIssue, useTripDetail } from "../queries"
import { TripMap, plannedAsLive } from "../trips/detail/trip-map"
import { AutoBadge, IssueStatusBadge, SeverityBadge, StageBadge } from "./issue-badges"
import { IssueWorkspace } from "./issue-workspace"

const HISTORY_LABEL: Record<string, string> = {
  ISSUE_REPORTED: "Reported",
  ISSUE_ACKNOWLEDGED: "Acknowledged",
  ISSUE_RESOLVED: "Resolved",
  ISSUE_ACTION: "Decision",
}

export function IssueDetailPage({ id, mapboxToken }: { id: string; mapboxToken?: string }) {
  const { data: issue, isLoading } = useIssue(id)

  if (isLoading || !issue) return <Skeleton className="h-[600px] rounded-xl" />

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Button variant="link" size="xs" className="w-fit px-0 text-muted-foreground" nativeButton={false} render={<Link href="/dispatcher/issues" />}>
            <ArrowLeft data-icon="inline-start" /> Issues
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{issue.ref}</h1>
            <span className="text-lg text-muted-foreground">· {ISSUE_TYPE_META[issue.type].label}</span>
            <SeverityBadge severity={issue.severity} />
            <IssueStatusBadge status={issue.status} />
            <StageBadge stage={issue.stage} />
            <AutoBadge clientId={issue.clientId} />
          </div>
          <p className="text-sm text-muted-foreground">
            Reported by {issue.reportedBy.name} ({ROLE_LABEL[issue.reportedBy.role as Role] ?? issue.reportedBy.role}) · {timeAgo(issue.createdAt)}
          </p>
        </div>
        {issue.trip && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dispatcher/trips/${issue.trip.id}`} />}>
            <Route data-icon="inline-start" /> Open {issue.trip.ref}
          </Button>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>What happened</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="leading-relaxed">{issue.description}</p>
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-4">
                <Fact label="Stage" value={ISSUE_STAGE_LABEL[issue.stage]} />
                <Fact label="Quantity" value={issue.quantity ?? "—"} />
                <Fact label="Raised" value={fmtDateTime(issue.createdAt)} />
                <Fact label="Last update" value={timeAgo(issue.updatedAt ?? issue.createdAt)} />
              </dl>
            </CardContent>
          </Card>

          {issue.trip && <IssueRouteMap tripId={issue.trip.id} stopId={issue.stopId ?? undefined} mapboxToken={mapboxToken} />}

          <div className="grid gap-3 md:grid-cols-2">
            {issue.trip && <TripContext issue={issue} />}
            {issue.outlet && <OutletContext issue={issue} />}
            {issue.order && <OrderContext issue={issue} />}
            {issue.vehicle && !issue.trip && (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="size-4 text-muted-foreground" /> Vehicle {issue.vehicle.id}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-xs">
                  <TagBadge tone={issue.vehicle.temp === "REEFER" ? "blue" : "gray"}>{issue.vehicle.temp === "REEFER" ? "Reefer" : "Ambient"}</TagBadge>
                  <TagBadge>{issue.vehicle.type.toLowerCase()}</TagBadge>
                  <TagBadge tone={issue.vehicle.status === "AVAILABLE" ? "green" : "amber"}>{issue.vehicle.status === "AVAILABLE" ? "Available" : "In workshop"}</TagBadge>
                </CardContent>
              </Card>
            )}
          </div>

          <Card size="sm">
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative grid gap-4 border-l pl-5">
                {issue.history.map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span className="absolute top-1 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" />
                    <p className="font-medium">
                      {HISTORY_LABEL[h.action] ?? h.action} <span className="font-normal text-muted-foreground">by {h.actor?.name ?? "System"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(h.createdAt)}</p>
                    {h.action === "ISSUE_RESOLVED" && issue.resolution && <p className="mt-1 text-xs">{issue.resolution}</p>}
                    {h.action === "ISSUE_ACTION" && typeof h.after?.summary === "string" && <p className="mt-1 text-xs">{h.after.summary}</p>}
                  </li>
                ))}
                {!issue.history.length && (
                  <li className="relative text-sm">
                    <span className="absolute top-1 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" />
                    <p className="font-medium">
                      Raised <span className="font-normal text-muted-foreground">by {issue.reportedBy.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(issue.createdAt)}</p>
                  </li>
                )}
              </ol>
            </CardContent>
          </Card>
        </div>

        <IssueWorkspace issue={issue} />
      </div>
    </div>
  )
}

/** Where it happened: the trip on real roads, with the issue stop called out. */
function IssueRouteMap({ tripId, stopId, mapboxToken }: { tripId: string; stopId?: string; mapboxToken?: string }) {
  const { data: detail } = useTripDetail(tripId)
  if (!detail) return <Skeleton className="h-80 rounded-xl" />
  const live = detail.live ?? plannedAsLive(detail)
  const stop = live.stops.find((s) => s.id === stopId)
  return (
    <Card size="sm" className="relative h-80 gap-0 overflow-hidden p-0">
      <TripMap detail={detail} trip={live} mapboxToken={mapboxToken} highlightStopId={stopId} />
      <div className="absolute top-3 left-3 grid gap-0.5 rounded-lg bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
        <span className="font-semibold">
          {detail.trip.ref} · {detail.trip.vehicle.id}
        </span>
        <span className="text-muted-foreground">{live.locationLabel}</span>
        {stop && (
          <span className="text-red-600 dark:text-red-400">
            Issue at stop {stop.seq} · {stop.outletId} · ETA {minToHHMM(stop.etaMin)}
          </span>
        )}
      </div>
      <Button size="xs" variant="secondary" className="absolute top-3 right-3 shadow-md" nativeButton={false} render={<Link href={`/dispatcher/trips/${tripId}`} />}>
        <Route data-icon="inline-start" /> Trip details
      </Button>
    </Card>
  )
}

function TripContext({ issue }: { issue: IssueDetail }) {
  const t = issue.trip!
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="size-4 text-muted-foreground" />
          <Link href={`/dispatcher/trips/${t.id}`} className="hover:underline">
            {t.ref}
          </Link>
          <BrandBadge brand={t.brand} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-xs">
        <Row k="Vehicle" v={t.vehicleId} />
        <Row k="District" v={t.districtId} />
        <Row k="Departs" v={minToHHMM(t.plannedDepartMin)} />
        {issue.stop && <Row k="Stop" v={`#${issue.stop.seq} · planned ${minToHHMM(issue.stop.plannedArrivalMin)}`} />}
        <Row k="Plan" v={`v${t.plan.version} · ${fmtDate(t.plan.date, { day: "numeric", month: "short" })}`} />
        {t.driver && (
          <div className="mt-1 flex items-center gap-2 rounded-md bg-muted/50 p-2">
            <User className="size-3.5 text-muted-foreground" />
            <span className="flex-1 font-medium">{t.driver.name}</span>
            {t.driver.phone && (
              <a href={`tel:${t.driver.phone}`} className="inline-flex items-center gap-1 text-primary">
                <Phone className="size-3" /> Call
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OutletContext({ issue }: { issue: IssueDetail }) {
  const o = issue.outlet!
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-4 text-muted-foreground" /> {o.id}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-xs">
        <Row k="Name" v={o.name} />
        <Row k="District" v={o.districtId} />
        <Row k="Receiving window" v={`${minToHHMM(o.windowOpenMin)}–${minToHHMM(o.windowCloseMin)}`} />
        {o.managers.map((m) => (
          <Row key={m.name} k="Store manager" v={m.name} />
        ))}
      </CardContent>
    </Card>
  )
}

function OrderContext({ issue }: { issue: IssueDetail }) {
  const o = issue.order!
  return (
    <Card size="sm" className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TempIcon temp={o.temp} /> Order {o.ref}
          <span className="text-xs font-normal text-muted-foreground">
            {o.units} units · {fmtNum(o.weightKg)} kg · {fmtNum(o.volumeM3, 2)} m³
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1.5 text-xs">
        {o.lines.map((l) => (
          <div key={l.id} className={cn("flex items-center gap-2", issue.orderLine?.id === l.id && "font-medium text-red-600")}>
            <span className="flex-1">
              {l.description} <span className="text-muted-foreground">· {l.category.toLowerCase()}</span>
            </span>
            <span className="tabular-nums">×{l.quantity}</span>
            <span className="w-16 text-right text-muted-foreground tabular-nums">{fmtNum(l.weightKg)} kg</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
