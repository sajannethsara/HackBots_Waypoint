"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, ArrowRight, CircleCheck, Minus, PackageMinus, PackageX, Plus, Snowflake, TriangleAlert, Truck } from "lucide-react"
import { toast } from "sonner"
import type { LoaderCapacityBreach, LoaderStop, LoaderTrip } from "@waypoint/shared"
import { TagBadge, TONE } from "@/components/shared/badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useMe } from "@/hooks/use-session"
import { fmtNum } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CapacityBreachModal } from "./capacity-breach-modal"
import { claimState, loadingOrder, stopIssues } from "./model"
import { confirmFailure, issuesHref, useCountStop, useLoaderTrip } from "./queries"
import { ReportIssueDialog } from "./report-issue-dialog"

type Line = LoaderStop["order"]["lines"][number]
type Count = { loaded: number; damaged: number }

/** Item-level loading check for one stop (Figma 3b): count each line onto the truck, flag what is short or damaged. */
export function ItemChecklistPage({ tripId, stopId }: { tripId: string; stopId: string }) {
  const { data: trip, isLoading, error } = useLoaderTrip(tripId)
  const { data: me } = useMe()
  if (isLoading) return <Skeleton className="h-96 rounded-xl" />
  const stop = trip?.stops.find((s) => s.id === stopId)
  if (error || !trip || !stop)
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>{error ? "Could not load this vehicle" : "This order is not on the vehicle"}</AlertTitle>
        <AlertDescription>
          <p>{error?.message ?? "It may have been re-planned by dispatch."}</p>
          <Button variant="outline" size="sm" className="mt-2" nativeButton={false} render={<Link href={`/loader/vehicles/${tripId}`} />}>
            <ArrowLeft /> Back to vehicle
          </Button>
        </AlertDescription>
      </Alert>
    )
  // Remount per stop so the steppers start from that stop's own saved count.
  return <Checklist key={stop.id} trip={trip} stop={stop} editable={claimState(trip, me?.id) === "mine" && stop.loadStatus !== "STOWED"} />
}

function Checklist({ trip, stop, editable }: { trip: LoaderTrip; stop: LoaderStop; editable: boolean }) {
  const router = useRouter()
  const count = useCountStop(trip.id)
  const [counts, setCounts] = useState<Record<string, Count>>(() =>
    Object.fromEntries(stop.order.lines.map((l) => [l.id, { loaded: l.count?.loadedQty ?? l.quantity, damaged: l.count?.damagedQty ?? 0 }])),
  )
  const [notes, setNotes] = useState("")
  const [clientId, setClientId] = useState(() => crypto.randomUUID())
  const [breach, setBreach] = useState<LoaderCapacityBreach | null>(null)
  const [reporting, setReporting] = useState(false)
  const sequence = loadingOrder(trip.stops)
  const position = sequence.findIndex((s) => s.id === stop.id) + 1
  const vehicleHref = `/loader/vehicles/${trip.id}`

  // Loaded + damaged never exceeds what was ordered: marking a unit damaged takes it out of "loaded", and vice versa.
  const set = (line: Line, patch: Partial<Count>) =>
    setCounts((c) => {
      const clamp = (n: number) => Math.max(0, Math.min(line.quantity, n))
      const cur = c[line.id]
      const next =
        patch.damaged !== undefined
          ? { damaged: clamp(patch.damaged), loaded: Math.min(cur.loaded, line.quantity - clamp(patch.damaged)) }
          : { loaded: clamp(patch.loaded ?? cur.loaded), damaged: Math.min(cur.damaged, line.quantity - clamp(patch.loaded ?? cur.loaded)) }
      return { ...c, [line.id]: next }
    })

  const rows = stop.order.lines.map((l) => {
    const c = counts[l.id]
    return { line: l, ...c, missing: l.quantity - c.loaded - c.damaged }
  })
  const discrepancies = rows.filter((r) => r.missing > 0 || r.damaged > 0)
  const unitsLoaded = rows.reduce((t, r) => t + r.loaded, 0)
  const unitsOrdered = rows.reduce((t, r) => t + r.line.quantity, 0)

  const submit = () =>
    count.mutate(
      { stopId: stop.id, input: { clientId, lines: rows.map((r) => ({ orderLineId: r.line.id, loadedQty: r.loaded, damagedQty: r.damaged })), notes: notes.trim() || undefined } },
      {
        onSuccess: (r) => {
          setClientId(crypto.randomUUID())
          if (r.breach) return setBreach(r.breach)
          if (r.issues.length) {
            toast.success(`${stop.order.ref} counted · ${r.issues.length} ${r.issues.length === 1 ? "issue" : "issues"} sent to dispatch`)
            return router.push(issuesHref(r.issues.map((i) => i.id), trip.id, true))
          }
          toast.success(`${stop.order.ref} loaded and verified`)
          router.push(vehicleHref)
        },
        onError: (err) => toast.error(confirmFailure(err).kind === "inactive" ? `${err.message}: this vehicle is no longer yours to load` : err.message),
      },
    )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={vehicleHref} />}>
          <ArrowLeft /> Back to {trip.vehicle.id}
        </Button>
        <span className="text-muted-foreground">
          Stop {stop.seq} of {trip.stops.length} · SEQ #{position} in loading order
        </span>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Order items: {stop.order.ref} ({stop.outlet.name})
        </h1>
        <p className="text-sm text-muted-foreground">Count what goes on the truck. Anything short or damaged is reported to dispatch when you confirm.</p>
      </div>

      <Card className="flex-row flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <TagBadge>{stop.order.ref}</TagBadge>
        <span className="flex items-center gap-1.5">
          <Truck className="size-4 text-muted-foreground" /> <span className="font-medium">{trip.vehicle.id}</span> {trip.ref}
        </span>
        <span>{stop.outlet.name}</span>
        {stop.order.temp === "CHILLED" && (
          <span className="flex items-center gap-1 text-sky-700 dark:text-sky-300">
            <Snowflake className="size-3.5" /> Chilled
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          Loading status
          <TagBadge tone={stop.loadStatus === "STOWED" ? "green" : discrepancies.length ? "amber" : "gray"}>
            {stop.loadStatus === "STOWED" ? "Stowed" : `${unitsLoaded} of ${unitsOrdered} units counted on`}
          </TagBadge>
        </span>
      </Card>

      {!editable && (
        <Alert>
          <CircleCheck />
          <AlertTitle>{stop.loadStatus === "STOWED" ? `${stop.order.ref} is already loaded` : "Read-only"}</AlertTitle>
          <AlertDescription>
            {stop.loadStatus === "STOWED" ? "Its count is final." : "Only the loader holding this vehicle can count its items."}
            {stopIssues(trip, stop.id).length > 0 && ` Open issues: ${stopIssues(trip, stop.id).map((i) => i.ref).join(", ")}.`}
          </AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Order item inspection checklist</h2>
            <p className="text-xs text-muted-foreground">Good units loaded and damaged units, per item. Missing is what is left.</p>
          </div>
          <span className="text-xs text-muted-foreground">
            Total line items <span className="ml-1 rounded border px-1.5 py-0.5 font-semibold text-foreground">{rows.length}</span>
          </span>
        </div>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.line.id} className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3", r.damaged > 0 && "bg-red-50/50 dark:bg-red-500/5")}>
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{r.line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {r.line.category.charAt(0) + r.line.category.slice(1).toLowerCase()} · {r.line.quantity} units ordered · {fmtNum(r.line.weightKg, 1)} kg
                </p>
              </div>
              <Stepper label="Loaded" value={r.loaded} max={r.line.quantity} disabled={!editable} onChange={(v) => set(r.line, { loaded: v })} />
              <Stepper label="Damaged" value={r.damaged} max={r.line.quantity} disabled={!editable} tone="red" onChange={(v) => set(r.line, { damaged: v })} />
              <div className="flex w-40 flex-col items-start gap-1">
                {r.missing === 0 && r.damaged === 0 ? (
                  <TagBadge tone="green">
                    <CircleCheck className="size-3" /> Loaded & verified
                  </TagBadge>
                ) : (
                  <>
                    {r.missing > 0 && (
                      <TagBadge tone="blue">
                        <PackageMinus className="size-3" /> {r.missing} missing
                      </TagBadge>
                    )}
                    {r.damaged > 0 && (
                      <TagBadge tone="red">
                        <PackageX className="size-3" /> {r.damaged} damaged
                      </TagBadge>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {editable && (
          <div className="grid gap-1.5 border-t px-4 py-3">
            <label htmlFor="count-notes" className="text-xs font-medium text-muted-foreground">
              Notes for dispatch (optional, sent with any discrepancy)
            </label>
            <Textarea id="count-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. two totes crushed on the pallet" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
          <p className={cn("flex min-w-48 flex-1 items-center gap-1.5 text-sm", discrepancies.length ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
            <span className={cn("size-2 rounded-full", discrepancies.length ? "bg-amber-500" : "bg-primary")} />
            {discrepancies.length
              ? `${discrepancies.length} ${discrepancies.length === 1 ? "item has" : "items have"} a discrepancy: confirming reports ${discrepancies.length === 1 ? "it" : "them"} to dispatch`
              : "Every unit counted in good condition"}
          </p>
          {editable && (
            <>
              <Button variant="outline" onClick={() => setReporting(true)}>
                <TriangleAlert /> Report consignment issue
              </Button>
              <Button onClick={submit} disabled={count.isPending}>
                {count.isPending ? "Saving…" : unitsLoaded ? "Confirm loaded items & return to vehicle" : "Hold back & report to dispatch"} <ArrowRight />
              </Button>
            </>
          )}
        </div>
      </Card>

      <CapacityBreachModal
        breach={breach}
        stop={breach ? stop : null}
        tripId={trip.id}
        vehicleId={trip.vehicle.id}
        onOpenChange={(o) => {
          if (o) return
          setBreach(null)
          router.push(vehicleHref)
        }}
      />
      <ReportIssueDialog key={stop.id} trip={trip} stopId={stop.id} open={reporting} onOpenChange={setReporting} />
    </div>
  )
}

function Stepper({ label, value, max, disabled, tone, onChange }: { label: string; value: number; max: number; disabled: boolean; tone?: "red"; onChange: (v: number) => void }) {
  return (
    <div className="grid gap-1">
      <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</span>
      <div className={cn("flex items-center gap-1 rounded-lg border p-0.5", tone === "red" && value > 0 && TONE.red)}>
        <Button variant="ghost" size="icon-sm" disabled={disabled || value <= 0} onClick={() => onChange(value - 1)} aria-label={`${label} minus one`}>
          <Minus />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-7 w-14 border-0 px-1 text-center font-semibold tabular-nums shadow-none"
          aria-label={label}
        />
        <Button variant="ghost" size="icon-sm" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`${label} plus one`}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}
