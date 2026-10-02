"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { Fuel, Gauge, MapPinned, PackageCheck, Route, Siren, Snowflake, User } from "lucide-react"
import { BrandBadge, StatusBadge, TagBadge } from "@/components/shared/badges"
import { StatCard } from "@/components/shared/stat-card"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWorkspace } from "@/hooks/use-workspace"
import { fmtDate, fmtNum, minToHHMM } from "@/lib/format"
import { cn } from "@/lib/utils"
import { TRIP_TONE, tripLabel } from "../live/status"
import { useLiveSnapshot } from "../live/use-live"
import { useVehicleDetail } from "../queries"
import { BackLink, CallLink, Fact, IssueList, LIVE_ACTIVE, LiveTripBanner, MessageButton, Section } from "./resource-ui"

export function VehicleDetailPage({ id, wsUrl }: { id: string; wsUrl?: string }) {
  const router = useRouter()
  const { data, isLoading, isError } = useVehicleDetail(id)
  const ws = useWorkspace()
  // The live snapshot covers the depot being watched; only follow it for this vehicle's own depot.
  const { data: snap } = useLiveSnapshot(wsUrl, !!data && ws.depotId === data.vehicle.depotId)
  const liveTrips = useMemo(() => snap?.trips.filter((t) => t.vehicleId === id) ?? [], [snap, id])
  const active = liveTrips.find((t) => LIVE_ACTIVE.includes(t.status))
  const liveById = new Map(liveTrips.map((t) => [t.id, t]))

  if (isError)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Vehicle not found</EmptyTitle>
          <EmptyDescription>
            <Link href="/dispatcher/vehicles" className="text-primary hover:underline">
              Back to vehicles
            </Link>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  if (isLoading || !data) return <Skeleton className="h-[640px] rounded-xl" />

  const { vehicle: v, stats, fuelWeek, history, issues } = data
  const fuelPct = fuelWeek ? Math.min(100, Math.round((fuelWeek.litres / fuelWeek.quotaL) * 100)) : 0
  const nextToday = !active ? liveTrips.find((t) => t.status === "SCHEDULED") : undefined

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <BackLink href="/dispatcher/vehicles">Vehicles</BackLink>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{v.id}</h1>
            <span className="text-lg text-muted-foreground capitalize">· {v.type.toLowerCase()}</span>
            {v.temp === "REEFER" ? (
              <TagBadge tone="blue">
                <Snowflake className="size-3" /> Reefer
              </TagBadge>
            ) : (
              <TagBadge>Ambient</TagBadge>
            )}
            <StatusBadge status={v.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {v.depot.name} · {v.fuelType} · {v.kmPerL} km/L
          </p>
        </div>
        {v.driver && (
          <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
            <User className="size-4 text-muted-foreground" />
            <div className="grid leading-tight">
              <span className="text-sm font-medium">{v.driver.name}</span>
              <CallLink phone={v.driver.phone} />
            </div>
            <MessageButton memberId={v.driver.id} label="Message" />
          </div>
        )}
      </div>

      {active ? (
        <LiveTripBanner trip={active} />
      ) : nextToday ? (
        <Card size="sm" className="flex-row items-center gap-3 px-4 py-2.5 text-sm">
          <MapPinned className="size-4 text-muted-foreground" />
          <span>
            Not on the road yet. Next run <Link href={`/dispatcher/trips/${nextToday.id}`} className="font-medium hover:underline">{nextToday.ref}</Link> departs {minToHHMM(nextToday.plannedDepartMin)} to {nextToday.districtId}.
          </span>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Route} label="Trips run" value={stats.trips} hint={`${stats.activeDays} day${stats.activeDays === 1 ? "" : "s"} · ${stats.completedTrips} done`} />
        <StatCard icon={PackageCheck} tone="blue" label="Stops served" value={fmtNum(stats.stops)} hint="All published trips" />
        <StatCard icon={MapPinned} tone="violet" label="Distance" value={`${fmtNum(stats.km)} km`} hint={`${fmtNum(stats.fuelL)} L planned fuel`} />
        <StatCard icon={Gauge} tone="amber" label="Avg load" value={stats.avgUtilPct == null ? "—" : `${stats.avgUtilPct}%`} hint="Of vehicle capacity" />
        <StatCard icon={Siren} tone={stats.openIssues ? "red" : "green"} label="Open issues" value={stats.openIssues} hint={stats.openIssues ? "Needs attention" : "All clear"} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card size="sm" className="min-w-0 gap-0 py-0">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            Trip history <span className="text-xs font-normal text-muted-foreground">newest first · published plans</span>
          </div>
          {!history.length ? (
            <p className="p-10 text-center text-sm text-muted-foreground">This vehicle has not run a published trip yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead className="text-right">Stops</TableHead>
                  <TableHead>Departs</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Load</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((t) => {
                  const live = liveById.get(t.id)
                  return (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => router.push(`/dispatcher/trips/${t.id}`)}>
                      <TableCell className="pl-4 text-xs">{fmtDate(t.date, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                      <TableCell>
                        <Link href={`/dispatcher/trips/${t.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {t.ref}
                        </Link>
                        {t.openIssues > 0 && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-red-500 align-middle" title={`${t.openIssues} open issue(s)`} />}
                      </TableCell>
                      <TableCell>
                        <BrandBadge brand={t.brand} />
                      </TableCell>
                      <TableCell className="text-xs">{t.districtId}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.stops}</TableCell>
                      <TableCell className="text-xs tabular-nums">{minToHHMM(t.plannedDepartMin)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(t.plannedKm, 1)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", t.utilPct > 95 && "font-medium text-amber-600")}>{t.utilPct}%</TableCell>
                      <TableCell className="pr-4">
                        {live ? <TagBadge tone={TRIP_TONE[live.status]}>{tripLabel(live.status)}</TagBadge> : <StatusBadge status={t.status} />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="grid min-w-0 content-start gap-3">
          <Section title="Specifications">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Fact label="Type" value={<span className="capitalize">{v.type.toLowerCase()}</span>} />
              <Fact label="Temperature" value={v.temp === "REEFER" ? "Reefer (chilled)" : "Ambient"} />
              <Fact label="Weight capacity" value={`${fmtNum(v.weightCapKg)} kg`} />
              <Fact label="Volume capacity" value={`${fmtNum(v.volumeCapM3, 1)} m³`} />
              <Fact label="Fuel" value={v.fuelType} />
              <Fact label="Efficiency" value={`${v.kmPerL} km/L`} />
              <Fact label="Weekly fuel quota" value={`${fmtNum(v.weeklyFuelQuotaL)} L`} />
              <Fact label="Home depot" value={v.depot.name} />
              <Fact label="Driver" value={v.driver?.name ?? "Unassigned"} />
              <Fact label="Status" value={v.status === "AVAILABLE" ? "Available" : "In workshop"} />
            </dl>
          </Section>

          {fuelWeek && (
            <Section title={<><Fuel className="size-4 text-muted-foreground" /> Fuel quota</>} aside={`Week ${fuelWeek.isoWeek}, ${fuelWeek.isoYear}`}>
              <div className="grid gap-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold tabular-nums">
                    {fmtNum(fuelWeek.litres)} <span className="text-xs font-normal text-muted-foreground">of {fmtNum(fuelWeek.quotaL)} L</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtNum(fuelWeek.km)} km</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", fuelPct >= 90 ? "bg-red-500" : fuelPct >= 75 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${fuelPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {fuelPct >= 90 ? "Close to the weekly cap: the planner will stop assigning long runs." : `${fmtNum(Math.max(0, fuelWeek.quotaL - fuelWeek.litres))} L left this week.`}
                </p>
              </div>
            </Section>
          )}

          <Section title="Issues" aside={stats.openIssues ? `${stats.openIssues} open` : undefined}>
            <IssueList issues={issues} empty="No issues on this vehicle." />
          </Section>
        </div>
      </div>
    </div>
  )
}
