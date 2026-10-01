"use client"

import { useState } from "react"
import { Snowflake, Truck, Wrench } from "lucide-react"
import { StatusBadge, TagBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtNum } from "@/lib/format"
import { useCurrentPlan, useVehicles } from "../queries"

export function VehiclesPage() {
  const { data: vehicles, isLoading } = useVehicles()
  const { data: plan } = useCurrentPlan()
  const [filter, setFilter] = useState("all")
  const trips = plan?.trips.filter((t) => t.stops.length) ?? []

  const rows = (vehicles ?? []).filter((v) =>
    filter === "all" ? true : filter === "reefer" ? v.temp === "REEFER" : filter === "van" ? v.type === "VAN" : v.status === "IN_WORKSHOP",
  )
  const count = (f: (v: NonNullable<typeof vehicles>[number]) => boolean) => vehicles?.filter(f).length ?? 0

  return (
    <div className="grid gap-4">
      <PageHeader title="Vehicles" description="Fleet capability, availability and today's assignments." />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Truck} label="Available" value={`${count((v) => v.status === "AVAILABLE")} / ${vehicles?.length ?? "—"}`} hint={`${new Set(trips.map((t) => t.vehicleId)).size} on today's plan`} />
        <StatCard icon={Snowflake} tone="blue" label="Reefers available" value={`${count((v) => v.temp === "REEFER" && v.status === "AVAILABLE")} / ${count((v) => v.temp === "REEFER")}`} hint="Only reefers may carry chilled goods" />
        <StatCard icon={Wrench} tone="amber" label="In workshop" value={count((v) => v.status === "IN_WORKSHOP")} hint="Excluded from planning" />
      </div>
      <Card size="sm" className="gap-0 py-0">
        <div className="border-b p-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="reefer">Reefers</TabsTrigger>
              <TabsTrigger value="van">Vans</TabsTrigger>
              <TabsTrigger value="workshop">Workshop</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {isLoading ? (
          <Skeleton className="m-3 h-64" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Vehicle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Temperature</TableHead>
                <TableHead className="text-right">Weight cap</TableHead>
                <TableHead className="text-right">Volume cap</TableHead>
                <TableHead className="text-right">km/L</TableHead>
                <TableHead className="text-right">Weekly quota</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Today</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => {
                const mine = trips.filter((t) => t.vehicleId === v.id)
                return (
                  <TableRow key={v.id}>
                    <TableCell className="pl-4 font-medium">{v.id}</TableCell>
                    <TableCell className="capitalize">{v.type.toLowerCase()}</TableCell>
                    <TableCell>{v.temp === "REEFER" ? <TagBadge tone="blue">Reefer</TagBadge> : <TagBadge>Ambient</TagBadge>}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(v.weightCapKg)} kg</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(v.volumeCapM3, 1)} m³</TableCell>
                    <TableCell className="text-right tabular-nums">{v.kmPerL}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(v.weeklyFuelQuotaL)} L</TableCell>
                    <TableCell className="text-muted-foreground">{v.driver?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{mine.length ? mine.map((t) => t.ref).join(", ") : <span className="text-muted-foreground">Idle</span>}</TableCell>
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
