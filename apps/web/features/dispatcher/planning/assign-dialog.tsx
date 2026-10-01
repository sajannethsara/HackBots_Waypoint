"use client"

import { CheckCircle2, ShieldAlert } from "lucide-react"
import { useMemo, useState } from "react"
import { BrandBadge, TempIcon, TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { fmtNum, pct } from "@/lib/format"
import type { Decision, Plan } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAssignOrder, useCheckAssign } from "../queries"

/**
 * Assisted manual planning: pick a trip, the server validates every operating rule
 * before the dispatcher can commit. Mounted with key={orderId} so state resets per order. Matching trips (same brand + district) are listed first.
 */
export function AssignDialog({ plan, decision, onClose }: { plan: Plan; decision: Decision | null; onClose: () => void }) {
  const [tripId, setTripId] = useState<string | null>(null)
  const check = useCheckAssign(plan.id)
  const assign = useAssignOrder(plan.id)
  const o = decision?.order

  const candidates = useMemo(() => {
    if (!o) return []
    const trips = plan.trips.filter((t) => t.stops.length && !t.stops.some((s) => s.orderId === o.id))
    const score = (t: Plan["trips"][number]) => (t.brand === o.brand ? 2 : 0) + (t.districtId === o.outlet.districtId ? 1 : 0)
    return trips.sort((a, b) => score(b) - score(a) || a.ref.localeCompare(b.ref))
  }, [plan.trips, o])

  const pick = (id: string) => {
    setTripId(id)
    if (decision) check.mutate({ orderId: decision.orderId, tripId: id })
  }

  return (
    <Dialog open={!!decision} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign {o?.ref} to a trip</DialogTitle>
          <DialogDescription>
            {o && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <BrandBadge brand={o.brand} /> {o.outlet.id} · {o.outlet.districtId} · <TempIcon temp={o.temp} /> {fmtNum(o.weightKg)} kg ·{" "}
                {fmtNum(o.volumeM3, 2)} m³
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <ScrollArea className="h-72 rounded-lg border">
            <div className="grid gap-1 p-1.5">
              {candidates.map((t) => {
                const match = o && t.brand === o.brand && t.districtId === o.outlet.districtId
                const util = Math.max(pct(t.loadWeightKg, t.vehicle.weightCapKg), pct(t.loadVolumeM3, t.vehicle.volumeCapM3))
                return (
                  <button
                    key={t.id}
                    onClick={() => pick(t.id)}
                    className={cn(
                      "grid gap-1 rounded-md border border-transparent px-2.5 py-2 text-left text-sm hover:bg-muted/60",
                      tripId === t.id && "border-primary bg-primary/5",
                      !match && "opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.ref}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.vehicleId} · {t.vehicle.temp === "REEFER" ? "Reefer" : "Ambient"} {t.vehicle.type.toLowerCase()}
                      </span>
                      {match && <span className="ml-auto text-[11px] text-primary">match</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <BrandBadge brand={t.brand} /> {t.districtId} · {t.stops.length} stops · {util}% full
                    </div>
                  </button>
                )
              })}
            </div>
          </ScrollArea>

          <div className="grid content-start gap-2">
            <p className="text-sm font-medium">Constraint check</p>
            {!tripId && <p className="text-sm text-muted-foreground">Select a trip to validate capacity, temperature, access, time, fuel and windows.</p>}
            {check.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Checking rules…
              </p>
            )}
            {check.data && tripId && (
              <div className={cn("grid gap-2 rounded-lg p-3 text-sm ring-1 ring-inset", check.data.ok ? TONE.green : TONE.red)}>
                <p className="flex items-center gap-2 font-medium">
                  {check.data.ok ? <CheckCircle2 className="size-4" /> : <ShieldAlert className="size-4" />}
                  {check.data.ok ? `Fits ${check.data.tripRef} — all rules pass` : `${check.data.violations.length} rule(s) would break`}
                </p>
                {check.data.violations.map((v, i) => (
                  <p key={i} className="text-xs">
                    <span className="font-medium">{v.rule.replace("_", " ").toLowerCase()}:</span> {v.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!tripId || !check.data?.ok || assign.isPending}
            onClick={() => decision && tripId && assign.mutate({ orderId: decision.orderId, tripId }, { onSuccess: onClose })}
          >
            {assign.isPending && <Spinner />} Assign to trip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
