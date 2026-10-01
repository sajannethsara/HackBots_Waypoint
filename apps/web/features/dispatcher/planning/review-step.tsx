"use client"

import { Fragment, useMemo, useState } from "react"
import { AlertTriangle, ArrowDownToLine, Clock, Fuel, PackageCheck, Search, Send, Snowflake, Trash2, User, Warehouse } from "lucide-react"
import { RULES, type Brand } from "@waypoint/shared"
import { BrandBadge, ReasonBadge, TagBadge, TempIcon, TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fmtNum, minToHHMM, pct } from "@/lib/format"
import type { Decision, Plan, Trip } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useDiscardPlan, usePublishPlan } from "../queries"
import { ScoreBreakdown } from "../shared/score-breakdown"
import { outletWindow } from "../shared/window"
import { AssignDialog } from "./assign-dialog"
import { DeferSheet } from "./defer-sheet"

export function ReviewStep({ plan }: { plan: Plan }) {
  const trips = useMemo(() => plan.trips.filter((t) => t.stops.length), [plan.trips])
  const [brand, setBrand] = useState<"ALL" | Brand>("ALL")
  const [q, setQ] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deferring, setDeferring] = useState<Decision | null>(null)
  const [assigning, setAssigning] = useState<Decision | null>(null)

  const visible = trips.filter(
    (t) =>
      (brand === "ALL" || t.brand === brand) &&
      (!q || `${t.ref} ${t.vehicleId} ${t.districtId}`.toLowerCase().includes(q.toLowerCase())),
  )
  const selected = trips.find((t) => t.id === selectedId) ?? visible[0] ?? trips[0]
  const deferred = plan.decisions.filter((d) => d.decision === "DEFERRED")
  const atRiskTrips = trips.filter((t) => t.stops.some((s) => s.atRisk)).length
  const decisionByOrder = useMemo(() => new Map(plan.decisions.map((d) => [d.orderId, d])), [plan.decisions])

  return (
    <div className="grid gap-3">
      <ReviewBar plan={plan} atRiskTrips={atRiskTrips} deferred={deferred.length} trips={trips.length} />

      <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Trip list */}
        <Card size="sm" className="gap-2 py-3 xl:h-[640px]">
          <div className="grid gap-2 px-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Trips ({trips.length})</p>
            </div>
            <Tabs value={brand} onValueChange={(v) => setBrand(v as typeof brand)}>
              <TabsList className="w-full">
                {(["ALL", "FRESH", "STYLE", "TECH"] as const).map((b) => (
                  <TabsTrigger key={b} value={b} className="text-xs">
                    {b === "ALL" ? "All" : b.charAt(0) + b.slice(1).toLowerCase()}
                    <span className="text-[10px] text-muted-foreground">{b === "ALL" ? trips.length : trips.filter((t) => t.brand === b).length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Trip, vehicle, district" className="h-7 pl-7 text-sm" />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-3 max-xl:h-72">
            <div className="grid gap-1.5 pb-1">
              {visible.map((t) => (
                <TripCard key={t.id} trip={t} active={selected?.id === t.id} onClick={() => setSelectedId(t.id)} />
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Stops */}
        {selected ? (
          <StopsCard trip={selected} decisionByOrder={decisionByOrder} onDefer={setDeferring} />
        ) : (
          <Card size="sm" className="items-center justify-center text-sm text-muted-foreground">
            No trips in this plan.
          </Card>
        )}

        {/* Inspector */}
        {selected && <TripInspector trip={selected} plan={plan} />}
      </div>

      <DeferredQueue deferred={deferred} onAssign={setAssigning} onDefer={setDeferring} />

      <DeferSheet key={`defer-${deferring?.orderId ?? "none"}`} planId={plan.id} decision={deferring} onClose={() => setDeferring(null)} />
      <AssignDialog key={`assign-${assigning?.orderId ?? "none"}`} plan={plan} decision={assigning} onClose={() => setAssigning(null)} />
    </div>
  )
}

function ReviewBar({ plan, atRiskTrips, deferred, trips }: { plan: Plan; atRiskTrips: number; deferred: number; trips: number }) {
  const publish = usePublishPlan(plan.id)
  const discard = useDiscardPlan(plan.id)
  const s = plan.summary
  return (
    <Card size="sm" className="flex-row flex-wrap items-center gap-2 px-3">
      <TagBadge tone="green">
        {s.served}/{s.orders} served · {s.coveragePct}%
      </TagBadge>
      <TagBadge tone="gray">{trips} trips · {s.vehiclesUsed} vehicles</TagBadge>
      {deferred > 0 && <TagBadge tone="red">{deferred} deferred</TagBadge>}
      {atRiskTrips > 0 && <TagBadge tone="amber">{atRiskTrips} trips with at-risk stops</TagBadge>}
      {s.edited && <TagBadge tone="violet">Edited by dispatcher</TagBadge>}
      <span className="text-xs text-muted-foreground">
        Draft v{plan.version} · engine {plan.engineVersion}
      </span>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" disabled={discard.isPending} onClick={() => discard.mutate()}>
          <Trash2 data-icon="inline-start" /> Discard draft
        </Button>
        <Dialog>
          <DialogTrigger render={<Button size="sm" />}>
            <Send data-icon="inline-start" /> Publish plan
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Publish plan v{plan.version}?</DialogTitle>
              <DialogDescription>
                {s.served} orders go to {trips} trips. {deferred} deferred orders roll to the next run and their stores are notified with the
                reason. Loaders and drivers see the plan immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button disabled={publish.isPending} onClick={() => publish.mutate()}>
                {publish.isPending && <Spinner />} Publish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  )
}

function TripCard({ trip, active, onClick }: { trip: Trip; active: boolean; onClick: () => void }) {
  const util = Math.max(pct(trip.loadWeightKg, trip.vehicle.weightCapKg), pct(trip.loadVolumeM3, trip.vehicle.volumeCapM3))
  const risk = trip.stops.some((s) => s.atRisk)
  return (
    <button
      onClick={onClick}
      className={cn(
        "grid gap-1.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/40",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{trip.ref}</span>
        {risk && <AlertTriangle className="size-3.5 text-amber-500" />}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {trip.vehicleId} · trip {trip.tripNo}/2
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <BrandBadge brand={trip.brand} />
        <TagBadge tone="gray">{trip.districtId}</TagBadge>
        {trip.vehicle.temp === "REEFER" && <Snowflake className="size-3.5 text-sky-500" />}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
        <span>{trip.stops.length} stops</span>·<span>{Math.round(trip.plannedDurationMin)} min</span>·<span>dep {minToHHMM(trip.plannedDepartMin)}</span>
        <span className="ml-auto">{util}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", util > 95 ? "bg-amber-500" : "bg-primary")} style={{ width: `${util}%` }} />
      </div>
    </button>
  )
}

function StopsCard({ trip, decisionByOrder, onDefer }: { trip: Trip; decisionByOrder: Map<string, Decision>; onDefer: (d: Decision) => void }) {
  const back = trip.plannedDepartMin + trip.plannedDurationMin
  return (
    <Card size="sm" className="gap-0 py-0 xl:h-[640px]">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <p className="text-sm font-semibold">{trip.ref}</p>
        <BrandBadge brand={trip.brand} />
        <span className="text-sm text-muted-foreground">
          {trip.districtId} · {trip.vehicleId}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">Loader loads in reverse stop order</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-10 pl-4">#</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Load</TableHead>
              <TableHead className="text-right">Service</TableHead>
              <TableHead className="text-right">Arrival</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/30 text-muted-foreground">
              <TableCell className="pl-4">
                <Warehouse className="size-4" />
              </TableCell>
              <TableCell colSpan={4}>Depart depot</TableCell>
              <TableCell className="text-right font-medium text-foreground tabular-nums">{minToHHMM(trip.plannedDepartMin)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
            {trip.stops.map((s) => {
              const d = decisionByOrder.get(s.orderId)
              return (
                <TableRow key={s.id} className={cn(s.atRisk && "bg-amber-50/60 dark:bg-amber-500/5")}>
                  <TableCell className="pl-4">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">{s.seq}</span>
                  </TableCell>
                  <TableCell>
                    <div className="grid leading-tight">
                      <span className="font-medium">{s.order.outlet.id}</span>
                      <span className="text-[11px] text-muted-foreground">{s.order.outlet.parkingConstraint === "VAN_ONLY" ? "Van only" : s.order.outlet.dockType.replace("_", " ").toLowerCase()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <TempIcon temp={s.order.temp} />
                      {s.order.ref}
                      {s.order.deferCount > 0 && <TagBadge tone="amber">↻{s.order.deferCount}</TagBadge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {fmtNum(s.order.weightKg)} kg
                    <br />
                    <span className="text-muted-foreground">{fmtNum(s.order.volumeM3, 2)} m³</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.plannedServiceMin}m</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {minToHHMM(s.plannedArrivalMin)}
                    {s.plannedWaitMin > 0 && <div className="text-[11px] text-muted-foreground">wait {s.plannedWaitMin}m</div>}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{outletWindow(s.order.outlet)}</TableCell>
                  <TableCell>
                    {s.atRisk ? (
                      <Tooltip>
                        <TooltipTrigger render={<span />}>
                          <TagBadge tone="amber">At risk</TagBadge>
                        </TooltipTrigger>
                        <TooltipContent>{s.riskReason}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <TagBadge tone="green">On time</TagBadge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {d && (
                      <Button variant="ghost" size="xs" className="text-destructive" onClick={() => onDefer(d)}>
                        Defer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            <TableRow className="bg-muted/30 text-muted-foreground">
              <TableCell className="pl-4">
                <ArrowDownToLine className="size-4" />
              </TableCell>
              <TableCell colSpan={4}>Last stop complete (return leg excluded from budget)</TableCell>
              <TableCell className="text-right font-medium text-foreground tabular-nums">{minToHHMM(back)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableBody>
        </Table>
      </ScrollArea>
    </Card>
  )
}

function Meter({ label, value, max, unit, digits = 0 }: { label: string; value: number; max: number; unit: string; digits?: number }) {
  const p = pct(value, max)
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {fmtNum(value, digits)} / {fmtNum(max, digits)} {unit} <span className="text-muted-foreground">({p}%)</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", p > 100 ? "bg-red-500" : p > 90 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
    </div>
  )
}

function TripInspector({ trip, plan }: { trip: Trip; plan: Plan }) {
  const fresh = trip.brand === "FRESH"
  const budget = fresh ? RULES.freshBudgetMin : RULES.styleTechBudgetMin
  const sameClass = plan.trips.filter((t) => t.vehicleId === trip.vehicleId && (t.brand === "FRESH") === fresh && t.stops.length)
  const used = sameClass.reduce((s, t) => s + t.plannedDurationMin, 0)
  const vehicleFuel = plan.trips.filter((t) => t.vehicleId === trip.vehicleId).reduce((s, t) => s + t.plannedFuelL, 0)

  return (
    <Card size="sm" className="gap-3 xl:h-[640px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {trip.vehicleId}
          <TagBadge tone={trip.vehicle.temp === "REEFER" ? "blue" : "gray"}>
            {trip.vehicle.temp === "REEFER" ? "Reefer" : "Ambient"} {trip.vehicle.type.toLowerCase()}
          </TagBadge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Trip</dt>
          <dd className="text-right font-medium">
            {trip.ref} · {trip.tripNo} of 2
          </dd>
          <dt className="flex items-center gap-1 text-muted-foreground">
            <User className="size-3" /> Driver
          </dt>
          <dd className="text-right font-medium">{trip.driver?.name ?? trip.vehicle.driver?.name ?? "Assigned on publish"}</dd>
          <dt className="text-muted-foreground">District</dt>
          <dd className="text-right font-medium">{trip.districtId}</dd>
          <dt className="text-muted-foreground">Distance</dt>
          <dd className="text-right font-medium tabular-nums">{fmtNum(trip.plannedKm)} km round trip</dd>
        </dl>

        <div className="grid gap-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <PackageCheck className="size-3.5" /> Capacity
          </p>
          <Meter label="Weight" value={trip.loadWeightKg} max={trip.vehicle.weightCapKg} unit="kg" />
          <Meter label="Volume" value={trip.loadVolumeM3} max={trip.vehicle.volumeCapM3} unit="m³" digits={1} />
        </div>

        <div className="grid gap-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Clock className="size-3.5" /> Time budget ({fresh ? "Fresh 03:30–08:00" : "Style + Tech trading day"})
          </p>
          <Meter label="This trip" value={trip.plannedDurationMin} max={budget} unit="min" />
          <Meter label={`${trip.vehicleId} today`} value={used} max={budget} unit="min" />
        </div>

        <div className="grid gap-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Fuel className="size-3.5" /> Fuel
          </p>
          <Meter label="Today's trips vs weekly quota" value={vehicleFuel} max={trip.vehicle.weeklyFuelQuotaL} unit="L" digits={1} />
          <p className="text-[11px] text-muted-foreground">
            {fmtNum(trip.plannedFuelL, 1)} L this trip at {trip.vehicle.kmPerL} km/L. Quota checked against fuel already used this ISO week.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function DeferredQueue({ deferred, onAssign, onDefer }: { deferred: Decision[]; onAssign: (d: Decision) => void; onDefer: (d: Decision) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center gap-2">
          Deferred orders <TagBadge tone="red">{deferred.length}</TagBadge>
          <span className="text-xs font-normal text-muted-foreground">
            Every deferral carries the binding constraint and whether it was avoidable.
          </span>
        </CardTitle>
      </CardHeader>
      {!deferred.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Every order is allocated.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Load</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-[38%]">Why</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {deferred.map((d) => {
              const unavoidable = d.scoreBreakdown?.unavoidable === true
              return (
                <Fragment key={d.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(open === d.id ? null : d.id)}>
                    <TableCell className="pl-4 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <TempIcon temp={d.order.temp} /> {d.order.ref}
                        {d.order.deferCount > 0 && <TagBadge tone="red">↻{d.order.deferCount}</TagBadge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {d.order.outlet.id} <span className="text-muted-foreground">· {d.order.outlet.districtId}</span>
                    </TableCell>
                    <TableCell>
                      <BrandBadge brand={d.order.brand} />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmtNum(d.order.weightKg)} kg · {fmtNum(d.order.volumeM3, 1)} m³
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {d.reason && <ReasonBadge reason={d.reason} />}
                        {d.source === "DISPATCHER" ? (
                          <TagBadge tone="violet">Dispatcher</TagBadge>
                        ) : (
                          <TagBadge tone={unavoidable ? "gray" : "amber"}>{unavoidable ? "Unavoidable" : "Choice"}</TagBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal text-muted-foreground">{d.note || d.explanation}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.priorityScore}</TableCell>
                    <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="xs" onClick={() => onAssign(d)}>
                          Assign
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => onDefer(d)}>
                          Reason
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {open === d.id && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="bg-muted/30 px-4 py-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          <ScoreBreakdown score={d.priorityScore} breakdown={d.scoreBreakdown} />
                          <div className={cn("rounded-lg p-3 text-xs ring-1 ring-inset", unavoidable ? TONE.gray : TONE.amber)}>
                            {unavoidable
                              ? "No feasible allocation could serve this order today under the operating rules."
                              : "This deferral was a trade-off: capacity existed but went to other orders. Try Assign to see what would break."}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
