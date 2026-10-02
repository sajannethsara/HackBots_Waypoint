import { Boxes, CheckCircle2, Clock, Flag, LogIn, MapPin, Send, Sparkles, Truck, Warehouse, type LucideIcon } from "lucide-react"
import type { LiveClock, LiveTrip } from "@waypoint/shared"
import { fmtDateTime, minToHHMM } from "@/lib/format"
import type { AuditEntry, TripDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

interface LogItem {
  at: number
  icon: LucideIcon
  title: string
  detail?: string
  happened: boolean
  tone?: "ok" | "warn" | "bad"
}

/** The operating-day story of this trip: what happened (solid) and what is expected next (faded). */
export function TripLog({ detail, live, clock }: { detail: TripDetail; live: LiveTrip; clock: LiveClock | null }) {
  const now = clock?.minute ?? -1
  const t = detail.trip
  const items: LogItem[] = []
  const departAt = live.actualDepartMin ?? t.plannedDepartMin
  items.push({ at: t.plannedDepartMin - 30, icon: Boxes, title: "Loading starts at the dock", detail: `${t.stops.length} orders · ${Math.round(t.loadWeightKg)} kg`, happened: now >= t.plannedDepartMin - 30 })
  items.push({
    at: departAt,
    icon: Truck,
    title: `Departed ${detail.depot.name}`,
    detail: live.actualDepartMin != null ? `${live.actualDepartMin - t.plannedDepartMin} min after plan` : `Planned ${minToHHMM(t.plannedDepartMin)}`,
    happened: live.actualDepartMin != null,
    tone: live.actualDepartMin != null && live.actualDepartMin - t.plannedDepartMin > 10 ? "warn" : "ok",
  })
  for (const s of live.stops) {
    items.push({
      at: s.etaMin,
      icon: MapPin,
      title: `Arrived at ${s.outletId}`,
      detail: `Stop ${s.seq} · planned ${minToHHMM(s.plannedArrivalMin)}${s.delayMin ? ` · +${s.delayMin} min` : ""}`,
      happened: s.status !== "PENDING",
      tone: s.late ? "bad" : s.delayMin >= 15 ? "warn" : "ok",
    })
    if (s.completedMin != null || s.status === "PENDING")
      items.push({
        at: s.completedMin ?? s.etaMin + 15,
        icon: CheckCircle2,
        title: `Delivered ${s.orderRef}`,
        detail: s.late ? `After the ${minToHHMM(s.windowCloseMin)} window close` : `Within ${minToHHMM(s.windowOpenMin)}–${minToHHMM(s.windowCloseMin)}`,
        happened: s.completedMin != null,
        tone: s.late ? "warn" : "ok",
      })
  }
  items.push({ at: live.etaReturnMin, icon: Warehouse, title: "Back at depot", detail: detail.sibling ? `Next: ${detail.sibling.ref} (${detail.sibling.districtId})` : "Trip complete", happened: live.status === "COMPLETED" })

  return (
    <ol className="relative grid gap-3 border-l py-1 pl-5 ml-4">
      {items.map((i, k) => (
        <li key={k} className={cn("relative", !i.happened && "opacity-50")}>
          <span
            className={cn(
              "absolute top-0.5 -left-[31px] flex size-5 items-center justify-center rounded-full border bg-background",
              i.happened && i.tone === "ok" && "border-emerald-500 text-emerald-600",
              i.happened && i.tone === "warn" && "border-amber-500 text-amber-600",
              i.happened && i.tone === "bad" && "border-red-500 text-red-600",
            )}
          >
            <i.icon className="size-3" />
          </span>
          <div className="flex items-baseline gap-3 text-sm">
            <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{minToHHMM(Math.round(i.at))}</span>
            <span className="font-medium">{i.title}</span>
            {!i.happened && <span className="text-[11px] text-muted-foreground">expected</span>}
          </div>
          {i.detail && <p className="ml-14 text-xs text-muted-foreground">{i.detail}</p>}
        </li>
      ))}
    </ol>
  )
}

const AUDIT: Record<string, { label: string; icon: LucideIcon }> = {
  PLAN_GENERATED: { label: "Plan generated", icon: Sparkles },
  PLAN_PUBLISHED: { label: "Plan published", icon: Send },
  DECISION_OVERRIDDEN: { label: "Order deferred by dispatcher", icon: Flag },
  ORDER_ASSIGNED: { label: "Order assigned by dispatcher", icon: LogIn },
  ISSUE_REPORTED: { label: "Issue reported", icon: Flag },
  ISSUE_ACKNOWLEDGED: { label: "Issue acknowledged", icon: Clock },
  ISSUE_RESOLVED: { label: "Issue resolved", icon: CheckCircle2 },
}

/** System record: who changed what about this trip, its orders and its issues. */
export function AuditTrail({ audit }: { audit: AuditEntry[] }) {
  if (!audit.length) return <p className="p-6 text-center text-sm text-muted-foreground">No recorded actions yet.</p>
  return (
    <ol className="grid divide-y">
      {audit.map((a) => {
        const m = AUDIT[a.action] ?? { label: a.action, icon: Clock }
        return (
          <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
            <m.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">
                {a.actor} · {a.entityType.toLowerCase()}
                {a.after && "served" in a.after ? ` · ${a.after.served} served, ${a.after.deferred} deferred` : ""}
                {a.after && "reason" in a.after ? ` · ${String(a.after.reason).toLowerCase().replace(/_/g, " ")}` : ""}
              </p>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{fmtDateTime(a.at)}</span>
          </li>
        )
      })}
    </ol>
  )
}
