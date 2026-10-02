"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useDeferredValue, useMemo, useState } from "react"
import { Apple, CircleAlert, Package, Search, Shirt, Store, Tv } from "lucide-react"
import { PARKING_LABEL, type Brand, type LiveStop, type LiveTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtDate, minToHHMM } from "@/lib/format"
import type { OutletOverviewRow } from "@/lib/types"
import { useLiveSnapshot } from "../live/use-live"
import { useOutletsOverview } from "../queries"
import { outletWindow } from "../shared/window"
import { LiveDot } from "./resource-ui"

type Filter = "all" | "today" | "issues" | Brand

/** Outlets at a glance: who they are, what is on its way today, and whether anything is wrong. */
export function OutletsPage({ wsUrl }: { wsUrl?: string }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const q = useDeferredValue(search.trim())
  const { data: outlets, isLoading } = useOutletsOverview(q)
  const { data: snap } = useLiveSnapshot(wsUrl)

  // outletId → the live stop (and its trip) happening today
  const liveByOutlet = useMemo(() => {
    const m = new Map<string, { trip: LiveTrip; stop: LiveStop }>()
    for (const trip of snap?.trips ?? []) for (const stop of trip.stops) m.set(stop.outletId, { trip, stop })
    return m
  }, [snap])

  const all = outlets ?? []
  const rows = all.filter((o) => (filter === "all" ? true : filter === "today" ? !!o.today : filter === "issues" ? o.openIssues > 0 : o.brand === filter))
  const withDelivery = all.filter((o) => o.today).length
  const atRisk = [...liveByOutlet.values()].filter(({ stop }) => stop.late && stop.status !== "COMPLETED").length

  return (
    <div className="grid gap-4">
      <PageHeader title="Outlets" description="Stores served from this depot. Open one for its order history, access rules and who to call." />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Store} label="Outlets" value={all.length || "—"} hint="Served from this depot" />
        <StatCard icon={Package} tone="blue" label="Delivery today" value={withDelivery} hint={`${all.length ? Math.round((withDelivery / all.length) * 100) : 0}% of outlets`} />
        <StatCard icon={CircleAlert} tone={atRisk || all.some((o) => o.openIssues) ? "red" : "green"} label="Need attention" value={atRisk + all.filter((o) => o.openIssues).length} hint={`${atRisk} projected late · ${all.filter((o) => o.openIssues).length} with open issues`} />
      </div>

      <Card size="sm" className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="today">Delivery today</TabsTrigger>
              <TabsTrigger value="issues">Open issues</TabsTrigger>
              <TabsTrigger value="FRESH">
                <Apple className="size-3.5" /> Fresh
              </TabsTrigger>
              <TabsTrigger value="STYLE">
                <Shirt className="size-3.5" /> Style
              </TabsTrigger>
              <TabsTrigger value="TECH">
                <Tv className="size-3.5" /> Tech
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative ml-auto">
            <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code or district…" className="h-7 w-52 pl-7 text-sm" />
          </div>
        </div>
        {isLoading ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : !rows.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No outlets match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Outlet</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Receives</TableHead>
                <TableHead>Today</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="pr-4">Last delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/dispatcher/outlets/${o.id}`)}>
                  <TableCell className="pl-4">
                    <Link href={`/dispatcher/outlets/${o.id}`} className="grid leading-tight hover:underline" onClick={(e) => e.stopPropagation()}>
                      <span className="font-medium">{o.name}</span>
                      <span className="text-[11px] text-muted-foreground">{o.id}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <BrandBadge brand={o.brand} />
                  </TableCell>
                  <TableCell className="text-xs">{o.districtId}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {outletWindow(o)}
                    {o.parkingConstraint !== "NORMAL" && (
                      <span className="ml-1.5 align-middle">
                        <TagBadge tone="violet">{PARKING_LABEL[o.parkingConstraint]}</TagBadge>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <TodayCell o={o} live={liveByOutlet.get(o.id)} />
                  </TableCell>
                  <TableCell>{o.openIssues ? <TagBadge tone="red">{o.openIssues} open</TagBadge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground">{o.lastDeliveredOn ? fmtDate(o.lastDeliveredOn, { day: "numeric", month: "short" }) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function TodayCell({ o, live }: { o: OutletOverviewRow; live?: { trip: LiveTrip; stop: LiveStop } }) {
  if (live) {
    const { trip, stop } = live
    if (stop.status === "COMPLETED")
      return (
        <span className="inline-flex items-center gap-1.5">
          <TagBadge tone="green">Delivered {minToHHMM(stop.completedMin ?? stop.etaMin)}</TagBadge>
          <span className="text-muted-foreground">{trip.vehicleId}</span>
        </span>
      )
    const color = stop.late ? "#ef4444" : stop.status === "IN_PROGRESS" ? "#3b82f6" : "#16a34a"
    return (
      <span className="inline-flex items-center gap-2">
        {(trip.status === "ON_ROUTE" || trip.status === "DELAYED" || trip.status === "AT_OUTLET") && <LiveDot color={color} />}
        <span className="font-medium">{stop.status === "IN_PROGRESS" ? "At outlet now" : `ETA ${minToHHMM(stop.etaMin)}`}</span>
        <span className="text-muted-foreground">
          {trip.vehicleId} · {trip.ref}
        </span>
        {stop.late && <TagBadge tone="red">Late</TagBadge>}
      </span>
    )
  }
  if (!o.today) return <span className="text-muted-foreground">No order</span>
  if (!o.today.trip) return <span className="text-muted-foreground">{o.today.orderRef} · not assigned</span>
  return (
    <span>
      <span className="font-medium">{o.today.trip.ref}</span>
      <span className="text-muted-foreground">
        {" "}
        · {o.today.trip.vehicleId}
        {o.today.plannedArrivalMin != null && ` · ${minToHHMM(o.today.plannedArrivalMin)}`}
      </span>
    </span>
  )
}
