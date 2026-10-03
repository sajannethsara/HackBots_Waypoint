"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, BellRing, Check, CirclePause, CirclePlay, Hand, LayoutDashboard, Radio, RefreshCw, Route, Timer, Truck, User, Warehouse } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { GATE_AUTO_START_MS } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtNum, fmtTime, minToHHMM, pct } from "@/lib/format"
import type { Plan, Trip } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useGate } from "../queries"

type GateState = "live" | "held" | "ready" | "waiting"
type Filter = "ALL" | GateState

const gateState = (t: Trip): GateState =>
  t.liveAt || t.status === "DEPARTED" || t.status === "COMPLETED" ? "live" : t.heldAt ? "held" : t.driverClaimedAt && t.loaderClaimedAt ? "ready" : "waiting"

/** When the gate opens by itself: a minute after the later of the two claims. */
const autoAt = (t: Trip) => (t.driverClaimedAt && t.loaderClaimedAt ? Math.max(Date.parse(t.driverClaimedAt), Date.parse(t.loaderClaimedAt)) + GATE_AUTO_START_MS : null)

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`

export function PublishedStep({ plan, onReplan }: { plan: Plan; onReplan: () => void }) {
  const trips = useMemo(() => plan.trips.filter((t) => t.stops.length), [plan.trips])
  const [filter, setFilter] = useState<Filter>("ALL")
  const count = (s: GateState) => trips.filter((t) => gateState(t) === s).length
  const shown = filter === "ALL" ? trips : trips.filter((t) => gateState(t) === filter)

  return (
    <div className="grid gap-3">
      <Card size="sm" className="flex-row flex-wrap items-center gap-4 px-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Warehouse className="size-5 text-primary" />
        </span>
        <div className="min-w-60 flex-1">
          <p className="font-medium">Plan v{plan.version} is published — depot gate is open for claims</p>
          <p className="text-sm text-muted-foreground">
            Published {plan.publishedAt ? fmtTime(plan.publishedAt) : ""} by {plan.publishedBy?.name ?? "dispatcher"}. A trip goes live once its driver and loader have both
            claimed it and you start it — or {GATE_AUTO_START_MS / 1000} seconds after the second claim, unless you hold it.
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Gauge icon={Radio} tone="green" label="Live" value={count("live")} total={trips.length} hint="released to drivers and the live board" />
        <Gauge icon={CirclePlay} tone="blue" label="Ready to go" value={count("ready")} total={trips.length} hint="driver and loader claimed" />
        <Gauge icon={Hand} tone="gray" label="Waiting for crew" value={count("waiting")} total={trips.length} hint="driver or loader has not claimed" />
        <Gauge icon={CirclePause} tone="amber" label="Held" value={count("held")} total={trips.length} hint="kept at the depot by you" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card size="sm" className="gap-0 py-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Depot gate</p>
            <TagBadge tone="gray">{trips.length} trips</TagBadge>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="ml-auto">
              <TabsList>
                {(
                  [
                    ["ALL", "All", trips.length],
                    ["waiting", "Waiting", count("waiting")],
                    ["ready", "Ready", count("ready")],
                    ["held", "Held", count("held")],
                    ["live", "Live", count("live")],
                  ] as const
                ).map(([v, label, n]) => (
                  <TabsTrigger key={v} value={v} className="text-xs">
                    {label} <span className="text-[10px] text-muted-foreground">{n}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <ScrollArea className="h-140 w-full">
            <Table className="min-w-215">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="text-xs">
                  <TableHead className="pl-4">Trip</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead className="text-right">Depart</TableHead>
                  <TableHead>Claimed by driver</TableHead>
                  <TableHead>Claimed by loader</TableHead>
                  <TableHead className="pr-4 text-right">Gate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((t) => (
                  <GateRow key={t.id} trip={t} />
                ))}
                {!shown.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No trips here.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        <Analytics plan={plan} trips={trips} />
      </div>
    </div>
  )
}

function Claim({ name, at, icon: Icon, empty }: { name: string | null; at: string | null; icon: typeof User; empty: string }) {
  return at ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/15 ring-inset dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
      <Check className="size-3" /> {name ?? "Claimed"}
      <span className="font-normal opacity-70">{fmtTime(at)}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground ring-1 ring-border ring-inset">
      <Icon className="size-3" /> {name ?? empty}
    </span>
  )
}

function GateRow({ trip: t }: { trip: Trip }) {
  const router = useRouter()
  const gate = useGate()
  const now = useNow()
  const state = gateState(t)
  const at = autoAt(t)
  const left = at && state === "ready" ? Math.max(0, Math.ceil((at - now) / 1000)) : null
  const busy = gate.start.isPending || gate.hold.isPending || gate.release.isPending
  const live = state === "live"
  return (
    <TableRow
      className={cn(live && "cursor-pointer", state === "held" && "bg-amber-50/50 dark:bg-amber-500/5")}
      onClick={live ? () => router.push(`/dispatcher/trips/${t.id}`) : undefined}
    >
      <TableCell className="pl-4 font-medium">{t.ref}</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Truck className="size-3" /> {t.vehicleId}
        </span>
      </TableCell>
      <TableCell>
        <BrandBadge brand={t.brand} />
      </TableCell>
      <TableCell>{t.districtId}</TableCell>
      <TableCell className="text-right tabular-nums">{minToHHMM(t.plannedDepartMin)}</TableCell>
      <TableCell>
        <Claim name={t.driver?.name ?? t.vehicle.driver?.name ?? null} at={t.driverClaimedAt} icon={User} empty="No driver assigned" />
      </TableCell>
      <TableCell>
        <Claim name={t.loader?.name ?? null} at={t.loaderClaimedAt} icon={Hand} empty="Waiting for loader" />
      </TableCell>
      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          {live ? (
            <Button variant="ghost" size="xs" className="text-emerald-700 dark:text-emerald-300" onClick={() => router.push(`/dispatcher/trips/${t.id}`)}>
              <Radio data-icon="inline-start" /> Live <ArrowUpRight data-icon="inline-end" />
            </Button>
          ) : state === "held" ? (
            <>
              <TagBadge tone="amber">Held</TagBadge>
              <Button size="xs" disabled={busy} onClick={() => gate.release.mutate(t.id)}>
                {gate.release.isPending ? <Spinner /> : <CirclePlay data-icon="inline-start" />} Release
              </Button>
            </>
          ) : (
            <>
              {left !== null && (
                <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums" title="Starts by itself unless you hold it">
                  <Timer className="size-3" /> {clock(left)}
                </span>
              )}
              <Button size="xs" disabled={state !== "ready" || busy} onClick={() => gate.start.mutate(t.id)}>
                {gate.start.isPending ? <Spinner /> : <CirclePlay data-icon="inline-start" />} Start
              </Button>
              <Button variant="outline" size="xs" disabled={state !== "ready" || busy} onClick={() => gate.hold.mutate(t.id)}>
                <CirclePause data-icon="inline-start" /> Hold
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

const TONES = {
  green: "text-emerald-600 dark:text-emerald-400",
  blue: "text-sky-600 dark:text-sky-400",
  amber: "text-amber-600 dark:text-amber-400",
  gray: "text-muted-foreground",
} as const

function Gauge({ icon: Icon, tone, label, value, total, hint }: { icon: typeof Radio; tone: keyof typeof TONES; label: string; value: number; total: number; hint: string }) {
  return (
    <Card size="sm" className="gap-1 px-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", TONES[tone])} /> {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums">
        {value}
        <span className="text-sm font-normal text-muted-foreground"> / {total}</span>
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-current transition-[width] duration-500", TONES[tone])} style={{ width: `${pct(value, total)}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </Card>
  )
}

// ── analytics ──────────────────────────────────────────────────────────────

function Bar({ label, value, max, right }: { label: string; value: number; max: number; right: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{right}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct(value, max)}%` }} />
      </div>
    </div>
  )
}

/** What the published plan commits the depot to: load, distance, fuel, timing and where the pressure is. */
function Analytics({ plan, trips }: { plan: Plan; trips: Trip[] }) {
  const s = plan.summary
  const a = useMemo(() => {
    const stops = trips.flatMap((t) => t.stops)
    const km = trips.reduce((x, t) => x + t.plannedKm, 0)
    const fuel = trips.reduce((x, t) => x + t.plannedFuelL, 0)
    const util = trips.map((t) => Math.max(pct(t.loadWeightKg, t.vehicle.weightCapKg), pct(t.loadVolumeM3, t.vehicle.volumeCapM3)))
    const byBrand = (["FRESH", "STYLE", "TECH"] as const).map((b) => ({ b, trips: trips.filter((t) => t.brand === b).length, stops: trips.filter((t) => t.brand === b).reduce((x, t) => x + t.stops.length, 0) }))
    const districts = Object.entries(
      trips.reduce<Record<string, number>>((m, t) => ({ ...m, [t.districtId]: (m[t.districtId] ?? 0) + t.stops.length }), {}),
    )
      .toSorted((x, y) => y[1] - x[1])
      .slice(0, 5)
    const departs = trips.map((t) => t.plannedDepartMin)
    const returns = trips.map((t) => t.plannedDepartMin + t.plannedDurationMin)
    return {
      stops: stops.length,
      atRisk: stops.filter((x) => x.atRisk).length,
      riskyTrips: trips.filter((t) => t.stops.some((x) => x.atRisk)).length,
      km,
      fuel,
      avgUtil: util.length ? Math.round(util.reduce((x, y) => x + y, 0) / util.length) : 0,
      tight: util.filter((u) => u > 90).length,
      reefers: trips.filter((t) => t.vehicle.temp === "REEFER").length,
      byBrand,
      districts,
      first: departs.length ? Math.min(...departs) : 0,
      last: returns.length ? Math.max(...returns) : 0,
    }
  }, [trips])

  return (
    <Card size="sm" className="gap-0 py-0">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <p className="text-sm font-semibold">Plan analytics</p>
        <span className="text-xs text-muted-foreground">v{plan.version}</span>
      </div>
      <ScrollArea className="h-140">
        <div className="grid gap-5 p-4">
          <dl className="grid grid-cols-2 gap-2">
            <Stat label="Orders served" value={`${s.served}/${s.orders}`} hint={`${s.coveragePct}% coverage`} />
            <Stat label="Volume moved" value={`${fmtNum(s.servedVolumeM3, 1)} m³`} hint={`of ${fmtNum(s.demandVolumeM3, 1)} m³`} />
            <Stat label="Distance" value={`${fmtNum(a.km)} km`} hint={`${fmtNum(a.fuel)} L planned fuel`} />
            <Stat label="Avg fill" value={`${a.avgUtil}%`} hint={a.tight ? `${a.tight} trips above 90%` : "no trip above 90%"} />
            <Stat label="Operating window" value={`${minToHHMM(a.first)}–${minToHHMM(a.last)}`} hint="first out, last back" />
            <Stat label="Stops at risk" value={a.atRisk} hint={a.atRisk ? `across ${a.riskyTrips} trips` : "all within window"} />
          </dl>

          <section className="grid gap-2.5">
            <p className="text-xs font-medium">Workload by brand</p>
            {a.byBrand.map((b) => (
              <Bar key={b.b} label={b.b.charAt(0) + b.b.slice(1).toLowerCase()} value={b.stops} max={a.stops} right={`${b.trips} trips · ${b.stops} stops`} />
            ))}
          </section>

          <section className="grid gap-2.5">
            <p className="text-xs font-medium">Busiest districts</p>
            {a.districts.map(([d, n]) => (
              <Bar key={d} label={d} value={n} max={a.districts[0]?.[1] ?? 1} right={`${n} stops`} />
            ))}
          </section>

          <section className="grid gap-1.5 rounded-lg border p-3 text-xs">
            <p className="flex items-center gap-1.5 font-medium">
              <BellRing className="size-3.5" /> Store notifications
            </p>
            <p className="text-muted-foreground">
              {s.served} stores were told their delivery time; {s.deferred} {s.deferred === 1 ? "store was" : "stores were"} told why their order moved.
              {!!s.limitingResources?.length && ` Tightest resources: ${s.limitingResources.join(", ")}.`}
            </p>
          </section>
        </div>
      </ScrollArea>
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-card px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
