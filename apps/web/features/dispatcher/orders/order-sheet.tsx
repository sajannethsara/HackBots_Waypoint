"use client"

import { useQuery } from "@tanstack/react-query"
import { DOCK_LABEL, PARKING_LABEL, type Brand, type DeferralReason, type DockType, type ParkingConstraint } from "@waypoint/shared"
import { BrandBadge, ReasonBadge, StatusBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { fmtDate, fmtNum } from "@/lib/format"
import type { OrderLine, OutletLite } from "@/lib/types"
import { ScoreBreakdown } from "../shared/score-breakdown"
import { outletWindow } from "../shared/window"

interface OrderDetail {
  id: string
  ref: string
  brand: Brand
  temp: "CHILLED" | "AMBIENT"
  status: string
  units: number
  weightKg: number
  volumeM3: number
  deferCount: number
  requestedDate: string
  deliveryDate: string
  submittedAt: string
  notes: string | null
  createdBy: { name: string }
  outlet: OutletLite & { dockType: DockType; parkingConstraint: ParkingConstraint; lastDeliveredOn: string | null }
  lines: OrderLine[]
  decisions: {
    id: string
    decision: "SERVED" | "DEFERRED"
    source: string
    priorityScore: number
    scoreBreakdown: Record<string, unknown>
    reason: DeferralReason | null
    explanation: string | null
    note: string | null
    createdAt: string
    plan: { version: number; status: string; date: string }
    overriddenBy: { name: string } | null
  }[]
}

export function OrderSheet({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { data: o } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<OrderDetail>(`/orders/${orderId}`),
    enabled: !!orderId,
  })

  return (
    <Sheet open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {!o || o.id !== orderId ? (
          <div className="grid gap-3 p-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-32" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex items-center gap-2">
                {o.ref} <StatusBadge status={o.status} />
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <BrandBadge brand={o.brand} /> {o.outlet.id} · {o.outlet.districtId}
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 p-4 text-sm">
              <dl className="grid grid-cols-3 gap-3">
                <Fact label="Weight" value={`${fmtNum(o.weightKg)} kg`} />
                <Fact label="Volume" value={`${fmtNum(o.volumeM3, 2)} m³`} />
                <Fact
                  label="Temperature"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <TempIcon temp={o.temp} /> {o.temp === "CHILLED" ? "Chilled" : "Ambient"}
                    </span>
                  }
                />
                <Fact label="Window" value={outletWindow(o.outlet)} />
                <Fact label="Dock" value={DOCK_LABEL[o.outlet.dockType]} />
                <Fact label="Access" value={PARKING_LABEL[o.outlet.parkingConstraint]} />
                <Fact label="Requested for" value={fmtDate(o.requestedDate, { day: "numeric", month: "short" })} />
                <Fact label="Current run" value={fmtDate(o.deliveryDate, { day: "numeric", month: "short" })} />
                <Fact label="Last delivered" value={o.outlet.lastDeliveredOn ? fmtDate(o.outlet.lastDeliveredOn, { day: "numeric", month: "short" }) : "—"} />
              </dl>
              {o.deferCount > 0 && (
                <TagBadge tone="amber">Already deferred {o.deferCount}× — prioritise this outlet</TagBadge>
              )}

              <Separator />
              <div className="grid gap-2">
                <p className="font-medium">Items</p>
                {o.lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">
                      {l.description} <span className="text-muted-foreground">· {l.category.toLowerCase()}</span>
                    </span>
                    <span className="tabular-nums">×{l.quantity}</span>
                    <span className="w-16 text-right text-muted-foreground tabular-nums">{fmtNum(l.weightKg)} kg</span>
                  </div>
                ))}
              </div>

              <Separator />
              <div className="grid gap-3">
                <p className="font-medium">Decision history</p>
                {!o.decisions.length && <p className="text-xs text-muted-foreground">Not planned yet.</p>}
                {o.decisions.map((d) => (
                  <div key={d.id} className="grid gap-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.decision} />
                      {d.reason && <ReasonBadge reason={d.reason} />}
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        Plan v{d.plan.version} · {d.source === "DISPATCHER" ? (d.overriddenBy?.name ?? "Dispatcher") : "Engine"}
                      </span>
                    </div>
                    {d.explanation && <p className="text-xs">{d.explanation}</p>}
                    <ScoreBreakdown score={d.priorityScore} breakdown={d.scoreBreakdown} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}
