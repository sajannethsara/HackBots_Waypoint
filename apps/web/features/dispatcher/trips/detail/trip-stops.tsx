"use client"

import { Fragment, useState } from "react"
import { ChevronRight, FileSignature, Warehouse } from "lucide-react"
import { DOCK_LABEL, PARKING_LABEL, type LiveTrip } from "@waypoint/shared"
import { TagBadge, TempIcon } from "@/components/shared/badges"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtNum, minToHHMM } from "@/lib/format"
import type { TripDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ScoreBreakdown } from "../../shared/score-breakdown"
import { outletWindow } from "../../shared/window"

/** Stop-by-stop: plan vs live, window compliance, load and proof of delivery. */
export function TripStops({ detail, live, issueCountByStop }: { detail: TripDetail; live: LiveTrip; issueCountByStop: Map<string, number> }) {
  const [open, setOpen] = useState<string | null>(null)
  const t = detail.trip
  const liveById = new Map(live.stops.map((s) => [s.id, s]))

  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead className="w-8 pl-4" />
          <TableHead className="w-8">#</TableHead>
          <TableHead>Outlet</TableHead>
          <TableHead>Order</TableHead>
          <TableHead className="text-right">Load</TableHead>
          <TableHead>Window</TableHead>
          <TableHead className="text-right">Planned</TableHead>
          <TableHead className="text-right">Actual / ETA</TableHead>
          <TableHead className="text-right">Δ</TableHead>
          <TableHead className="text-right">Service</TableHead>
          <TableHead className="pr-4">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="bg-muted/30 text-xs text-muted-foreground hover:bg-muted/30">
          <TableCell className="pl-4" />
          <TableCell>
            <Warehouse className="size-4" />
          </TableCell>
          <TableCell colSpan={4}>Depart {detail.depot.name}</TableCell>
          <TableCell className="text-right tabular-nums">{minToHHMM(t.plannedDepartMin)}</TableCell>
          <TableCell className="text-right font-medium text-foreground tabular-nums">{live.actualDepartMin != null ? minToHHMM(live.actualDepartMin) : "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{live.actualDepartMin != null ? `+${live.actualDepartMin - t.plannedDepartMin}` : ""}</TableCell>
          <TableCell colSpan={2} />
        </TableRow>
        {t.stops.map((s) => {
          const l = liveById.get(s.id)
          const delay = l ? l.etaMin - s.plannedArrivalMin : 0
          const issues = issueCountByStop.get(s.id) ?? 0
          const decision = s.order.decisions[0]
          return (
            <Fragment key={s.id}>
              <TableRow className={cn("cursor-pointer", l?.late && l.status !== "COMPLETED" && "bg-red-50/60 dark:bg-red-500/5")} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <TableCell className="pl-4">
                  <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open === s.id && "rotate-90")} />
                </TableCell>
                <TableCell>
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">{s.seq}</span>
                </TableCell>
                <TableCell>
                  <div className="grid leading-tight">
                    <span className="font-medium">{s.order.outlet.id}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {DOCK_LABEL[s.order.outlet.dockType]}
                      {s.order.outlet.parkingConstraint !== "NORMAL" && ` · ${PARKING_LABEL[s.order.outlet.parkingConstraint]}`}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <TempIcon temp={s.order.temp} /> {s.order.ref}
                    {s.order.deferCount > 0 && <TagBadge tone="amber">↻{s.order.deferCount}</TagBadge>}
                    {issues > 0 && <TagBadge tone="red">{issues} issue{issues > 1 ? "s" : ""}</TagBadge>}
                  </span>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {fmtNum(s.order.weightKg)} kg
                  <div className="text-muted-foreground">{fmtNum(s.order.volumeM3, 2)} m³</div>
                </TableCell>
                <TableCell className="text-xs tabular-nums">{outletWindow(s.order.outlet)}</TableCell>
                <TableCell className="text-right tabular-nums">{minToHHMM(s.plannedArrivalMin)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {l ? (l.status === "PENDING" ? <span className="text-muted-foreground">~{minToHHMM(l.etaMin)}</span> : minToHHMM(l.etaMin)) : "—"}
                </TableCell>
                <TableCell className={cn("text-right text-xs tabular-nums", delay >= 15 ? "text-red-600" : delay > 0 ? "text-amber-600" : "text-muted-foreground")}>
                  {l ? (delay > 0 ? `+${delay}` : delay) : ""}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{s.plannedServiceMin} min</TableCell>
                <TableCell className="pr-4">
                  {!l ? (
                    <TagBadge>Planned</TagBadge>
                  ) : l.status === "COMPLETED" ? (
                    <TagBadge tone={l.late ? "amber" : "green"}>{l.late ? "Delivered late" : "Delivered"}</TagBadge>
                  ) : l.status === "IN_PROGRESS" ? (
                    <TagBadge tone="blue">At outlet</TagBadge>
                  ) : l.late ? (
                    <TagBadge tone="red">Will miss window</TagBadge>
                  ) : (
                    <TagBadge>Pending</TagBadge>
                  )}
                </TableCell>
              </TableRow>
              {open === s.id && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={11} className="bg-muted/30 px-12 py-3">
                    <div className="grid gap-4 text-xs md:grid-cols-3">
                      <div className="grid content-start gap-1.5">
                        <p className="font-medium">Items ({s.order.units} units)</p>
                        {s.order.lines.map((ln) => (
                          <div key={ln.id} className="flex gap-2">
                            <span className="flex-1">
                              {ln.description} <span className="text-muted-foreground">· {ln.category.toLowerCase()}</span>
                            </span>
                            <span className="tabular-nums">×{ln.quantity}</span>
                          </div>
                        ))}
                      </div>
                      <div className="grid content-start gap-1.5">
                        <p className="font-medium">Why it is on this trip</p>
                        {decision ? (
                          <ScoreBreakdown score={decision.priorityScore} breakdown={decision.scoreBreakdown} />
                        ) : (
                          <p className="text-muted-foreground">Assigned manually.</p>
                        )}
                      </div>
                      <div className="grid content-start gap-1.5">
                        <p className="font-medium">Proof & receipt</p>
                        {s.proof ? (
                          <p className="inline-flex items-center gap-1.5">
                            <FileSignature className="size-3.5" /> Signed by {s.proof.recipientName}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">No proof of delivery yet (captured in the driver app).</p>
                        )}
                        <p className="text-muted-foreground">{s.order.receipt ? `Store receipt: ${s.order.receipt.status.toLowerCase().replace(/_/g, " ")}` : "Store has not confirmed receipt."}</p>
                        {s.riskReason && <p className="text-amber-600">Plan note: {s.riskReason}</p>}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
        <TableRow className="bg-muted/30 text-xs text-muted-foreground hover:bg-muted/30">
          <TableCell className="pl-4" />
          <TableCell>
            <Warehouse className="size-4" />
          </TableCell>
          <TableCell colSpan={5}>Return to depot</TableCell>
          <TableCell className="text-right font-medium text-foreground tabular-nums">{minToHHMM(live.etaReturnMin)}</TableCell>
          <TableCell colSpan={3} />
        </TableRow>
      </TableBody>
    </Table>
  )
}
