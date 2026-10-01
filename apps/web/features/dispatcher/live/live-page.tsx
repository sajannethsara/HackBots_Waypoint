"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useTheme } from "next-themes"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  PackageCheck,
  Radar,
  Route,
  Search,
  Siren,
  Truck,
  Warehouse,
  Workflow,
} from "lucide-react"
import { Cell, Label, Pie, PieChart } from "recharts"
import type { LiveAlert, LiveSnapshot, LiveTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { minToHHMM, pct } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ClockControl } from "./clock-control"
import { STOP_COLOR, TRIP_COLOR, TRIP_TONE, isMoving, tripLabel } from "./status"
import { TripPanel } from "./trip-panel"
import { useLiveSnapshot } from "./use-live"

const MapSkeleton = () => <Skeleton className="size-full rounded-none" />
const GoogleLiveMap = dynamic(() => import("./map/google-live-map"), { ssr: false, loading: MapSkeleton })
const SchematicLiveMap = dynamic(() => import("./map/schematic-live-map"), { ssr: false, loading: MapSkeleton })

const STATUS_FILTERS = [
  { value: "all", label: "All status" },
  { value: "moving", label: "On the road" },
  { value: "DELAYED", label: "Delayed" },
  { value: "AT_OUTLET", label: "At outlet" },
  { value: "SCHEDULED", label: "Not departed" },
  { value: "COMPLETED", label: "Completed" },
]

export function LivePage({ mapsApiKey, wsUrl }: { mapsApiKey?: string; wsUrl?: string }) {
  const { data: snap, isLoading, link } = useLiveSnapshot(wsUrl)
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [brand, setBrand] = useState("all")
  const [status, setStatus] = useState("all")

  const trips = useMemo(
    () =>
      (snap?.trips ?? []).filter(
        (t) =>
          (brand === "all" || t.brand === brand) &&
          (status === "all" ||
            (status === "moving" ? isMoving(t.status) : status === "SCHEDULED" ? t.status === "SCHEDULED" || t.status === "LOADING" : t.status === status)) &&
          (!q || `${t.ref} ${t.vehicleId} ${t.driver?.name ?? ""} ${t.districtId} ${t.stops.map((s) => s.outletId).join(" ")}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [snap, brand, status, q],
  )
  const selected = snap?.trips.find((t) => t.id === selectedId) ?? null

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Live Operations"
        description="Vehicle positions, trip progress and delivery risk across the depot — updated live."
        actions={<ClockControl clock={snap?.clock} link={link} />}
      />

      {isLoading || !snap ? (
        <Skeleton className="h-[640px] rounded-xl" />
      ) : !snap.planId ? (
        <Empty className="min-h-[50vh] border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Radar />
            </EmptyMedia>
            <EmptyTitle>No published plan to track</EmptyTitle>
            <EmptyDescription>Publish today&apos;s plan and its trips appear here as they leave the depot.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
              <Workflow data-icon="inline-start" /> Go to planning
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <Kpis snap={snap} />

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card size="sm" className="relative h-[600px] gap-0 overflow-hidden p-0">
              {mapsApiKey ? (
                <GoogleLiveMap apiKey={mapsApiKey} snapshot={snap} trips={trips} selectedId={selectedId} onSelect={setSelectedId} theme={theme} />
              ) : (
                <SchematicLiveMap snapshot={snap} trips={trips} selectedId={selectedId} onSelect={setSelectedId} theme={theme} />
              )}

              {/* Toolbar */}
              <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
                <div className="pointer-events-auto relative">
                  <Search className="absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vehicle, trip, outlet, driver" className="h-8 w-60 bg-background/95 pl-8 shadow-sm backdrop-blur" />
                </div>
                <div className="pointer-events-auto flex gap-2">
                  <MapSelect value={brand} onChange={setBrand} options={[{ value: "all", label: "All brands" }, { value: "FRESH", label: "Fresh" }, { value: "STYLE", label: "Style" }, { value: "TECH", label: "Tech" }]} />
                  <MapSelect value={status} onChange={setStatus} options={STATUS_FILTERS} />
                </div>
              </div>

              <Legend />

              {selected && (
                <div className="absolute top-14 right-3 bottom-3 w-80 max-sm:inset-x-3 max-sm:w-auto">
                  <TripPanel trip={selected} onClose={() => setSelectedId(null)} />
                </div>
              )}
            </Card>

            <div className="grid content-start gap-3">
              <StatusDonut snap={snap} />
              <Alerts alerts={snap.alerts} onSelect={setSelectedId} />
            </div>
          </div>

          <ActiveTrips trips={trips} total={snap.trips.length} selectedId={selectedId} onSelect={(id) => {
            setSelectedId(id)
            window.scrollTo({ top: 0, behavior: "smooth" })
          }} />
        </>
      )}
    </div>
  )
}

function Kpis({ snap }: { snap: LiveSnapshot }) {
  const k = snap.kpis
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard icon={Truck} tone="green" label="Vehicles on road" value={k.vehiclesOnRoad} hint={`${pct(k.vehiclesOnRoad, k.fleetAvailable)}% of ${k.fleetAvailable} available`} />
      <StatCard icon={Route} tone="blue" label="Active trips" value={k.activeTrips} hint={`${k.totalTrips} trips planned`} />
      <StatCard icon={Clock} tone="green" label="On time" value={k.onTime} hint={k.activeTrips ? `${pct(k.onTime, k.activeTrips)}% of active` : "—"} />
      <StatCard icon={Siren} tone={k.delayed ? "red" : "gray"} label="Delayed" value={k.delayed} hint="15+ min behind plan" />
      <StatCard icon={Warehouse} tone="violet" label="At depot" value={k.atDepot} hint={`${k.completedTrips} trips completed`} />
      <StatCard icon={PackageCheck} tone="amber" label="Deliveries" value={`${k.stopsDone}/${k.stopsTotal}`} hint={`${pct(k.stopsDone, k.stopsTotal)}% complete`} />
    </div>
  )
}

function MapSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger size="sm" className="h-8 w-36 bg-background/95 shadow-sm backdrop-blur">
        <SelectValue>{(v: string) => options.find((o) => o.value === v)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Legend() {
  const items: [string, string, "ring" | "fill" | "vehicle"][] = [
    ["On route", TRIP_COLOR.ON_ROUTE, "vehicle"],
    ["Delayed", TRIP_COLOR.DELAYED, "vehicle"],
    ["At outlet", TRIP_COLOR.AT_OUTLET, "vehicle"],
    ["Returning", TRIP_COLOR.RETURNING, "vehicle"],
    ["Outlet planned", STOP_COLOR.PENDING, "ring"],
    ["Outlet delivered", STOP_COLOR.COMPLETED, "fill"],
    ["Outlet in progress", STOP_COLOR.IN_PROGRESS, "fill"],
    ["Outlet at risk", STOP_COLOR.LATE, "ring"],
  ]
  return (
    <div className="absolute bottom-3 left-3 hidden gap-1 rounded-lg border bg-background/95 p-2.5 text-[11px] shadow-sm backdrop-blur sm:grid">
      {items.map(([label, color, kind]) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={cn("block rounded-full", kind === "vehicle" ? "size-3 ring-2 ring-background" : "size-2.5 border-2")}
            style={kind === "ring" ? { borderColor: color } : { background: color, borderColor: color }}
          />
          {label}
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2 border-t pt-1.5 text-muted-foreground">
        <span className="h-0.5 w-4 rounded bg-foreground/70" /> travelled
        <span className="h-0.5 w-4 border-t-2 border-dotted border-foreground/60" /> ahead
      </div>
    </div>
  )
}

const donutConfig = {
  onTime: { label: "On time", color: TRIP_COLOR.ON_ROUTE },
  delayed: { label: "Delayed", color: TRIP_COLOR.DELAYED },
  depot: { label: "Not departed", color: TRIP_COLOR.SCHEDULED },
  done: { label: "Completed", color: TRIP_COLOR.COMPLETED },
} satisfies ChartConfig

function StatusDonut({ snap }: { snap: LiveSnapshot }) {
  const k = snap.kpis
  const notDeparted = k.totalTrips - k.activeTrips - k.completedTrips
  const rows = [
    { key: "onTime", value: k.onTime },
    { key: "delayed", value: k.delayed },
    { key: "depot", value: notDeparted },
    { key: "done", value: k.completedTrips },
  ]
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Operational status</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <ChartContainer config={donutConfig} className="aspect-square h-32 shrink-0">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie data={rows} dataKey="value" nameKey="key" innerRadius={40} outerRadius={56} strokeWidth={2} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.key} fill={donutConfig[r.key as keyof typeof donutConfig].color} />
              ))}
              <Label
                content={({ viewBox }) =>
                  viewBox && "cx" in viewBox ? (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-lg font-semibold">
                        {k.totalTrips}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 15} className="fill-muted-foreground text-[10px]">
                        trips
                      </tspan>
                    </text>
                  ) : null
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="grid flex-1 gap-1.5 text-xs">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: donutConfig[r.key as keyof typeof donutConfig].color }} />
              <span className="flex-1 text-muted-foreground">{donutConfig[r.key as keyof typeof donutConfig].label}</span>
              <span className="font-medium tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const ALERT_ICON = { high: AlertTriangle, medium: Clock, low: Info, ok: CheckCircle2 }
const ALERT_TONE = { high: "text-red-600", medium: "text-amber-600", low: "text-sky-600", ok: "text-emerald-600" }

function Alerts({ alerts, onSelect }: { alerts: LiveAlert[]; onSelect: (id: string) => void }) {
  return (
    <Card size="sm" className="gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Recent alerts
          {!!alerts.filter((a) => a.severity === "high").length && <TagBadge tone="red">{alerts.filter((a) => a.severity === "high").length}</TagBadge>}
        </CardTitle>
      </CardHeader>
      <ScrollArea className="h-[350px]">
        <CardContent className="grid gap-0.5">
          {!alerts.length && <p className="py-8 text-center text-sm text-muted-foreground">Quiet so far. Alerts appear as trips run.</p>}
          {alerts.map((a) => {
            const Icon = ALERT_ICON[a.severity]
            return (
              <button key={a.id} onClick={() => onSelect(a.tripId)} className="-mx-1.5 flex items-start gap-2.5 rounded-md px-1.5 py-2 text-left hover:bg-muted/60">
                <Icon className={cn("mt-0.5 size-4 shrink-0", ALERT_TONE[a.severity])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-tight font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{minToHHMM(Math.floor(a.atMin))}</span>
              </button>
            )
          })}
        </CardContent>
      </ScrollArea>
    </Card>
  )
}

function ActiveTrips({ trips, total, selectedId, onSelect }: { trips: LiveTrip[]; total: number; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle>
          Trips <span className="font-normal text-muted-foreground">({trips.length} of {total})</span>
        </CardTitle>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="pl-4">Trip</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Outlets</TableHead>
            <TableHead className="w-40">Progress</TableHead>
            <TableHead>Current location</TableHead>
            <TableHead>Next stop</TableHead>
            <TableHead className="text-right">ETA</TableHead>
            <TableHead className="pr-4">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trips.map((t) => (
            <TableRow key={t.id} data-state={t.id === selectedId ? "selected" : undefined} className="cursor-pointer" onClick={() => onSelect(t.id)}>
              <TableCell className="pl-4 font-medium">{t.ref}</TableCell>
              <TableCell>{t.vehicleId}</TableCell>
              <TableCell className="text-muted-foreground">{t.driver?.name ?? "—"}</TableCell>
              <TableCell>
                <BrandBadge brand={t.brand} />
              </TableCell>
              <TableCell className="tabular-nums">
                {t.stopsDone} / {t.stops.length}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={t.progressPct} className="h-1.5 flex-1" />
                  <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{t.progressPct}%</span>
                </div>
              </TableCell>
              <TableCell className="text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ background: TRIP_COLOR[t.status] }} />
                  {t.locationLabel}
                </span>
              </TableCell>
              <TableCell className="text-xs">{t.nextStop ? t.nextStop.outletId : "—"}</TableCell>
              <TableCell className={cn("text-right tabular-nums", t.delayMin >= 15 && "text-red-600")}>
                {t.nextStop ? minToHHMM(t.nextStop.etaMin) : minToHHMM(t.etaReturnMin)}
              </TableCell>
              <TableCell className="pr-4">
                <span className="inline-flex items-center gap-1">
                  <TagBadge tone={TRIP_TONE[t.status]}>{tripLabel(t.status)}</TagBadge>
                  {t.delayMin >= 15 && <TagBadge tone="red">+{t.delayMin}m</TagBadge>}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
