"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Search, Snowflake, Truck, Wrench } from "lucide-react"
import { StatusBadge, TagBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtNum } from "@/lib/format"
import { useLiveSnapshot } from "../live/use-live"
import { TRIP_COLOR, TRIP_TONE, tripLabel } from "../live/status"
import { useCurrentPlan, useVehicles } from "../queries"
import { LIVE_ACTIVE, LiveDot } from "./resource-ui"

/** Fleet at a glance. Everything beyond what a dispatcher scans for lives on the vehicle's own page. */
export function VehiclesPage({ wsUrl }: { wsUrl?: string }) {
  const router = useRouter()
  const { data: vehicles, isLoading } = useVehicles()
  const { data: plan } = useCurrentPlan()
  const { data: snap } = useLiveSnapshot(wsUrl)
  const [filter, setFilter] = useState("all")
  const [q, setQ] = useState("")
  const planned = useMemo(() => plan?.trips.filter((t) => t.stops.length) ?? [], [plan])

  const rows = (vehicles ?? [])
    .filter((v) => (filter === "all" ? true : filter === "reefer" ? v.temp === "REEFER" : filter === "van" ? v.type === "VAN" : filter === "live" ? snap?.trips.some((t) => t.vehicleId === v.id && LIVE_ACTIVE.includes(t.status)) : v.status === "IN_WORKSHOP"))
    .filter((v) => !q.trim() || v.id.toLowerCase().includes(q.trim().toLowerCase()) || v.driver?.name.toLowerCase().includes(q.trim().toLowerCase()))
  const count = (f: (v: NonNullable<typeof vehicles>[number]) => boolean) => vehicles?.filter(f).length ?? 0
  const liveCount = new Set(snap?.trips.filter((t) => LIVE_ACTIVE.includes(t.status)).map((t) => t.vehicleId)).size

  return (
    <div className="grid gap-4">
      <PageHeader title="Vehicles" description="Fleet availability and who is on the road. Open a vehicle for its full specs and trip history." />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard icon={Truck} label="Available" value={`${count((v) => v.status === "AVAILABLE")} / ${vehicles?.length ?? "—"}`} hint={`${new Set(planned.map((t) => t.vehicleId)).size} on today's plan`} />
        <StatCard icon={Truck} tone="green" label="On the road now" value={liveCount} hint="Loading, driving or returning" />
        <StatCard icon={Snowflake} tone="blue" label="Reefers available" value={`${count((v) => v.temp === "REEFER" && v.status === "AVAILABLE")} / ${count((v) => v.temp === "REEFER")}`} hint="Only reefers carry chilled goods" />
        <StatCard icon={Wrench} tone="amber" label="In workshop" value={count((v) => v.status === "IN_WORKSHOP")} hint="Excluded from planning" />
      </div>
      <Card size="sm" className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="live">On the road</TabsTrigger>
              <TabsTrigger value="reefer">Reefers</TabsTrigger>
              <TabsTrigger value="van">Vans</TabsTrigger>
              <TabsTrigger value="workshop">Workshop</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative ml-auto">
            <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vehicle or driver…" className="h-7 w-48 pl-7 text-sm" />
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="m-3 h-64" />
        ) : !rows.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No vehicles match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Vehicle</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Today</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => {
                const live = snap?.trips.filter((t) => t.vehicleId === v.id) ?? []
                const active = live.find((t) => LIVE_ACTIVE.includes(t.status))
                const mine = planned.filter((t) => t.vehicleId === v.id)
                return (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => router.push(`/dispatcher/vehicles/${v.id}`)}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/dispatcher/vehicles/${v.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {v.id}
                        </Link>
                        <span className="text-xs text-muted-foreground capitalize">{v.type.toLowerCase()}</span>
                        {v.temp === "REEFER" && <TagBadge tone="blue">Reefer</TagBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {fmtNum(v.weightCapKg)} kg · {fmtNum(v.volumeCapM3, 1)} m³
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.driver?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {active ? (
                        <span className="inline-flex items-center gap-2">
                          <LiveDot color={TRIP_COLOR[active.status]} />
                          <TagBadge tone={TRIP_TONE[active.status]}>{tripLabel(active.status)}</TagBadge>
                          <span className="font-medium">{active.ref}</span>
                          {active.delayMin > 0 && <span className="text-red-600">+{active.delayMin}m</span>}
                        </span>
                      ) : mine.length ? (
                        mine.map((t) => t.ref).join(", ")
                      ) : (
                        <span className="text-muted-foreground">Idle</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <StatusBadge status={v.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
