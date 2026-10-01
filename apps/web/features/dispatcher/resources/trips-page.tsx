"use client"

import Link from "next/link"
import { Fragment, useState } from "react"
import { ChevronRight, Workflow } from "lucide-react"
import { BrandBadge, StatusBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtNum, minToHHMM, pct } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useCurrentPlan } from "../queries"
import { outletWindow } from "../shared/window"

export function TripsPage() {
  const { data: plan, isLoading } = useCurrentPlan()
  const [open, setOpen] = useState<string | null>(null)
  const trips = plan?.trips.filter((t) => t.stops.length) ?? []

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Trips"
        description={plan ? `Plan v${plan.version} · ${plan.status.toLowerCase()} · ${trips.length} trips` : "No plan for this day yet."}
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
            <Workflow data-icon="inline-start" /> Planning
          </Button>
        }
      />
      <Card size="sm" className="gap-0 py-0">
        {isLoading ? (
          <Skeleton className="m-3 h-64" />
        ) : !trips.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Generate and publish a plan to create trips.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-8 pl-4" />
                <TableHead>Trip</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>District</TableHead>
                <TableHead className="text-right">Stops</TableHead>
                <TableHead className="text-right">Depart</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Fill</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((t) => (
                <Fragment key={t.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(open === t.id ? null : t.id)}>
                    <TableCell className="pl-4">
                      <ChevronRight className={cn("size-4 transition-transform", open === t.id && "rotate-90")} />
                    </TableCell>
                    <TableCell className="font-medium">{t.ref}</TableCell>
                    <TableCell>
                      {t.vehicleId} <span className="text-xs text-muted-foreground">· {t.vehicle.temp === "REEFER" ? "reefer" : "ambient"} {t.vehicle.type.toLowerCase()}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.driver?.name ?? t.vehicle.driver?.name ?? "—"}</TableCell>
                    <TableCell>
                      <BrandBadge brand={t.brand} />
                    </TableCell>
                    <TableCell>{t.districtId}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.stops.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{minToHHMM(t.plannedDepartMin)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(t.plannedDurationMin)} min</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.max(pct(t.loadWeightKg, t.vehicle.weightCapKg), pct(t.loadVolumeM3, t.vehicle.volumeCapM3))}%
                    </TableCell>
                    <TableCell className="pr-4">
                      <StatusBadge status={t.status} />
                    </TableCell>
                  </TableRow>
                  {open === t.id && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={11} className="bg-muted/30 p-0">
                        <div className="grid gap-1 px-12 py-3">
                          {t.stops.map((s) => (
                            <div key={s.id} className="grid grid-cols-[24px_80px_110px_1fr_110px_90px_80px] items-center gap-2 text-xs">
                              <span className="font-medium">{s.seq}</span>
                              <span className="font-medium">{s.order.outlet.id}</span>
                              <span className="inline-flex items-center gap-1">
                                <TempIcon temp={s.order.temp} /> {s.order.ref}
                              </span>
                              <span className="text-muted-foreground">
                                {fmtNum(s.order.weightKg)} kg · {fmtNum(s.order.volumeM3, 2)} m³
                              </span>
                              <span className="tabular-nums">window {outletWindow(s.order.outlet)}</span>
                              <span className="tabular-nums">ETA {minToHHMM(s.plannedArrivalMin)}</span>
                              {s.atRisk ? <TagBadge tone="amber">At risk</TagBadge> : <StatusBadge status={s.status} />}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
