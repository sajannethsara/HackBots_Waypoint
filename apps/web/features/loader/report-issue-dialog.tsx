"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ArrowDownUp, Clock, PackageMinus, PackageX, Send, TriangleAlert, Truck, type LucideIcon } from "lucide-react"
import type { IssueType, LoaderIssueInput, LoaderStop, LoaderTrip } from "@waypoint/shared"
import { TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fmtNum } from "@/lib/format"
import { cn } from "@/lib/utils"
import { loadingOrder } from "./model"
import { sentMessage, useReportIssue } from "./queries"
import { TOUCH, TOUCH_MENU } from "./touch"

type Kind = Exclude<LoaderIssueInput["kind"], "capacity">

const KINDS: { id: Kind; type: IssueType; title: string; hint: string; icon: LucideIcon }[] = [
  { id: "missing", type: "LOAD_MISSING", title: "Missing items", hint: "Fewer units staged than the order needs", icon: PackageMinus },
  { id: "damaged", type: "LOAD_DAMAGED", title: "Damaged items", hint: "Crushed cartons, leaks or broken seals", icon: PackageX },
  { id: "sequence", type: "SEQUENCE_ISSUE", title: "Wrong loading order", hint: "Staging does not match the reverse delivery sequence", icon: ArrowDownUp },
  { id: "delay", type: "DEPARTURE_DELAY", title: "Departure delay", hint: "The vehicle cannot leave on time", icon: Clock },
]

const DELAY_REASONS = ["Stock not staged yet", "Waiting for replacement items", "Forklift or equipment problem", "Vehicle not ready", "Driver not at the dock", "Other"]

/** Units entered per order line, as typed (validated on use). */
type Counts = Record<string, string>

/** One affected order line, with how many of its units are short or damaged. */
interface AffectedLine {
  line: LoaderStop["order"]["lines"][number]
  units: number
}

/**
 * Report a loading problem to dispatch, precise down to the order line and unit count.
 * The API raises one issue per affected item and writes the issue text itself from the same facts.
 * Mount with a `key` per stop so opening it from another stop starts a fresh form.
 */
export function ReportIssueDialog({
  trip,
  stopId: initialStopId,
  open,
  onOpenChange,
}: {
  trip: LoaderTrip
  /** Pre-select the order when opened from a stop in the loading sequence. */
  stopId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [kind, setKind] = useState<Kind>("missing")
  const [stopId, setStopId] = useState(initialStopId ?? "")
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [counts, setCounts] = useState<Counts>({})
  const [delayMin, setDelayMin] = useState("")
  const [delayReason, setDelayReason] = useState(DELAY_REASONS[0])
  const [notes, setNotes] = useState("")
  // One id per report: resubmitting after a network error cannot raise the same issues twice; a new one after each send.
  const [clientId, setClientId] = useState(() => crypto.randomUUID())
  const report = useReportIssue(trip.id)

  const sequence = loadingOrder(trip.stops)
  const stop = trip.stops.find((s) => s.id === stopId)
  const position = stop ? sequence.findIndex((s) => s.id === stop.id) + 1 : 0
  const byItem = kind === "missing" || kind === "damaged"

  const affected: AffectedLine[] = byItem && stop ? stop.order.lines.filter((l) => picked[l.id]).map((l) => ({ line: l, units: Number(counts[l.id]) })) : []
  const badLine = affected.find((a) => !Number.isInteger(a.units) || a.units < 1 || a.units > a.line.quantity)
  const problems = [
    kind !== "delay" && !stop && "Choose the affected order",
    byItem && stop && affected.length === 0 && `Tick at least one ${kind} item`,
    badLine && `${badLine.line.description}: enter between 1 and ${badLine.line.quantity} units`,
    kind === "delay" && !(Number(delayMin) > 0) && "Enter the expected delay in minutes",
  ].filter(Boolean) as string[]

  const summary =
    problems.length === 0
      ? describeIssue({ kind, trip, stop, position, total: sequence.length, affected, delayMin: Number(delayMin), delayReason, notes })
      : null

  const send = () =>
    report.mutate(
      {
        clientId,
        kind,
        tripId: trip.id,
        stopId: kind === "delay" ? undefined : stopId,
        lines: affected.map((a) => ({ orderLineId: a.line.id, units: a.units })),
        delayMin: kind === "delay" ? Number(delayMin) : undefined,
        delayReason: kind === "delay" ? delayReason : undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(sentMessage(r), { description: "Dispatch has been notified and an issue chat is open in your inbox." })
          setClientId(crypto.randomUUID())
          setPicked({})
          setCounts({})
          setNotes("")
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )

  const changeStop = (id: string) => {
    setStopId(id)
    setPicked({})
    setCounts({})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90svh] gap-4 overflow-y-auto sm:max-w-2xl", TOUCH)}>
        <DialogHeader className="flex-row items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", TONE.red)}>
            <TriangleAlert className="size-5" />
          </span>
          <div className="grid gap-1">
            <DialogTitle>Report an issue to dispatch</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Truck className="size-3.5" />
              <span className="font-medium text-foreground">{trip.vehicle.id}</span>· {trip.ref} · Trip {trip.tripNo}
              {stop && (
                <>
                  · <span className="font-medium text-foreground">{stop.order.ref}</span> → {stop.outlet.name}
                </>
              )}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid gap-2">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">What went wrong</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={kind === k.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
                  kind === k.id && "border-primary bg-primary/5 ring-1 ring-primary",
                )}
              >
                <k.icon className={cn("mt-0.5 size-4 shrink-0", kind === k.id ? "text-primary" : "text-muted-foreground")} />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{k.title}</span>
                  <span className="text-xs text-muted-foreground">{k.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {kind !== "delay" && (
          <div className="grid gap-1.5">
            <Label>Affected order</Label>
            <Select value={stopId} onValueChange={(v) => changeStop(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) => {
                    const s = trip.stops.find((x) => x.id === v)
                    return s ? `SEQ #${sequence.indexOf(s) + 1} · ${s.order.ref} · ${s.outlet.name}` : "Choose the affected order"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className={TOUCH_MENU}>
                {sequence.map((s, i) => (
                  <SelectItem key={s.id} value={s.id}>
                    SEQ #{i + 1} · {s.order.ref} · {s.outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {byItem && stop && (
          <div className="grid gap-1.5">
            <Label>{kind === "missing" ? "Which items are missing, and how many units?" : "Which items are damaged, and how many units?"}</Label>
            <div className="divide-y rounded-lg border">
              {stop.order.lines.map((l) => {
                const on = !!picked[l.id]
                return (
                  <div key={l.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", on && "bg-muted/40")}>
                    <Checkbox
                      checked={on}
                      onCheckedChange={(c) => {
                        setPicked((p) => ({ ...p, [l.id]: !!c }))
                        if (c && !counts[l.id]) setCounts((n) => ({ ...n, [l.id]: "1" }))
                      }}
                      aria-label={`${l.description} is ${kind}`}
                    />
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-medium">{l.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.category.charAt(0) + l.category.slice(1).toLowerCase()} · {l.quantity} units ordered · {fmtNum(l.weightKg, 1)} kg
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={l.quantity}
                        disabled={!on}
                        value={on ? (counts[l.id] ?? "") : ""}
                        onChange={(e) => setCounts((n) => ({ ...n, [l.id]: e.target.value }))}
                        className="h-8 w-20 text-right"
                        aria-label={`Units ${kind}: ${l.description}`}
                      />
                      <span className="w-24 text-muted-foreground">of {l.quantity} {kind}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {kind === "sequence" && stop && (
          <p className={cn("rounded-lg px-3 py-2 text-sm ring-1 ring-inset", TONE.blue)}>
            Planned: {stop.order.ref} is <span className="font-semibold">SEQ #{position}</span> of {sequence.length} (delivery stop {stop.seq})
            {position > 1 && `, loaded after ${sequence[position - 2].order.ref}`}
            {position < sequence.length && `, before ${sequence[position].order.ref}`}. Describe how it was staged below.
          </p>
        )}

        {kind === "delay" && (
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-delay">Expected delay</Label>
              <div className="flex items-center gap-2 text-sm">
                <Input id="issue-delay" type="number" inputMode="numeric" min={1} value={delayMin} onChange={(e) => setDelayMin(e.target.value)} className="h-8 w-20 text-right" />
                <span className="text-muted-foreground">minutes</span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Select value={delayReason} onValueChange={(v) => setDelayReason(String(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={TOUCH_MENU}>
                  {DELAY_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="issue-notes">Notes for dispatch (optional)</Label>
          <Textarea
            id="issue-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={kind === "sequence" ? "e.g. arrived at the dock before the Moratuwa pallets" : "What you see at the dock"}
          />
        </div>

        <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            <Send className="size-3" /> What dispatch will receive
          </p>
          {summary ? (
            <>
              <p className="text-sm font-medium">{summary.title}</p>
              <ul className="grid gap-0.5 text-sm text-muted-foreground">
                {summary.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="grid gap-0.5 text-sm text-muted-foreground">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!summary || report.isPending}>
            <Send /> {report.isPending ? "Sending…" : "Send to dispatcher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The human-readable report: a title line and one detail line per fact, as dispatch will read it. */
export function describeIssue(p: {
  kind: Kind
  trip: LoaderTrip
  stop?: LoaderStop
  position: number
  total: number
  affected: AffectedLine[]
  delayMin: number
  delayReason: string
  notes: string
}): { title: string; details: string[] } {
  const k = KINDS.find((x) => x.id === p.kind)!
  const where = p.stop ? ` · ${p.stop.order.ref} → ${p.stop.outlet.name}` : ""
  const title = `${k.title} · ${p.trip.vehicle.id} (${p.trip.ref})${where}`
  const details: string[] = []
  if (p.kind === "missing" || p.kind === "damaged") {
    for (const a of p.affected) {
      const kg = (a.line.weightKg * a.units) / a.line.quantity
      details.push(`${a.line.description}: ${a.units} of ${a.line.quantity} units ${p.kind} (≈ ${fmtNum(kg, 1)} kg)`)
    }
    const units = p.affected.reduce((t, a) => t + a.units, 0)
    if (p.affected.length > 1) details.push(`Total: ${units} units ${p.kind} across ${p.affected.length} items`)
  }
  if (p.kind === "sequence" && p.stop) details.push(`Planned position: SEQ #${p.position} of ${p.total} (delivery stop ${p.stop.seq})`)
  if (p.kind === "delay") details.push(`Expected delay: ${p.delayMin} min · ${p.delayReason}`)
  if (p.notes.trim()) details.push(`Note: ${p.notes.trim()}`)
  return { title, details }
}
