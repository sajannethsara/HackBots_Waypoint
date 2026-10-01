"use client"

import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  CircleAlert,
  ClipboardList,
  Info,
  Sparkles,
  Truck,
  Workflow,
} from "lucide-react"
import { Bar, BarChart, Cell, Label, Pie, PieChart, XAxis } from "recharts"
import { BrandBadge, StatusBadge, TagBadge, TONE } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtTime, minToHHMM, pct } from "@/lib/format"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useDashboard } from "../queries"

export function CommandCenter() {
  const { data, isLoading } = useDashboard()

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Command Center"
        description="Today at a glance — what is planned, what is moving, and what needs you."
        actions={
          <>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dispatcher/orders" />}>
              <ClipboardList data-icon="inline-start" /> Orders
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
              <Sparkles data-icon="inline-start" /> {data?.plan ? "Open plan" : "Generate plan"}
            </Button>
          </>
        }
      />
      {isLoading || !data ? <LoadingGrid /> : <Body data={data} />}
    </div>
  )
}

function Body({ data }: { data: Dashboard }) {
  const k = data.kpis
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardList} tone="blue" label="Confirmed orders" value={k.confirmedOrders} hint={`${k.chilledOrders} chilled · closed 16:00 yesterday`} />
        <StatCard
          icon={Workflow}
          tone="green"
          label="Planned orders"
          value={k.planned}
          hint={data.plan ? `Plan v${data.plan.version} · ${data.plan.status.toLowerCase()}` : "No plan yet"}
          aside={<span className="text-lg font-semibold text-primary tabular-nums">{k.coveragePct}%</span>}
        />
        <StatCard icon={AlertTriangle} tone={k.deferred ? "amber" : "gray"} label="Deferred" value={k.deferred} hint={`${data.actions.length} items need action`} />
        <StatCard
          icon={Truck}
          tone="violet"
          label="Vehicles in use"
          value={
            <>
              {k.vehiclesInUse}
              <span className="text-sm font-normal text-muted-foreground"> / {k.vehiclesAvailable}</span>
            </>
          }
          hint={`${k.vehiclesTotal - k.vehiclesAvailable} of ${k.vehiclesTotal} in workshop`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ActionRequired actions={data.actions} />
        <DeliveriesDonut data={data} />
        <BrandBars data={data} />
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <TripsTable data={data} />
        <CapacityPressure data={data} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Upcoming data={data} />
        <Activity data={data} />
      </div>
    </>
  )
}

const SEVERITY_ICON = { high: CircleAlert, medium: AlertTriangle, low: Info }
const SEVERITY_TONE = { high: "text-red-600", medium: "text-amber-600", low: "text-sky-600" }

function ActionRequired({ actions }: { actions: Dashboard["actions"] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Action required
          {!!actions.length && <TagBadge tone="red">{actions.length}</TagBadge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-0.5">
        {!actions.length && <p className="py-6 text-center text-sm text-muted-foreground">All clear. Nothing needs you right now.</p>}
        {actions.slice(0, 5).map((a) => {
          const Icon = SEVERITY_ICON[a.severity]
          return (
            <Link key={a.kind} href={a.href} className="-mx-2 flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60">
              <Icon className={cn("mt-0.5 size-4 shrink-0", SEVERITY_TONE[a.severity])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight font-medium">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{a.count}</span>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

const deliveryConfig = {
  planned: { label: "Planned", color: "var(--chart-4)" },
  outForDelivery: { label: "Out for delivery", color: "#0ea5e9" },
  delivered: { label: "Delivered", color: "var(--chart-2)" },
  deferred: { label: "Deferred", color: "#f59e0b" },
} satisfies ChartConfig

function DeliveriesDonut({ data }: { data: Dashboard }) {
  const d = data.deliveries
  const total = data.kpis.confirmedOrders
  const rows = [
    { key: "delivered", value: d.delivered },
    { key: "outForDelivery", value: d.outForDelivery },
    { key: "planned", value: Math.max(0, d.planned - d.delivered - d.outForDelivery) },
    { key: "deferred", value: d.deferred },
    { key: "unplanned", value: Math.max(0, total - d.planned - d.deferred) },
  ].filter((r) => r.value > 0)
  const color = (k: string) => (k in deliveryConfig ? deliveryConfig[k as keyof typeof deliveryConfig].color : "var(--muted)")

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Today&apos;s deliveries</CardTitle>
        <CardAction>
          <Button variant="link" size="xs" nativeButton={false} render={<Link href="/dispatcher/trips" />}>
            Trips <ArrowRight data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <ChartContainer config={deliveryConfig} className="aspect-square h-36 shrink-0">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie data={rows.length ? rows : [{ key: "unplanned", value: 1 }]} dataKey="value" nameKey="key" innerRadius={46} outerRadius={64} strokeWidth={2}>
              {(rows.length ? rows : [{ key: "unplanned" }]).map((r) => (
                <Cell key={r.key} fill={color(r.key)} />
              ))}
              <Label
                content={({ viewBox }) =>
                  viewBox && "cx" in viewBox ? (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-xl font-semibold">
                        {total}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-[10px]">
                        orders
                      </tspan>
                    </text>
                  ) : null
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="grid flex-1 gap-1.5 text-sm">
          {[
            ["Planned", d.planned, deliveryConfig.planned.color],
            ["Out for delivery", d.outForDelivery, deliveryConfig.outForDelivery.color],
            ["Delivered", d.delivered, deliveryConfig.delivered.color],
            ["Deferred", d.deferred, deliveryConfig.deferred.color],
          ].map(([label, v, c]) => (
            <div key={label as string} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: c as string }} />
              <span className="flex-1 text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">{v}</span>
              <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{pct(v as number, total)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const brandConfig = {
  planned: { label: "Planned", color: "var(--chart-4)" },
  deferred: { label: "Deferred", color: "#f59e0b" },
  pending: { label: "Not planned", color: "var(--border)" },
} satisfies ChartConfig

function BrandBars({ data }: { data: Dashboard }) {
  const rows = data.byBrand.map((b) => ({
    brand: b.brand.charAt(0) + b.brand.slice(1).toLowerCase(),
    planned: b.planned,
    deferred: b.deferred,
    pending: Math.max(0, b.total - b.planned - b.deferred),
  }))
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Orders by brand</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={brandConfig} className="h-40 w-full">
          <BarChart data={rows} barSize={36}>
            <XAxis dataKey="brand" tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="planned" stackId="a" fill="var(--color-planned)" radius={[0, 0, 4, 4]} />
            <Bar dataKey="deferred" stackId="a" fill="var(--color-deferred)" />
            <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function TripsTable({ data }: { data: Dashboard }) {
  return (
    <Card size="sm" className="xl:col-span-3">
      <CardHeader>
        <CardTitle>Today&apos;s trips</CardTitle>
        <CardAction>
          <Button variant="link" size="xs" nativeButton={false} render={<Link href="/dispatcher/trips" />}>
            All trips <ArrowRight data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {!data.trips.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No trips yet — generate today&apos;s plan.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Trip</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Last ETA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trips.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4 font-medium">{t.ref}</TableCell>
                  <TableCell className="text-muted-foreground">{t.vehicleId}</TableCell>
                  <TableCell>
                    <BrandBadge brand={t.brand} />
                  </TableCell>
                  <TableCell>{t.districtId}</TableCell>
                  <TableCell className="w-36">
                    <div className="flex items-center gap-2">
                      <Progress value={pct(t.done, t.stops)} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {t.done}/{t.stops}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{t.atRisk ? <TagBadge tone="amber">At risk</TagBadge> : <StatusBadge status={t.status} />}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{minToHHMM(t.eta)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Replaces the map tile: which resource is binding today, at a glance. */
function CapacityPressure({ data }: { data: Dashboard }) {
  const resources = data.plan?.summary?.resources ?? []
  return (
    <Card size="sm" className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Capacity pressure</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!resources.length && <p className="py-6 text-center text-sm text-muted-foreground">Generate a plan to see limiting resources.</p>}
        {resources.map((r) => {
          const ratio = r.capacity ? r.demand / r.capacity : 0
          const tone = ratio > 1 ? "bg-red-500" : ratio > 0.85 ? "bg-amber-500" : "bg-primary"
          return (
            <div key={r.key} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{r.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {r.demand} / {r.capacity} {r.unit}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
              </div>
            </div>
          )
        })}
        {!!data.plan?.summary?.limitingResources?.length && (
          <div className={cn("mt-1 rounded-lg p-2.5 text-xs ring-1 ring-inset", TONE.amber)}>
            <span className="font-medium">Limiting today: </span>
            {data.plan.summary.limitingResources.join(" · ")}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Upcoming({ data }: { data: Dashboard }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Next deliveries</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {!data.upcoming.length ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing scheduled yet.</p>
        ) : (
          <Table>
            <TableBody>
              {data.upcoming.map((u) => (
                <TableRow key={u.orderRef}>
                  <TableCell className="pl-4 font-medium tabular-nums">{minToHHMM(u.time)}</TableCell>
                  <TableCell>{u.outletId}</TableCell>
                  <TableCell>
                    <BrandBadge brand={u.brand} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.tripRef}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {u.atRisk ? <TagBadge tone="amber">At risk</TagBadge> : <TagBadge tone="blue">Scheduled</TagBadge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

const ACTION_LABEL: Record<string, string> = {
  PLAN_GENERATED: "Plan generated",
  PLAN_PUBLISHED: "Plan published",
  DECISION_OVERRIDDEN: "Order deferred by dispatcher",
  ORDER_ASSIGNED: "Order assigned manually",
}

function Activity({ data }: { data: Dashboard }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        {!data.activity.length && <p className="py-6 text-center text-sm text-muted-foreground">No activity yet today.</p>}
        {data.activity.map((a) => (
          <div key={a.id} className="flex items-start gap-3 text-sm">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{fmtTime(a.at)}</span>
            <span className="flex-1 font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
            <span className="truncate text-xs text-muted-foreground">
              {a.after && "served" in a.after ? `${a.after.served} served · ${a.after.deferred} deferred` : a.actor}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function LoadingGrid() {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-18.5 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
