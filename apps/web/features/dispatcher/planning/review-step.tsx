"use client"

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import dynamic from "next/dynamic"
import { AlertTriangle, ListOrdered, Map as MapIcon, PackageX, Plus, Save, Search, Send, Snowflake, Trash2 } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import type { Brand, DeferOrderInput } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { minToHHMM, pct } from "@/lib/format"
import type { Decision, Plan, Trip } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useDiscardPlan, usePublishPlan, useRemoveTrip, useResetTrip, useSaveLayout, useTripPreview } from "../queries"
import { AddTripDialog } from "./add-trip-dialog"
import { useCanvas, type PoolItem } from "./canvas"
import { AssignDialog } from "./assign-dialog"
import { DeferredQueue } from "./deferred-queue"
import { DeferredCardView, DeferredRail } from "./deferred-rail"
import { DeferSheet } from "./defer-sheet"
import { TripCanvas } from "./trip-canvas"

const TripMap = dynamic(() => import("./trip-map"), { ssr: false, loading: () => <Skeleton className="m-4 flex-1 rounded-xl" /> })

const HEIGHT = "xl:h-[calc(100dvh-16rem)] xl:min-h-[600px]"
const BRAND_HEX: Record<Brand, string> = { FRESH: "#16a34a", STYLE: "#db2777", TECH: "#0284c7" }

type Tab = "stops" | "map" | "deferred"

/** Pointer position decides the target: a trip card wins, then the deferred rail, then the stop under the pointer. */
const collision: CollisionDetection = (args) => {
  const type = (id: string | number) => args.droppableContainers.find((c) => c.id === id)?.data.current?.type as string | undefined
  const hits = pointerWithin(args)
  const of = (t: string) => hits.filter((h) => type(h.id) === t)
  if (!hits.length) return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "stop") })
  return of("trip").length ? of("trip") : of("pool-zone").length ? of("pool-zone") : of("stop").length ? of("stop") : hits
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return [v, setV] as const
}

export function ReviewStep({ plan, mapboxToken }: { plan: Plan; mapboxToken?: string }) {
  const canvas = useCanvas(plan)
  const { layout, server, defers, pool, decisions, dirtyTrips } = canvas
  const [brand, setBrand] = useState<"ALL" | Brand>("ALL")
  const [q, setQ] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("stops")
  const [deferring, setDeferring] = useState<{ decision: Decision; local: boolean } | null>(null)
  const [assigning, setAssigning] = useState<Decision | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [active, setActive] = useState<{ type: "pool" | "stop"; orderId: string } | null>(null)
  const { resolvedTheme } = useTheme()

  const save = useSaveLayout(plan.id)
  const reset = useResetTrip(plan.id)
  const removeTrip = useRemoveTrip(plan.id)

  const trips = plan.trips
  const visible = trips.filter(
    (t) => (brand === "ALL" || t.brand === brand) && (!q || `${t.ref} ${t.vehicleId} ${t.districtId}`.toLowerCase().includes(q.toLowerCase())),
  )
  const selected = trips.find((t) => t.id === selectedId) ?? visible[0] ?? trips[0]
  const orderIds = selected ? (layout[selected.id] ?? []) : []
  const deferred = plan.decisions.filter((d) => d.decision === "DEFERRED")
  const atRiskTrips = trips.filter((t) => t.stops.some((s) => s.atRisk)).length

  // Live re-timing: every change to the sequence recalculates after a short pause; the button forces it now.
  const key = orderIds.join(",")
  const [settled, setSettled] = useDebounced(key, 350)
  const preview = useTripPreview(plan.id, selected?.id, settled ? settled.split(",") : [], !!selected)
  const stale = settled !== key || (preview.isFetching && preview.isPlaceholderData)
  const recalc = () => {
    setSettled(key)
    void preview.refetch()
  }

  const changes = (tripId: string) => {
    const mine = layout[tripId] ?? []
    const base = server[tripId] ?? []
    const moved = mine.filter((id, i) => base.includes(id) && base.filter((x) => mine.includes(x))[i] !== id).length
    return mine.filter((id) => !base.includes(id)).length + base.filter((id) => !mine.includes(id)).length + moved
  }

  /** Trips that must travel together: an order moved between two edited trips is saved with both. */
  const closure = (start: string[]) => {
    const set = new Set(start)
    for (const t of set)
      for (const id of server[t] ?? []) {
        if ((layout[t] ?? []).includes(id) || id in defers) continue
        const dest = Object.keys(layout).find((u) => layout[u].includes(id))
        if (dest) set.add(dest)
      }
    return [...set]
  }
  const persist = (tripIds: string[]) => {
    const ids = closure(tripIds)
    const owned = new Set(ids.flatMap((t) => server[t] ?? []))
    save.mutate({
      trips: ids.map((tripId) => ({ tripId, orderIds: layout[tripId] ?? [] })),
      deferrals: Object.entries(defers)
        .filter(([id]) => owned.has(id))
        .map(([orderId, d]) => ({ orderId, ...d })),
    })
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current
    if (d) setActive({ type: d.type, orderId: d.orderId })
  }
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null)
    const a = e.active.data.current
    const o = e.over?.data.current
    if (!a || !o) return
    if (a.type === "pool") {
      if (o.type === "stop" && selected) canvas.place(a.orderId, selected.id, orderIds.indexOf(o.orderId))
      else if (o.type === "canvas" && selected) canvas.place(a.orderId, selected.id)
      else if (o.type === "trip") canvas.place(a.orderId, o.tripId)
    } else if (a.type === "stop" && selected) {
      if (o.type === "stop") {
        const from = orderIds.indexOf(a.orderId)
        const to = orderIds.indexOf(o.orderId)
        if (from !== to && from >= 0 && to >= 0) canvas.move(selected.id, from, to)
      } else if (o.type === "canvas") canvas.move(selected.id, orderIds.indexOf(a.orderId), orderIds.length - 1)
      else if (o.type === "pool-zone") {
        const d = decisions.get(a.orderId)
        if (d) setDeferring({ decision: d, local: true })
      } else if (o.type === "trip" && o.tripId !== selected.id) canvas.place(a.orderId, o.tripId)
    }
  }

  const deferLocal = (input: DeferOrderInput) => canvas.remove(input.orderId, { reason: input.reason, note: input.note })
  const activeDecision = active ? decisions.get(active.orderId) : undefined
  const activePool = active?.type === "pool" ? pool.find((p) => p.decision.orderId === active.orderId) : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="grid gap-3">
        <ReviewBar
          plan={plan}
          atRiskTrips={atRiskTrips}
          deferred={deferred.length}
          trips={trips.filter((t) => t.stops.length).length}
          unsaved={dirtyTrips.size}
          saving={save.isPending}
          onSaveDraft={() => persist([...dirtyTrips])}
        />

        <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          {/* Trips */}
          <Card size="sm" className={cn("gap-2 py-3", HEIGHT)}>
            <div className="grid gap-2 px-3">
              <div className="flex items-center justify-between gap-1">
                <p className="text-sm font-medium">Trips ({trips.length})</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="xs" onClick={() => setAdding(true)}>
                    <Plus data-icon="inline-start" /> Add
                  </Button>
                  <Button variant="outline" size="xs" className="text-destructive" disabled={!selected} onClick={() => setRemoving(true)}>
                    <Trash2 data-icon="inline-start" /> Remove
                  </Button>
                </div>
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
                  <TripCard key={t.id} trip={t} count={(layout[t.id] ?? []).length} dirty={dirtyTrips.has(t.id)} active={selected?.id === t.id} onClick={() => setSelectedId(t.id)} />
                ))}
                {!visible.length && <p className="py-8 text-center text-xs text-muted-foreground">No trips. Use Add to build one.</p>}
              </div>
            </ScrollArea>
          </Card>

          {/* Workspace */}
          <Card size="sm" className={cn("gap-0 overflow-hidden py-0", HEIGHT)}>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                <TabsList>
                  <TabsTrigger value="stops" className="text-xs">
                    <ListOrdered /> Stops
                  </TabsTrigger>
                  <TabsTrigger value="map" className="text-xs">
                    <MapIcon /> Route map
                  </TabsTrigger>
                  <TabsTrigger value="deferred" className="text-xs">
                    <PackageX /> Deferred
                    <span className="text-[10px] text-muted-foreground">{pool.length}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {selected && tab === "map" && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {selected.ref} · {selected.districtId} · {selected.vehicleId}
                </span>
              )}
            </div>

            {!selected && tab !== "deferred" ? (
              <div className="grid flex-1 place-items-center text-sm text-muted-foreground">No trips in this plan. Add one to start planning.</div>
            ) : tab === "stops" && selected ? (
              <TripCanvas
                plan={plan}
                trip={selected}
                orderIds={orderIds}
                decisions={decisions}
                preview={preview.data}
                stale={stale}
                recalculating={preview.isFetching}
                dirty={dirtyTrips.has(selected.id)}
                changes={changes(selected.id)}
                saving={save.isPending}
                resetting={reset.isPending}
                onRecalculate={recalc}
                onDefer={(d) => setDeferring({ decision: d, local: true })}
                onSave={() => persist([selected.id])}
                onRevert={() => canvas.revert(selected.id)}
                onReset={() => {
                  canvas.revert(selected.id)
                  reset.mutate(selected.id)
                }}
              />
            ) : tab === "map" && selected ? (
              mapboxToken ? (
                <TripMap
                  token={mapboxToken}
                  depot={plan.depot}
                  color={BRAND_HEX[selected.brand]}
                  theme={resolvedTheme === "dark" ? "dark" : "light"}
                  stops={orderIds.flatMap((id) => {
                    const d = decisions.get(id)
                    return d ? [{ orderId: id, outletId: d.order.outlet.id, orderRef: d.order.ref, lat: d.order.outlet.lat, lng: d.order.outlet.lng, atRisk: !!preview.data?.stops.find((s) => s.orderId === id)?.atRisk }] : []
                  })}
                />
              ) : (
                <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">Set MAPBOX_ACCESS_TOKEN to show the route map.</div>
              )
            ) : (
              <DeferredQueue deferred={deferred} onAssign={setAssigning} onDefer={(d) => setDeferring({ decision: d, local: false })} />
            )}
          </Card>

          {/* Deferred orders as cards */}
          <DeferredRail
            pool={pool}
            trip={selected}
            height={HEIGHT}
            onAdd={(orderId) => selected && canvas.place(orderId, selected.id)}
            onAssign={(i: PoolItem) => setAssigning(i.decision)}
          />
        </div>

        <DeferSheet
          key={`defer-${deferring?.decision.orderId ?? "none"}-${deferring?.local}`}
          planId={plan.id}
          decision={deferring?.decision ?? null}
          onClose={() => setDeferring(null)}
          onSubmit={deferring?.local ? deferLocal : undefined}
        />
        <AssignDialog key={`assign-${assigning?.orderId ?? "none"}`} plan={plan} decision={assigning} onClose={() => setAssigning(null)} />
        <AddTripDialog plan={plan} pool={pool} open={adding} onClose={() => setAdding(false)} onCreated={(id) => { setSelectedId(id); setTab("stops") }} />
        <RemoveTripDialog
          trip={removing ? selected : undefined}
          count={selected?.stops.length ?? 0}
          pending={removeTrip.isPending}
          onClose={() => setRemoving(false)}
          onConfirm={() => selected && removeTrip.mutate(selected.id, { onSuccess: () => { setRemoving(false); setSelectedId(null) } })}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {activePool ? (
          <div className="w-72">
            <DeferredCardView item={activePool} overlay />
          </div>
        ) : activeDecision ? (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-xl ring-1 ring-primary/40">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">{orderIds.indexOf(activeDecision.orderId) + 1}</span>
            <span className="font-medium">{activeDecision.order.outlet.id}</span>
            <span className="text-xs text-muted-foreground">{activeDecision.order.ref}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function ReviewBar({
  plan,
  atRiskTrips,
  deferred,
  trips,
  unsaved,
  saving,
  onSaveDraft,
}: {
  plan: Plan
  atRiskTrips: number
  deferred: number
  trips: number
  unsaved: number
  saving: boolean
  onSaveDraft: () => void
}) {
  const publish = usePublishPlan(plan.id)
  const discard = useDiscardPlan(plan.id)
  const s = plan.summary
  return (
    <Card size="sm" className="flex-row flex-wrap items-center gap-2 px-3">
      <TagBadge tone="green">
        {s.served}/{s.orders} served · {s.coveragePct}%
      </TagBadge>
      <TagBadge tone="gray">
        {trips} trips · {s.vehiclesUsed} vehicles
      </TagBadge>
      {deferred > 0 && <TagBadge tone="red">{deferred} deferred</TagBadge>}
      {atRiskTrips > 0 && <TagBadge tone="amber">{atRiskTrips} trips with at-risk stops</TagBadge>}
      {s.edited && <TagBadge tone="violet">Edited by dispatcher</TagBadge>}
      {unsaved > 0 && <TagBadge tone="amber">{unsaved} unsaved trip{unsaved === 1 ? "" : "s"}</TagBadge>}
      <span className="text-xs text-muted-foreground">
        Draft v{plan.version} · engine {plan.engineVersion}
      </span>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" disabled={discard.isPending} onClick={() => discard.mutate()}>
          <Trash2 data-icon="inline-start" /> Discard draft
        </Button>
        <Button variant="outline" size="sm" disabled={!unsaved || saving} onClick={onSaveDraft}>
          {saving ? <Spinner /> : <Save data-icon="inline-start" />} Save draft
        </Button>
        <Dialog>
          <DialogTrigger render={<Button size="sm" />}>
            <Send data-icon="inline-start" /> Publish plan
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Publish plan v{plan.version}?</DialogTitle>
              <DialogDescription>
                {s.served} orders go to {trips} trips. {deferred} deferred orders roll to the next run and their stores are notified with the reason.
                Loaders and drivers see the plan immediately.
              </DialogDescription>
            </DialogHeader>
            {unsaved > 0 && (
              <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0" /> {unsaved} trip{unsaved === 1 ? " has" : "s have"} unsaved changes that will not be published. Save the draft first.
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button disabled={publish.isPending || unsaved > 0} onClick={() => publish.mutate()}>
                {publish.isPending && <Spinner />} Publish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  )
}

function TripCard({ trip, count, dirty, active, onClick }: { trip: Trip; count: number; dirty: boolean; active: boolean; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip:${trip.id}`, data: { type: "trip", tripId: trip.id } })
  const util = Math.max(pct(trip.loadWeightKg, trip.vehicle.weightCapKg), pct(trip.loadVolumeM3, trip.vehicle.volumeCapM3))
  const risk = trip.stops.some((s) => s.atRisk)
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "grid gap-1.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/40",
        active && "border-primary ring-1 ring-primary",
        isOver && "border-primary bg-primary/5 ring-2 ring-primary",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{trip.ref}</span>
        {risk && <AlertTriangle className="size-3.5 text-amber-500" />}
        {dirty && <span className="size-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
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
        <span>{count} stops</span>·<span>{Math.round(trip.plannedDurationMin)} min</span>·<span>dep {minToHHMM(trip.plannedDepartMin)}</span>
        <span className="ml-auto">{util}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", util > 95 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.min(100, util)}%` }} />
      </div>
    </button>
  )
}

function RemoveTripDialog({ trip, count, pending, onClose, onConfirm }: { trip?: Trip; count: number; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={!!trip} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {trip?.ref}?</DialogTitle>
          <DialogDescription>
            {count
              ? `${count} order${count === 1 ? "" : "s"} on this trip return to the deferred pool with the reason “Other”, so you can place them on another trip.`
              : "This trip has no stops."}{" "}
            {trip && `${trip.vehicleId} becomes free for another trip.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <Spinner />} Remove trip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
