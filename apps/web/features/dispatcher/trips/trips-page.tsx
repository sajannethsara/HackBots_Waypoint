"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ChevronRight, CircleAlert, Gauge, Radar, Route, Search, Siren, Snowflake, Truck, Workflow } from "lucide-react"
import { BrandBadge, StatusBadge, TagBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtNum, minToHHMM } from "@/lib/format"
import type { TripRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import { TRIP_COLOR, TRIP_TONE, isMoving, tripLabel } from "../live/status"
import { useTrips } from "../queries"

const STATUS = [
  { value: "all", label: "All status" },
  { value: "moving", label: "On the road" },
  { value: "DELAYED", label: "Delayed" },
  { value: "waiting", label: "Not departed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "issues", label: "With open issues" },
]

export function TripsPage() {
  const router = useRouter()
  const { data, isLoading } = useTrips()
  const [brand, setBrand] = useState("ALL")
  const [status, setStatus] = useState("all")
  const [q, setQ] = useState("")

  const trips = useMemo(() => {
    const all = data?.trips ?? []
    return all.filter((t) => {
      const s = t.live?.status
      const statusOk =
        status === "all" ||
        (status === "moving" && s && isMoving(s)) ||
        (status === "DELAYED" && s === "DELAYED") ||
        (status === "waiting" && (!s || s === "SCHEDULED" || s === "LOADING")) ||
        (status === "COMPLETED" && s === "COMPLETED") ||
        (status === "issues" && t.openIssues > 0)
      return (
        (brand === "ALL" || t.brand === brand) &&
        statusOk &&
        (!q || `${t.ref} ${t.vehicleId} ${t.driver ?? ""} ${t.districtId}`.toLowerCase().includes(q.toLowerCase()))
      )
    })
  }, [data, brand, status, q])

  const all = data?.trips ?? []
  const moving = all.filter((t) => t.live && isMoving(t.live.status)).length
  const delayed = all.filter((t) => t.live?.status === "DELAYED").length
  const done = all.filter((t) => t.live?.status === "COMPLETED").length
  const issues = all.reduce((s, t) => s + t.openIssues, 0)
  const util = all.length ? Math.round(all.reduce((s, t) => s + t.utilPct, 0) / all.length) : 0

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Trips"
        description={
          data?.plan
            ? `Plan v${data.plan.version} · ${data.plan.status.toLowerCase()}${data.clock ? ` · operating time ${minToHHMM(Math.floor(data.clock.minute))}` : ""}`
            : "Every vehicle run for the day, with live status."
        }
        actions={
          <>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
              <Workflow data-icon="inline-start" /> Planning
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/dispatcher/live" />}>
              <Radar data-icon="inline-start" /> Live view
            </Button>
          </>
        }
      />

      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !data?.plan ? (
        <Empty className="min-h-[50vh] border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Route />
            </EmptyMedia>
            <EmptyTitle>No trips yet</EmptyTitle>
            <EmptyDescription>Trips are created when you generate the day&apos;s plan.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
              Go to planning
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={Route} tone="blue" label="Trips" value={all.length} hint={`${new Set(all.map((t) => t.vehicleId)).size} vehicles`} />
            <StatCard icon={Truck} tone="green" label="On the road" value={moving} hint={data.plan.status === "PUBLISHED" ? "Live" : "Plan not published"} />
            <StatCard icon={Siren} tone={delayed ? "red" : "gray"} label="Delayed" value={delayed} hint="15+ min behind" />
            <StatCard icon={Snowflake} tone="blue" label="Reefer trips" value={all.filter((t) => t.vehicleTemp === "REEFER").length} hint="Chilled capacity in use" />
            <StatCard icon={Gauge} tone="violet" label="Avg fill" value={`${util}%`} hint="Weight or volume, whichever binds" />
            <StatCard icon={CircleAlert} tone={issues ? "amber" : "gray"} label="Open issues" value={issues} hint={`${done} trips completed`} />
          </div>

          <Card size="sm" className="gap-0 py-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <Tabs value={brand} onValueChange={(v) => setBrand(String(v))}>
                <TabsList>
                  {(["ALL", "FRESH", "STYLE", "TECH"] as const).map((b) => (
                    <TabsTrigger key={b} value={b}>
                      {b === "ALL" ? "All" : b.charAt(0) + b.slice(1).toLowerCase()}
                      <span className="text-[11px] text-muted-foreground tabular-nums">{b === "ALL" ? all.length : all.filter((t) => t.brand === b).length}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Trip, vehicle, driver, district" className="h-7 w-56 pl-7 text-sm" />
                </div>
                <Select value={status} onValueChange={(v) => setStatus(String(v))}>
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue>{(v: string) => STATUS.find((s) => s.value === v)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">Trip</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Brand · district</TableHead>
                  <TableHead className="text-right">Depart</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead>Now</TableHead>
                  <TableHead className="text-right">Next ETA</TableHead>
                  <TableHead className="text-right">Fill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((t) => (
                  <TripRowView key={t.id} t={t} onOpen={() => router.push(`/dispatcher/trips/${t.id}`)} />
                ))}
              </TableBody>
            </Table>
            {!trips.length && <p className="p-10 text-center text-sm text-muted-foreground">No trips match these filters.</p>}
          </Card>
        </>
      )}
    </div>
  )
}

function TripRowView({ t, onOpen }: { t: TripRow; onOpen: () => void }) {
  const l = t.live
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="pl-4">
        <div className="grid leading-tight">
          <span className="font-medium">{t.ref}</span>
          <span className="text-[11px] text-muted-foreground">trip {t.tripNo} of vehicle</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          {t.vehicleId}
          {t.vehicleTemp === "REEFER" && <Snowflake className="size-3.5 text-sky-500" />}
          <span className="text-xs text-muted-foreground">{t.vehicleType.toLowerCase()}</span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{t.driver ?? "—"}</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          <BrandBadge brand={t.brand} /> {t.districtId}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{minToHHMM(t.plannedDepartMin)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress value={l?.progressPct ?? 0} className="h-1.5 flex-1" />
          <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
            {l?.stopsDone ?? 0}/{t.stops}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-44 truncate text-xs">
        {l ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: TRIP_COLOR[l.status] }} />
            {l.locationLabel}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t.stops} stops · {fmtNum(t.plannedKm)} km
          </span>
        )}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", (l?.delayMin ?? 0) >= 15 && "text-red-600")}>
        {l?.nextStop ? minToHHMM(l.nextStop.etaMin) : l ? minToHHMM(l.etaReturnMin) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">{t.utilPct}%</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1">
          {l ? <TagBadge tone={TRIP_TONE[l.status]}>{tripLabel(l.status)}</TagBadge> : <StatusBadge status="PLANNED" />}
          {l && l.delayMin >= 15 && <TagBadge tone="red">+{l.delayMin}m</TagBadge>}
          {t.openIssues > 0 && (
            <TagBadge tone="amber" title="Open issues">
              <CircleAlert className="size-3" /> {t.openIssues}
            </TagBadge>
          )}
        </span>
      </TableCell>
      <TableCell className="pr-4 text-right">
        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
      </TableCell>
    </TableRow>
  )
}
