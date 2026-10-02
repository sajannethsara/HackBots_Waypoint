"use client"

import { Ban, Clock, ShieldAlert, Snowflake, Store, Truck, TriangleAlert, PackageMinus, PackageX, X, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { DRIVER_ISSUE_TYPES, type IssueSeverity, type IssueType } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useDriver } from "../lib/driver-provider"
import { PhotoField } from "./photo-field"

const TYPES: Record<(typeof DRIVER_ISSUE_TYPES)[number], { label: string; icon: LucideIcon; severity: IssueSeverity }> = {
  OUTLET_CLOSED: { label: "Outlet closed", icon: Store, severity: "MEDIUM" },
  ACCESS_BLOCKED: { label: "Can't get access", icon: Ban, severity: "MEDIUM" },
  VEHICLE_BREAKDOWN: { label: "Breakdown", icon: Truck, severity: "HIGH" },
  LOAD_DAMAGED: { label: "Goods damaged", icon: PackageX, severity: "MEDIUM" },
  LOAD_MISSING: { label: "Items missing", icon: PackageMinus, severity: "MEDIUM" },
  TEMPERATURE: { label: "Temperature alarm", icon: Snowflake, severity: "HIGH" },
  LATE_ARRIVAL: { label: "Running late", icon: Clock, severity: "LOW" },
  OTHER: { label: "Something else", icon: ShieldAlert, severity: "MEDIUM" },
}

const SEVERITIES: { value: IssueSeverity; label: string }[] = [
  { value: "LOW", label: "Minor" },
  { value: "MEDIUM", label: "Needs help" },
  { value: "HIGH", label: "Urgent" },
]

/** Quick problem report. Works offline: it is queued and reaches dispatch when the signal returns. */
export function ReportIssue({ stopId, onClose }: { stopId?: string; onClose: () => void }) {
  const { bundle, reportIssue } = useDriver()
  const stop = bundle.trips.flatMap((t) => t.stops).find((s) => s.id === stopId)
  const [type, setType] = useState<IssueType | null>(null)
  const [severity, setSeverity] = useState<IssueSeverity>("MEDIUM")
  const [text, setText] = useState("")
  const [photo, setPhoto] = useState<string | null>(null)

  const pick = (t: (typeof DRIVER_ISSUE_TYPES)[number]) => {
    setType(t)
    setSeverity(TYPES[t].severity)
  }
  const ok = type && text.trim().length >= 3

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 pt-[env(safe-area-inset-top)]">
        <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close">
          <X />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Report a problem</p>
          <p className="truncate text-[11px] text-muted-foreground">{stop ? stop.outlet.name : "This trip"} · goes straight to dispatch</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="grid gap-5">
          <section className="grid gap-2">
            <h2 className="text-sm font-medium">What happened?</h2>
            <div className="grid grid-cols-2 gap-2">
              {DRIVER_ISSUE_TYPES.map((t) => {
                const m = TYPES[t]
                const on = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => pick(t)}
                    className={cn("flex min-h-14 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left text-sm transition-colors active:bg-muted", on && "border-primary bg-primary/5 ring-1 ring-primary/30")}
                  >
                    <m.icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn(on && "font-medium")}>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="grid gap-2">
            <h2 className="text-sm font-medium">How urgent?</h2>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={cn(
                    "h-11 rounded-xl border text-sm transition-colors",
                    severity === s.value ? (s.value === "HIGH" ? "border-red-500 bg-red-50 font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300" : "border-primary bg-primary/5 font-medium text-primary") : "bg-card active:bg-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-2">
            <label htmlFor="desc" className="text-sm font-medium">
              Tell dispatch what is going on
            </label>
            <Textarea id="desc" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Gate is locked, nobody answering the phone" />
            <PhotoField value={photo} onChange={setPhoto} />
          </section>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> No signal? It is saved on this phone and sent as soon as you are back online.
          </p>
        </div>
      </div>

      <footer className="shrink-0 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          className="h-12 w-full text-[15px]"
          disabled={!ok}
          onClick={() => {
            reportIssue({ type: type!, severity, description: text, stop, photo })
            toast.success("Problem reported", { description: "Dispatch will see it as soon as it syncs." })
            onClose()
          }}
        >
          Send to dispatch
        </Button>
      </footer>
    </div>
  )
}
