"use client"

import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  Fuel,
  MoreHorizontal,
  PackageX,
  Scale,
  Snowflake,
  Timer,
  TrendingDown,
  Truck,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import { DEFERRAL_REASON_META, DOCK_LABEL, PARKING_LABEL, type DeferralReason } from "@waypoint/shared"
import { BrandBadge, TempIcon, TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate, fmtNum } from "@/lib/format"
import type { Decision } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useDeferOrder } from "../queries"
import { outletWindow } from "../shared/window"

const REASON_ICON: Record<DeferralReason, LucideIcon> = {
  REEFER_CAPACITY: Snowflake,
  VEHICLE_CAPACITY: Scale,
  FUEL_QUOTA: Fuel,
  DELIVERY_WINDOW: Clock,
  ACCESS_RESTRICTION: Ban,
  VEHICLE_UNAVAILABLE: Truck,
  LOADING_SHORTFALL: PackageX,
  TIME_BUDGET: Timer,
  LOWER_PRIORITY: TrendingDown,
  OTHER: MoreHorizontal,
}

/** Record why an order moves to the next run. Required reason + optional note, audit-logged. */
export function DeferSheet({ planId, decision, onClose }: { planId: string; decision: Decision | null; onClose: () => void }) {
  const defer = useDeferOrder(planId)
  // Mounted with key={orderId}: starts from the reason the engine suggested.
  const [reason, setReason] = useState<DeferralReason | null>(decision?.reason ?? null)
  const [note, setNote] = useState("")

  const o = decision?.order
  const previous = o?.deferCount ?? 0

  return (
    <Sheet open={!!decision} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Defer order</SheetTitle>
          <SheetDescription>Record why this order moves to the next run. Store manager is notified on publish.</SheetDescription>
        </SheetHeader>
        {o && (
          <div className="grid gap-4 p-4 text-sm">
            <div className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{o.ref}</span>
                <BrandBadge brand={o.brand} />
                <span className="ml-auto text-xs text-muted-foreground">
                  {o.outlet.id} · {o.outlet.districtId}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <span className="inline-flex items-center gap-1">
                  <TempIcon temp={o.temp} /> {o.temp === "CHILLED" ? "Chilled" : "Ambient"}
                </span>
                <span>{fmtNum(o.weightKg)} kg</span>
                <span>{fmtNum(o.volumeM3, 2)} m³</span>
                <span className="tabular-nums">{outletWindow(o.outlet)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Dock: {DOCK_LABEL[o.outlet.dockType]}</span>
                <span>Access: {PARKING_LABEL[o.outlet.parkingConstraint]}</span>
                <span>Last served: {o.outlet.lastDeliveredOn ? fmtDate(o.outlet.lastDeliveredOn, { day: "numeric", month: "short" }) : "—"}</span>
                <span>Previous deferrals: {previous}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <p className="font-medium">
                Deferral reason <span className="text-destructive">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(DEFERRAL_REASON_META) as DeferralReason[]).map((r) => {
                  const Icon = REASON_ICON[r]
                  const selected = reason === r
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={cn(
                        "relative flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50",
                        selected && "border-primary bg-primary/5 ring-1 ring-primary",
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                      <span className="grid">
                        <span className="text-xs font-medium">{DEFERRAL_REASON_META[r].label}</span>
                        <span className="text-[11px] text-muted-foreground">{DEFERRAL_REASON_META[r].hint}</span>
                      </span>
                      {selected && <Check className="absolute top-2 right-2 size-3.5 text-primary" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <p className="font-medium">Note</p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder={decision?.explanation ?? "What should the store and the next planner know?"}
                rows={3}
              />
              <p className="text-right text-[11px] text-muted-foreground">{note.length}/500</p>
            </div>

            {previous > 0 && (
              <div className={cn("flex gap-2 rounded-lg p-3 text-xs ring-1 ring-inset", TONE.red)}>
                <CircleAlert className="size-4 shrink-0" />
                <span>
                  <span className="font-medium">Repeat deferral.</span> This order was already deferred {previous}× — deferring again leaves{" "}
                  {o.outlet.id} unserved on consecutive runs.
                </span>
              </div>
            )}
          </div>
        )}
        <SheetFooter className="border-t sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!reason || defer.isPending}
            onClick={() =>
              decision &&
              reason &&
              defer.mutate({ orderId: decision.orderId, reason, note: note || undefined }, { onSuccess: onClose })
            }
          >
            {defer.isPending ? <Spinner /> : <Check data-icon="inline-start" />} Confirm deferral
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
