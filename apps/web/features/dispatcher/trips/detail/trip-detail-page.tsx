"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowLeft, Clock, Fuel, Gauge, MapPinned, PackageCheck, Phone, Radar, Siren, Snowflake, Truck, User, Workflow } from "lucide-react"
import { RULES } from "@waypoint/shared"
import { BrandBadge, StatusBadge, TagBadge } from "@/components/shared/badges"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useWorkspace } from "@/hooks/use-workspace"
import { fmtDate, fmtNum, minToHHMM, pct } from "@/lib/format"
import type { TripDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ReportIssueDialog } from "../../issues/report-issue-dialog"
import { ClockControl } from "../../live/clock-control"
import { TRIP_TONE, tripLabel } from "../../live/status"
import { useLiveSnapshot } from "../../live/use-live"
import { useTripDetail } from "../../queries"
import { TripAlerts, TripIssues } from "./trip-issues"
import { AuditTrail, TripLog } from "./trip-log"
import { TripManifest } from "./trip-manifest"
import { TripMap, plannedAsLive } from "./trip-map"
import { TripStops } from "./trip-stops"

export function TripDetailPage({ id, mapboxToken, wsUrl }: { id: string; mapboxToken?: string; wsUrl?: string }) {
  const { data: detail, isLoading } = useTripDetail(id)
  const ws = useWorkspace()
  const published = detail?.trip.plan.status === "PUBLISHED"
  // Live position over the WebSocket only for a published trip of the day being watched.
  const sameScope = !!detail && ws.depotId === detail.trip.plan.depotId && ws.date === detail.trip.plan.date.slice(0, 10)
  const { data: snap, link } = useLiveSnapshot(wsUrl, published && sameScope)

  const live = useMemo(() => {
    if (!detail) return null
    return snap?.trips.find((t) => t.id === id) ?? detail.live ?? plannedAsLive(detail)
  }, [snap, detail, id])

  if (isLoading || !detail || !live) return <Skeleton className="h-[700px] rounded-xl" />
  const t = detail.trip
  const clock = snap?.clock ?? detail.clock
  const alerts = snap ? snap.alerts.filter((a) => a.tripId === id) : detail.alerts
  const issueCountByStop = new Map<string, number>()
  for (const i of detail.issues) if (i.stopId && i.status !== "RESOLVED") issueCountByStop.set(i.stopId, (issueCountByStop.get(i.stopId) ?? 0) + 1)

  return (
    <div className="grid gap-4">
      <Header detail={detail} live={live} published={published} />
      <Kpis detail={detail} live={live} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-3">
          <Card size="sm" className="relative h-[420px] gap-0 overflow-hidden p-0">
            <TripMap detail={detail} trip={live} mapboxToken={mapboxToken} />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {published && sameScope ? (
                <ClockControl clock={clock ?? undefined} link={link} />
              ) : (
                <span className="rounded-md bg-background/95 px-2 py-1 text-xs shadow-sm">{published ? "Live view follows the depot/day selected in the top bar" : "Planned route — publish the plan to track it live"}</span>
              )}
            </div>
            <div className="absolute bottom-3 left-3 rounded-lg bg-background/95 px-3 py-2 text-xs shadow-sm">
              <span className="font-medium">{live.locationLabel}</span>
              {live.nextStop && (
                <span className="text-muted-foreground">
                  {" "}
                  · next {live.nextStop.outletId} ~{minToHHMM(live.nextStop.etaMin)}
                </span>
              )}
            </div>
          </Card>

          <Card size="sm" className="gap-0 py-0">
            <Tabs defaultValue="stops">
              <div className="border-b px-3 py-2">
                <TabsList>
                  <TabsTrigger value="stops">Stops ({t.stops.length})</TabsTrigger>
                  <TabsTrigger value="manifest">Load manifest</TabsTrigger>
                  <TabsTrigger value="log">Trip log</TabsTrigger>
                  <TabsTrigger value="audit">Audit trail ({detail.audit.length})</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="stops">
                <TripStops detail={detail} live={live} issueCountByStop={issueCountByStop} />
              </TabsContent>
              <TabsContent value="manifest">
                <TripManifest detail={detail} />
              </TabsContent>
              <TabsContent value="log" className="p-4">
                <TripLog detail={detail} live={live} clock={clock} />
              </TabsContent>
              <TabsContent value="audit">
                <AuditTrail audit={detail.audit} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="grid content-start gap-3">
          <TripIssues
            issues={detail.issues}
            action={<ReportIssueDialog tripId={t.id} vehicleId={t.vehicle.id} stops={t.stops.map((s) => ({ id: s.id, seq: s.seq, outletId: s.order.outlet.id, orderId: s.order.id }))} />}
          />
          <TripAlerts alerts={alerts} />
          <Crew detail={detail} />
          <Budgets detail={detail} />
        </div>
      </div>
    </div>
  )
}

function Header({ detail, live, published }: { detail: TripDetail; live: NonNullable<TripDetail["live"]>; published: boolean }) {
  const t = detail.trip
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <Button variant="link" size="xs" className="w-fit px-0 text-muted-foreground" nativeButton={false} render={<Link href="/dispatcher/trips" />}>
          <ArrowLeft data-icon="inline-start" /> Trips
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{t.ref}</h1>
          {published ? <TagBadge tone={TRIP_TONE[live.status]}>{tripLabel(live.status)}</TagBadge> : <StatusBadge status="DRAFT" label="Draft plan" />}
          {live.delayMin >= 5 && <TagBadge tone={live.delayMin >= 15 ? "red" : "amber"}>+{live.delayMin} min</TagBadge>}
          <BrandBadge brand={t.brand} />
          <TagBadge>{t.districtId}</TagBadge>
          {t.vehicle.temp === "REEFER" && (
            <TagBadge tone="blue">
              <Snowflake className="size-3" /> Reefer
            </TagBadge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {fmtDate(t.plan.date)} · {t.vehicle.id} · {detail.sibling ? `trip ${t.tripNo} of 2 for this vehicle` : "only trip for this vehicle"} · plan v{t.plan.version}
          {t.plan.publishedBy ? ` published by ${t.plan.publishedBy.name}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {t.driver?.phone && (
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`tel:${t.driver.phone}`} />}>
            <Phone data-icon="inline-start" /> Call driver
          </Button>
        )}
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
          <Workflow data-icon="inline-start" /> Plan
        </Button>
        <Button size="sm" nativeButton={false} render={<Link href="/dispatcher/live" />}>
          <Radar data-icon="inline-start" /> Live board
        </Button>
      </div>
    </div>
  )
}

function Kpis({ detail, live }: { detail: TripDetail; live: NonNullable<TripDetail["live"]> }) {
  const t = detail.trip
  const fill = Math.max(pct(t.loadWeightKg, t.vehicle.weightCapKg), pct(t.loadVolumeM3, t.vehicle.volumeCapM3))
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        icon={Truck}
        tone="blue"
        label="Departure"
        value={minToHHMM(live.actualDepartMin ?? t.plannedDepartMin)}
        hint={live.actualDepartMin != null ? `planned ${minToHHMM(t.plannedDepartMin)}` : "planned"}
      />
      <StatCard icon={MapPinned} tone="green" label="Outlets done" value={`${live.stopsDone}/${t.stops.length}`} hint={`${live.progressPct}% of route`} />
      <StatCard icon={Clock} tone="violet" label="Back at depot" value={minToHHMM(live.etaReturnMin)} hint={detail.sibling ? `then ${detail.sibling.ref}` : "last trip of the day"} />
      <StatCard icon={Siren} tone={live.delayMin >= 15 ? "red" : live.delayMin > 0 ? "amber" : "gray"} label="Delay" value={`${live.delayMin} min`} hint="vs plan at next stop" />
      <StatCard icon={PackageCheck} tone="amber" label="Load fill" value={`${fill}%`} hint={`${fmtNum(t.loadWeightKg)} kg · ${fmtNum(t.loadVolumeM3, 1)} m³`} />
      <StatCard icon={Fuel} tone="gray" label="Distance · fuel" value={`${fmtNum(t.plannedKm)} km`} hint={`${fmtNum(t.plannedFuelL, 1)} L at ${t.vehicle.kmPerL} km/L`} />
    </div>
  )
}

function Crew({ detail }: { detail: TripDetail }) {
  const t = detail.trip
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Vehicle & crew</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <div className="flex items-start gap-3 rounded-lg border p-2.5">
          <Truck className="mt-0.5 size-4 text-muted-foreground" />
          <div className="grid flex-1 text-xs">
            <span className="text-sm font-medium">{t.vehicle.id}</span>
            <span className="text-muted-foreground">
              {t.vehicle.temp === "REEFER" ? "Refrigerated" : "Ambient"} {t.vehicle.type.toLowerCase()} · {fmtNum(t.vehicle.weightCapKg)} kg · {t.vehicle.volumeCapM3} m³
            </span>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border p-2.5">
          <User className="mt-0.5 size-4 text-muted-foreground" />
          <div className="grid flex-1 text-xs">
            <span className="text-sm font-medium">{t.driver?.name ?? "No driver attached"}</span>
            <span className="text-muted-foreground">{t.driver?.email ?? "Attached when the plan is published"}</span>
          </div>
        </div>
        {detail.sibling && (
          <Link href={`/dispatcher/trips/${detail.sibling.id}`} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5 text-xs hover:bg-muted">
            <span className="flex-1">
              Same vehicle, trip {detail.sibling.tripNo}: <span className="font-medium">{detail.sibling.ref}</span> · {detail.sibling.districtId}
            </span>
            <span className="text-muted-foreground tabular-nums">dep {minToHHMM(detail.sibling.plannedDepartMin)}</span>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function Budgets({ detail }: { detail: TripDetail }) {
  const t = detail.trip
  const fresh = t.brand === "FRESH"
  const budget = fresh ? RULES.freshBudgetMin : RULES.styleTechBudgetMin
  const sameClass = detail.sibling && (detail.sibling.brand === "FRESH") === fresh ? detail.sibling.plannedDurationMin : 0
  const weekUsed = detail.fuelUsedThisWeekL ?? t.plannedFuelL
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="size-4 text-muted-foreground" /> Constraints
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Meter label="Weight" value={t.loadWeightKg} max={t.vehicle.weightCapKg} unit="kg" />
        <Meter label="Volume" value={t.loadVolumeM3} max={t.vehicle.volumeCapM3} unit="m³" digits={1} />
        <Meter label={`${fresh ? "Fresh" : "Style + Tech"} time budget (vehicle, today)`} value={t.plannedDurationMin + sameClass} max={budget} unit="min" />
        <Meter label="Weekly fuel quota (incl. this trip)" value={weekUsed} max={t.vehicle.weeklyFuelQuotaL} unit="L" digits={1} />
      </CardContent>
    </Card>
  )
}

function Meter({ label, value, max, unit, digits = 0 }: { label: string; value: number; max: number; unit: string; digits?: number }) {
  const p = pct(value, max)
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="shrink-0 tabular-nums">
          {fmtNum(value, digits)} / {fmtNum(max, digits)} {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", p > 100 ? "bg-red-500" : p > 90 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
    </div>
  )
}
