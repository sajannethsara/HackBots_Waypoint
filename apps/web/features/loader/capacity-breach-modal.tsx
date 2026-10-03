"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Box, CircleAlert, Package, Send, Weight } from "lucide-react"
import { toast } from "sonner"
import type { CapacityResolution, LoaderCapacityBreach, LoaderStop } from "@waypoint/shared"
import { TagBadge, TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { fmtNum } from "@/lib/format"
import { cn } from "@/lib/utils"
import { issuesHref, sentMessage, useReportIssue } from "./queries"
import { TOUCH } from "./touch"


const RESOLUTIONS: { id: CapacityResolution; title: string; hint: string; tag: string }[] = [
  { id: "hold", title: "Hold this stop's items back", hint: "Leave the order off this vehicle and alert dispatch to re-plan it.", tag: "Recommended" },
  { id: "discrepancy", title: "Report a data discrepancy", hint: "The weights or volumes on record look wrong: ask dispatch to verify.", tag: "Verification" },
]

/**
 * Shown when the API refuses a stop because it would overload the vehicle. Every number comes
 * straight from the 409 body; there is deliberately no way for the loader to override it.
 */
export function CapacityBreachModal({
  breach,
  stop,
  tripId,
  vehicleId,
  onOpenChange,
}: {
  breach: LoaderCapacityBreach | null
  stop: LoaderStop | null
  tripId: string
  vehicleId: string
  onOpenChange: (open: boolean) => void
}) {
  const [resolution, setResolution] = useState<CapacityResolution>("hold")
  const [clientId, setClientId] = useState(() => crypto.randomUUID())
  const report = useReportIssue(tripId)
  const router = useRouter()

  const send = () =>
    stop &&
    report.mutate(
      { clientId, kind: "capacity", tripId, stopId: stop.id, resolution },
      {
        onSuccess: (r) => {
          toast.success(sentMessage(r), {
            description: resolution === "hold" ? `${stop.order.ref} stays off ${vehicleId}; dispatch will re-plan it.` : "Dispatch will verify the recorded weights and volumes.",
          })
          setClientId(crypto.randomUUID())
          onOpenChange(false)
          router.push(issuesHref(r.issues.map((i) => i.id), tripId, true))
        },
        onError: (err) => toast.error(err.message),
      },
    )

  return (
    <Dialog open={!!breach} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90svh] gap-4 overflow-y-auto sm:max-w-2xl", TOUCH)}>
        {breach && (
          <>
            <DialogHeader className="flex-row items-start gap-3">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", TONE.red)}>
                <CircleAlert className="size-5" />
              </span>
              <div className="grid gap-1">
                <TagBadge tone="red">Capacity threshold exceeded</TagBadge>
                <DialogTitle>Loading capacity breach</DialogTitle>
                <DialogDescription>
                  {breach.message}. {stop ? `Confirming ${stop.order.ref} ` : "Confirming this stop "}would take {vehicleId} past its certified limit, so it was not
                  loaded.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <Measure icon={Weight} label="Gross weight" unit="kg" digits={1} {...breach.weight} />
              <Measure icon={Box} label="Volumetric stowage" unit="m³" digits={2} {...breach.volume} />
            </div>

            {stop && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", TONE.green)}>
                  <Package className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Consignment {stop.order.ref} · {stop.outlet.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtNum(stop.order.weightKg, 1)} kg · {fmtNum(stop.order.volumeM3, 2)} m³ · {stop.order.units} units · delivery stop {stop.seq}
                  </p>
                </div>
                <TagBadge tone="red">Not loaded</TagBadge>
              </div>
            )}

            <div className="grid gap-2">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Resolution (select one — loader override disabled)</p>
              <RadioGroup value={resolution} onValueChange={(v) => setResolution(v as CapacityResolution)} className="sm:grid-cols-2">
                {RESOLUTIONS.map((r) => (
                  <label
                    key={r.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40",
                      resolution === r.id && "border-primary bg-primary/5 ring-1 ring-primary",
                    )}
                  >
                    <RadioGroupItem value={r.id} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {r.title} <TagBadge tone={r.id === "hold" ? "green" : "gray"}>{r.tag}</TagBadge>
                      </span>
                      <span className="text-xs text-muted-foreground">{r.hint}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Back to vehicle
              </Button>
              <Button onClick={send} disabled={!stop || report.isPending}>
                <Send /> {report.isPending ? "Sending…" : "Submit to dispatcher"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Measure({ icon: Icon, label, unit, digits, loaded, cap }: { icon: typeof Weight; label: string; unit: string; digits: number; loaded: number; cap: number }) {
  const over = loaded - cap
  const used = cap ? (loaded / cap) * 100 : 0
  const tone = over > 0 ? "red" : used >= 90 ? "amber" : "green"
  return (
    <div className={cn("grid gap-2 rounded-xl p-3 ring-1 ring-inset", TONE[tone])}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <Icon className="size-3.5" /> {label}
        </span>
        <TagBadge tone={tone}>{over > 0 ? "Over limit" : used >= 90 ? "Near limit" : "Within limit"}</TagBadge>
      </div>
      <p className="text-foreground">
        <span className={cn("text-2xl font-bold tabular-nums", over > 0 && "text-destructive")}>
          {fmtNum(loaded, digits)} {unit}
        </span>
        <span className="text-sm text-muted-foreground">
          {" "}
          / {fmtNum(cap, digits)} {unit} max
        </span>
      </p>
      <p className="text-xs font-medium">
        {over > 0
          ? `+${fmtNum(over, digits)} ${unit} over the limit (${fmtNum(used, 1)}% of capacity)`
          : `${fmtNum(used, 1)}% used · ${fmtNum(-over, digits)} ${unit} to spare`}
      </p>
    </div>
  )
}
