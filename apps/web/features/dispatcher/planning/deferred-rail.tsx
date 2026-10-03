"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import { GripVertical, Inbox, PlusCircle, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { DEFERRAL_REASON_META } from "@waypoint/shared"
import { BrandBadge, ReasonBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fmtNum } from "@/lib/format"
import type { Trip } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { PoolItem } from "./canvas"

/** Card body, shared by the rail and the drag overlay. */
export function DeferredCardView({ item, fits, overlay }: { item: PoolItem; fits?: boolean; overlay?: boolean }) {
  const d = item.decision
  const o = d.order
  const reason = item.local?.reason ?? d.reason
  const unavoidable = d.scoreBreakdown?.unavoidable === true
  return (
    <div className={cn("grid gap-1.5 rounded-lg border bg-card p-2.5 text-sm", fits && "border-emerald-500/40", overlay && "shadow-xl ring-1 ring-primary/40")}>
      <div className="flex items-center gap-1.5">
        <GripVertical className="-ml-1 size-3.5 shrink-0 text-muted-foreground" />
        <TempIcon temp={o.temp} />
        <span className="font-medium">{o.ref}</span>
        {o.deferCount > 0 && <TagBadge tone="red">↻{o.deferCount}</TagBadge>}
        <span className="ml-auto">
          <BrandBadge brand={o.brand} />
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {o.outlet.id} · {o.outlet.districtId}
        </span>
        <span className="tabular-nums">
          {fmtNum(o.weightKg)} kg · {fmtNum(o.volumeM3, 1)} m³
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {reason && <ReasonBadge reason={reason} />}
        {item.local ? (
          <TagBadge tone="violet">Pending save</TagBadge>
        ) : d.source === "DISPATCHER" ? (
          <TagBadge tone="violet">Dispatcher</TagBadge>
        ) : (
          <TagBadge tone={unavoidable ? "gray" : "amber"}>{unavoidable ? "Unavoidable" : "Choice"}</TagBadge>
        )}
        {fits && <TagBadge tone="green">Fits this trip</TagBadge>}
      </div>
      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {item.local?.note || d.note || d.explanation || (reason ? DEFERRAL_REASON_META[reason].hint : "")}
      </p>
    </div>
  )
}

function DeferredCard({ item, fits, trip, onAdd, onAssign, canAssign }: { item: PoolItem; fits: boolean; trip?: Trip; onAdd: () => void; onAssign: () => void; canAssign: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pool:${item.decision.orderId}`, data: { type: "pool", orderId: item.decision.orderId } })
  return (
    <div ref={setNodeRef} className={cn("grid gap-1", isDragging && "opacity-35")}>
      <div {...attributes} {...listeners} className="cursor-grab touch-none active:cursor-grabbing">
        <DeferredCardView item={item} fits={fits} />
      </div>
      <div className="flex gap-1 px-0.5">
        <Button variant="ghost" size="xs" className="flex-1 justify-start text-primary" onClick={onAdd} disabled={!trip}>
          <PlusCircle data-icon="inline-start" /> Add to {trip?.ref ?? "trip"}
        </Button>
        {!item.local && canAssign && (
          <Button variant="ghost" size="xs" onClick={onAssign}>
            Assign…
          </Button>
        )}
      </div>
    </div>
  )
}

/** Right-hand rail: every order not on a trip, as draggable cards. Also the drop zone for deferring a stop. */
export function DeferredRail({
  pool,
  trip,
  onAdd,
  onAssign,
  canAssign = true,
  height,
}: {
  pool: PoolItem[]
  trip?: Trip
  onAdd: (orderId: string) => void
  onAssign: (item: PoolItem) => void
  canAssign?: boolean
  height: string
}) {
  const [q, setQ] = useState("")
  const [onlyFits, setOnlyFits] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: "pool-zone", data: { type: "pool-zone" } })

  const fitsTrip = (i: PoolItem) => !!trip && i.decision.order.brand === trip.brand && i.decision.order.outlet.districtId === trip.districtId
  const items = useMemo(() => {
    const needle = q.toLowerCase()
    return pool
      .filter((i) => (!onlyFits || fitsTrip(i)) && (!needle || `${i.decision.order.ref} ${i.decision.order.outlet.id} ${i.decision.order.outlet.districtId}`.toLowerCase().includes(needle)))
      .toSorted((a, b) => Number(fitsTrip(b)) - Number(fitsTrip(a)) || b.decision.priorityScore - a.decision.priorityScore)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, q, onlyFits, trip?.id])

  return (
    <Card ref={setNodeRef} size="sm" className={cn("gap-2 py-3 transition-shadow", height, isOver && "ring-2 ring-primary")}>
      <div className="grid gap-2 px-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Deferred orders</p>
          <TagBadge tone={pool.length ? "red" : "green"}>{pool.length}</TagBadge>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">Drag onto the trip, or onto any trip in the list. Drop a stop here to defer it.</p>
        <div className="relative">
          <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, outlet, district" className="h-7 pl-7 text-sm" />
        </div>
        {trip && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} className="accent-primary" />
            Only {trip.brand.charAt(0) + trip.brand.slice(1).toLowerCase()} · {trip.districtId}
          </label>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3 max-xl:h-72">
        <div className="grid gap-2.5 pb-1">
          {items.map((i) => (
            <DeferredCard key={i.decision.orderId} item={i} fits={fitsTrip(i)} trip={trip} onAdd={() => onAdd(i.decision.orderId)} onAssign={() => onAssign(i)} canAssign={canAssign} />
          ))}
          {!items.length && (
            <div className="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed py-10 text-center text-xs text-muted-foreground">
              <Inbox className="size-5" />
              {pool.length ? "No orders match." : "Every order is allocated."}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}
