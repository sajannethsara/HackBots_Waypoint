"use client"

import Link from "next/link"
import { BellRing, CheckCircle2, LayoutDashboard, RefreshCw, Route } from "lucide-react"
import { DEFERRAL_REASON_META, type DeferralReason } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtNum, fmtTime, minToHHMM, pct } from "@/lib/format"
import type { Plan } from "@/lib/types"

export function PublishedStep({ plan, onReplan }: { plan: Plan; onReplan: () => void }) {
  const s = plan.summary
  const trips = plan.trips.filter((t) => t.stops.length)
  return (
    <div className="grid gap-3">
      <Card size="sm" className="flex-row flex-wrap items-center gap-4 px-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-5 text-primary" />
        </span>
        <div className="flex-1">
          <p className="font-medium">Plan v{plan.version} is live</p>
          <p className="text-sm text-muted-foreground">
            Published {plan.publishedAt ? fmtTime(plan.publishedAt) : ""} by {plan.publishedBy?.name ?? "dispatcher"}. Loaders see their load
            lists, drivers their runs, and {s.deferred} store{s.deferred === 1 ? "" : "s"} were told why their order moved.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onReplan}>
            <RefreshCw data-icon="inline-start" /> Replan (new version)
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dispatcher/trips" />}>
            <Route data-icon="inline-start" /> Trips
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/dispatcher" />}>
            <LayoutDashboard data-icon="inline-start" /> Command Center
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Orders served" value={`${s.served}/${s.orders}`} hint={`${s.coveragePct}% coverage`} />
        <Kpi label="Trips" value={trips.length} hint={`${s.vehiclesUsed} vehicles`} />
        <Kpi label="Volume moved" value={`${fmtNum(s.servedVolumeM3, 1)} m³`} hint={`of ${fmtNum(s.demandVolumeM3, 1)} m³ demand`} />
        <Kpi label="Deferred" value={s.deferred} hint={<span className="inline-flex items-center gap-1"><BellRing className="size-3" /> stores notified</span>} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card size="sm" className="gap-0 py-0 xl:col-span-2">
          <CardHeader className="border-b py-3">
            <CardTitle>Published trips</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Trip</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>District</TableHead>
                <TableHead className="text-right">Stops</TableHead>
                <TableHead className="text-right">Depart</TableHead>
                <TableHead className="pr-4 text-right">Fill</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4 font-medium">{t.ref}</TableCell>
                  <TableCell>{t.vehicleId}</TableCell>
                  <TableCell className="text-muted-foreground">{t.driver?.name ?? "—"}</TableCell>
                  <TableCell>
                    <BrandBadge brand={t.brand} />
                  </TableCell>
                  <TableCell>{t.districtId}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.stops.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{minToHHMM(t.plannedDepartMin)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">
                    {Math.max(pct(t.loadWeightKg, t.vehicle.weightCapKg), pct(t.loadVolumeM3, t.vehicle.volumeCapM3))}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Why orders were deferred</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {Object.entries(s.deferralsByReason).map(([r, n]) => (
              <div key={r} className="flex items-center justify-between text-sm">
                <span>{DEFERRAL_REASON_META[r as DeferralReason].label}</span>
                <TagBadge tone="red">{n}</TagBadge>
              </div>
            ))}
            {!Object.keys(s.deferralsByReason).length && <p className="text-sm text-muted-foreground">No deferrals.</p>}
            {!!s.limitingResources?.length && (
              <p className="mt-2 text-xs text-muted-foreground">Limiting resources: {s.limitingResources.join(", ")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return (
    <Card size="sm" className="gap-0.5 px-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </Card>
  )
}
