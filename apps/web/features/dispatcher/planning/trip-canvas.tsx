"use client"

import { useDroppable } from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlertTriangle,
  ArrowDownToLine,
  Calculator,
  Wand2,
  CheckCircle2,
  Clock,
  Fuel,
  GripVertical,
  Hourglass,
  Inbox,
  PackageCheck,
  Radio,
  RotateCcw,
  Save,
  ShieldAlert,
  Undo2,
  Warehouse,
  X,
} from "lucide-react"
import { useState } from "react"
import {
  TempIcon,
  TONE,
  BrandBadge,
  TagBadge,
} from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { fmtNum, minToHHMM, pct } from "@/lib/format"
import type { Decision, Plan, Stop, Trip, TripPreview } from "@/lib/types"
import { cn } from "@/lib/utils"
import { outletWindow } from "../shared/window"

type PreviewStop = TripPreview["stops"][number]
type Order = Decision["order"]

// ── risks ──────────────────────────────────────────────────────────────────

export interface Risk {
  level: "high" | "medium" | "info"
  title: string
  detail: string
}

/** Everything worth a dispatcher's attention on one stop, from the live preview and the order itself. */
export function stopRisks(
  order: Order,
  p: PreviewStop | undefined,
  violations: TripPreview["violations"]
): Risk[] {
  const out: Risk[] = []
  if (p) {
    const late = p.arrivalMin > p.windowCloseMin
    const slack = p.windowCloseMin - p.arrivalMin
    if (late)
      out.push({
        level: "high",
        title: "Arrives after the window closes",
        detail: `ETA ${minToHHMM(p.arrivalMin)} is ${p.arrivalMin - p.windowCloseMin} min after ${order.outlet.id} closes at ${minToHHMM(p.windowCloseMin)}. The store may refuse the delivery — move this stop earlier or defer it.`,
      })
    else if (slack < 15)
      out.push({
        level: "medium",
        title: "Tight window",
        detail: `Only ${slack} min of slack before ${order.outlet.id} closes at ${minToHHMM(p.windowCloseMin)} (ETA ${minToHHMM(p.arrivalMin)}). Any delay on the road makes this late.`,
      })
    if (p.waitMin >= 20)
      out.push({
        level: "info",
        title: `Waits ${p.waitMin} min at the door`,
        detail: `The vehicle reaches ${order.outlet.id} at ${minToHHMM(p.arrivalMin)} but the window opens at ${minToHHMM(p.windowOpenMin)}. A later position in the trip would remove the idle time.`,
      })
  }
  if (order.deferCount > 0)
    out.push({
      level: "medium",
      title: `Already deferred ${order.deferCount}×`,
      detail: `${order.outlet.id} has been left unserved on consecutive runs. Deferring again damages the relationship — prefer keeping it on a trip.`,
    })
  if (order.outlet.parkingConstraint === "VAN_ONLY")
    out.push({
      level: "info",
      title: "Van-only access",
      detail: `${order.outlet.id} cannot be reached by a truck; this trip's vehicle must be a van.`,
    })
  for (const v of violations.filter((v) => v.message.includes(order.ref)))
    out.push({
      level: "high",
      title: v.rule.replace(/_/g, " ").toLowerCase(),
      detail: v.message,
    })
  return out
}

const LEVEL_RANK = { high: 2, medium: 1, info: 0 }
const worst = (r: Risk[]) =>
  r.reduce<Risk["level"] | null>(
    (w, x) => (w === null || LEVEL_RANK[x.level] > LEVEL_RANK[w] ? x.level : w),
    null
  )

function RiskChip({ risks }: { risks: Risk[] }) {
  const level = worst(risks)
  const counted = risks.filter((r) => r.level !== "info").length
  if (!level) return <TagBadge tone="green">On time</TagBadge>
  const tone = level === "high" ? "red" : level === "medium" ? "amber" : "gray"
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ring-1 transition-shadow ring-inset hover:shadow-sm focus-visible:ring-2",
          TONE[tone]
        )}
      >
        {level === "info" ? (
          <Hourglass className="size-3" />
        ) : (
          <AlertTriangle className="size-3" />
        )}
        {level === "info" ? "Notes" : "At risk"}
        {counted > 1 && <span className="tabular-nums">· {counted}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <p className="border-b px-3 py-2 text-xs font-medium">
          {risks.length} thing{risks.length === 1 ? "" : "s"} to know about this
          stop
        </p>
        <div className="grid max-h-72 gap-px overflow-y-auto bg-border">
          {risks
            .toSorted((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])
            .map((r, i) => (
              <div key={i} className="grid gap-0.5 bg-popover px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      r.level === "high"
                        ? "bg-red-500"
                        : r.level === "medium"
                          ? "bg-amber-500"
                          : "bg-muted-foreground/50"
                    )}
                  />
                  {r.title}
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {r.detail}
                </p>
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── meters ─────────────────────────────────────────────────────────────────

export function Meter({
  icon: Icon,
  label,
  value,
  max,
  unit,
  digits = 0,
  hint,
}: {
  icon: typeof Clock
  label: string
  value: number
  max: number
  unit: string
  digits?: number
  hint?: string
}) {
  const p = pct(value, max)
  return (
    <div className="grid gap-1" title={hint}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon className="size-3" /> {label}
        </span>
        <span className="tabular-nums">
          {fmtNum(value, digits)}
          <span className="text-muted-foreground">
            {" "}
            / {fmtNum(max, digits)} {unit}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            p > 100 ? "bg-red-500" : p > 90 ? "bg-amber-500" : "bg-primary"
          )}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
    </div>
  )
}

export function TripMeters({
  trip,
  preview,
}: {
  trip: Trip
  preview?: TripPreview
}) {
  const v = trip.vehicle
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 border-b px-4 py-3 @2xl:grid-cols-4">
      <Meter
        icon={PackageCheck}
        label="Weight"
        value={preview?.loadWeightKg ?? trip.loadWeightKg}
        max={v.weightCapKg}
        unit="kg"
      />
      <Meter
        icon={PackageCheck}
        label="Volume"
        value={preview?.loadVolumeM3 ?? trip.loadVolumeM3}
        max={v.volumeCapM3}
        unit="m³"
        digits={1}
      />
      <Meter
        icon={Clock}
        label="Time"
        value={preview?.vehicleUsedMin ?? trip.plannedDurationMin}
        max={preview?.budgetMin ?? (trip.brand === "FRESH" ? 270 : 480)}
        unit="min"
        hint={`${v.id} total across its trips of this class`}
      />
      <Meter
        icon={Fuel}
        label="Fuel"
        value={preview?.vehicleFuelL ?? trip.plannedFuelL}
        max={v.weeklyFuelQuotaL}
        unit="L"
        digits={1}
        hint="This vehicle's planned litres today vs its weekly quota"
      />
    </div>
  )
}

// ── rows ───────────────────────────────────────────────────────────────────

// Narrow workspaces (sidebar open) drop the window column; the risk chip carries the same information.
const GRID =
  "grid grid-cols-[16px_22px_minmax(0,1fr)_64px_84px_84px_24px] @2xl:grid-cols-[16px_22px_minmax(0,1.3fr)_72px_92px_88px_92px_24px] items-center gap-x-2.5"

interface RowProps {
  order: Order
  index: number
  saved?: Stop
  p?: PreviewStop
  stale: boolean
  risks: Risk[]
  onDefer: () => void
  locked?: boolean
}

export function StopRowView({
  order,
  index,
  saved,
  p,
  stale,
  risks,
  onDefer,
  locked,
  overlay,
}: RowProps & { overlay?: boolean }) {
  const delta =
    p && saved && saved.plannedArrivalMin !== p.arrivalMin
      ? p.arrivalMin - saved.plannedArrivalMin
      : 0
  const bad = risks.some((r) => r.level === "high")
  return (
    <div
      className={cn(
        GRID,
        "border-b bg-card px-4 py-2 text-sm",
        bad
          ? "bg-red-50/50 dark:bg-red-500/5"
          : risks.some((r) => r.level === "medium") &&
              "bg-amber-50/50 dark:bg-amber-500/5",
        overlay && "rounded-lg border shadow-lg ring-1 ring-primary/40"
      )}
    >
      <GripVertical className="size-4 text-muted-foreground" />
      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground tabular-nums">
        {index + 1}
      </span>
      <div className="grid min-w-0 leading-tight">
        <span className="truncate font-medium">{order.outlet.id}</span>
        <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <TempIcon temp={order.temp} className="size-3" />
          {order.ref}
          {order.deferCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              ↻{order.deferCount}
            </span>
          )}
          {order.carriedFromOrderId && (
            <span className="text-sky-600 dark:text-sky-400" title="Carry-over: re-sends missing or damaged units">
              Carry-over
            </span>
          )}
        </span>
      </div>
      <div className="text-right text-xs tabular-nums">
        {fmtNum(order.weightKg)} kg
        <div className="text-[11px] text-muted-foreground">
          {fmtNum(order.volumeM3, 2)} m³
        </div>
      </div>
      <div
        className={cn(
          "text-right tabular-nums transition-opacity",
          stale && "opacity-50"
        )}
      >
        <span className="font-medium">{p ? minToHHMM(p.arrivalMin) : "—"}</span>
        {delta !== 0 && (
          <span
            className={cn(
              "ml-1 text-[11px]",
              delta > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta)}m
          </span>
        )}
        <div className="text-[11px] text-muted-foreground">
          {p
            ? `${p.serviceMin}m svc${p.waitMin > 0 ? ` · wait ${p.waitMin}m` : ""}`
            : "calculating…"}
        </div>
      </div>
      <span className="hidden text-xs text-muted-foreground tabular-nums @2xl:block">
        {outletWindow(order.outlet)}
      </span>
      <div className="flex justify-start">
        {p || risks.length ? (
          <RiskChip risks={risks} />
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn(
          "text-muted-foreground hover:text-destructive",
          locked && "invisible"
        )}
        disabled={locked}
        onClick={onDefer}
        aria-label={`Defer ${order.ref}`}
        title="Defer this order"
      >
        <X />
      </Button>
    </div>
  )
}

function SortableStop(props: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.order.id,
    data: { type: "stop", orderId: props.order.id },
    disabled: props.locked,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-35")}
    >
      <div className="group/row relative">
        {!props.locked && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="absolute top-0 left-0 z-10 flex h-full w-12 cursor-grab touch-none items-center pl-3.5 active:cursor-grabbing"
            aria-label={`Drag to reorder ${props.order.ref}`}
          />
        )}
        <StopRowView {...props} />
      </div>
    </div>
  )
}

// ── canvas ─────────────────────────────────────────────────────────────────

export interface TripCanvasProps {
  plan: Plan
  trip: Trip
  orderIds: string[]
  decisions: Map<string, Decision>
  preview?: TripPreview
  stale: boolean
  recalculating: boolean
  dirty: boolean
  changes: number
  saving: boolean
  resetting: boolean
  onRecalculate: () => void
  onOptimize: () => void
  optimal: boolean
  onDefer: (d: Decision) => void
  onSave: () => void
  onRevert: () => void
  onReset: () => void
  /** The trip is live: shown, but nothing can change. */
  locked?: boolean
}

export function TripCanvas(p: TripCanvasProps) {
  const { trip, orderIds, decisions, preview, stale } = p
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-drop",
    data: { type: "canvas" },
  })
  const [confirmReset, setConfirmReset] = useState(false)
  const previewByOrder = new Map(preview?.stops.map((s) => [s.orderId, s]))
  const savedByOrder = new Map(trip.stops.map((s) => [s.orderId, s]))
  const violations = preview?.violations ?? []
  const blocked = violations.length > 0
  const depart = preview?.departMin ?? trip.plannedDepartMin
  const back = preview
    ? preview.departMin + preview.durationMin
    : trip.plannedDepartMin + trip.plannedDurationMin
  const rows = orderIds.flatMap((id) => {
    const d = decisions.get(id)
    return d ? [d] : []
  })

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <p className="text-sm font-semibold">{trip.ref}</p>
        <BrandBadge brand={trip.brand} />
        <span className="text-sm text-muted-foreground">
          {trip.districtId} · {trip.vehicleId} ·{" "}
          {trip.driver?.name ??
            trip.vehicle.driver?.name ??
            "driver on publish"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {/* <span className="hidden text-xs text-muted-foreground xl:inline">Loader loads in reverse stop order</span> */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={p.onRecalculate}
                  disabled={p.recalculating}
                  aria-label="Recalculate arrival times"
                />
              }
            >
              {p.recalculating ? <Spinner /> : <Calculator />}
            </TooltipTrigger>
            <TooltipContent>
              Arrival times update automatically. Click to recalculate now.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="xs"
                  onClick={p.onOptimize}
                  disabled={p.locked || p.optimal || orderIds.length < 2}
                />
              }
            >
              <Wand2 data-icon="inline-start" /> Optimise order
            </TooltipTrigger>
            <TooltipContent>
              {p.optimal
                ? "Already in the best window order"
                : "Re-order stops by delivery window (earliest close first)"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {p.locked && (
        <div
          className={cn(
            "mx-4 mt-3 flex items-center gap-2 rounded-lg p-2.5 text-xs ring-1 ring-inset",
            TONE.green
          )}
        >
          <Radio className="size-3.5" /> {trip.ref} is live, so it is locked.
          Only trips still at the depot can be changed.
        </div>
      )}

      <TripMeters trip={trip} preview={preview} />

      {blocked && (
        <div
          className={cn(
            "mx-4 mt-3 grid gap-1 rounded-lg p-2.5 text-xs ring-1 ring-inset",
            TONE.red
          )}
        >
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldAlert className="size-3.5" /> {violations.length} operating
            rule{violations.length === 1 ? "" : "s"} broken — fix before saving
          </p>
          {violations.map((v, i) => (
            <p key={i}>
              <span className="font-medium">
                {v.rule.replace(/_/g, " ").toLowerCase()}:
              </span>{" "}
              {v.message}
            </p>
          ))}
        </div>
      )}

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-colors",
          isOver && "bg-primary/5"
        )}
      >
        <div
          className={cn(
            GRID,
            "border-b px-4 py-2 text-[11px] font-medium text-muted-foreground"
          )}
        >
          <span />
          <span>#</span>
          <span>Outlet · order</span>
          <span className="text-right">Load</span>
          <span className="text-right">Arrival</span>
          <span className="hidden @2xl:block">Window</span>
          <span>Risk</span>
          <span />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div
            className={cn(
              GRID,
              "border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
            )}
          >
            <Warehouse className="size-4" />
            <span />
            <span className="col-span-2">Depart depot</span>
            <span />
            <span className="text-right font-medium text-foreground tabular-nums">
              {minToHHMM(depart)}
            </span>
            <span className="col-span-3" />
          </div>
          <SortableContext
            items={orderIds}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((d, i) => {
              const ps = previewByOrder.get(d.orderId)
              return (
                <SortableStop
                  key={d.orderId}
                  order={d.order}
                  index={i}
                  saved={savedByOrder.get(d.orderId)}
                  p={ps}
                  stale={stale}
                  risks={stopRisks(d.order, ps, violations)}
                  onDefer={() => p.onDefer(d)}
                  locked={p.locked}
                />
              )
            })}
          </SortableContext>
          {!rows.length && (
            <div className="m-4 flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed py-12 text-center text-sm text-muted-foreground">
              <Inbox className="size-6" />
              <p className="font-medium text-foreground">
                This trip has no stops
              </p>
              <p className="text-xs">
                Drag deferred orders from the right, or drop them on any trip in
                the list.
              </p>
            </div>
          )}
          {!!rows.length && (
            <div
              className={cn(
                GRID,
                "border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
              )}
            >
              <ArrowDownToLine className="size-4" />
              <span />
              <span className="col-span-2 truncate">Last stop complete</span>
              <span />
              <span className="text-right font-medium text-foreground tabular-nums">
                {minToHHMM(back)}
              </span>
              <span className="col-span-3" />
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {p.dirty ? (
            <>
              <span className="size-1.5 rounded-full bg-amber-500" />
              {p.changes} unsaved change{p.changes === 1 ? "" : "s"}
              {stale ? " · recalculating times…" : " · times up to date"}
            </>
          ) : (
            <>
              <CheckCircle2 className="size-3.5 text-emerald-600" /> Saved
            </>
          )}
        </p>
        <div className="ml-auto flex gap-2">
          {p.dirty && (
            <Button variant="ghost" size="sm" onClick={p.onRevert}>
              <Undo2 data-icon="inline-start" /> Revert
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmReset(true)}
            disabled={p.resetting || p.locked}
          >
            <RotateCcw data-icon="inline-start" /> Reset to generated
          </Button>
          <Button
            size="sm"
            onClick={p.onSave}
            disabled={p.locked || !p.dirty || blocked || p.saving || stale}
          >
            {p.saving ? <Spinner /> : <Save data-icon="inline-start" />} Save
            trip
          </Button>
        </div>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset {trip.ref} to the generated plan?</DialogTitle>
            <DialogDescription>
              Stops and their order return to what the engine produced. Orders
              you added are sent back to the deferred pool; unsaved edits on
              this trip are lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={() => {
                setConfirmReset(false)
                p.onReset()
              }}
            >
              Reset trip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
