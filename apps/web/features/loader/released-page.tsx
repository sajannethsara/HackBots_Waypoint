"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, CircleCheck, PackageX, TriangleAlert } from "lucide-react"
import { minToHHMM, type LoaderTrip } from "@waypoint/shared"
import { TagBadge, TONE } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/hooks/use-session"
import { fmtDateTime, fmtNum, fmtTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { destination, loadingOrder, stopIssues, stowedLoad } from "./model"
import { useLoaderTrip } from "./queries"

/** The handover receipt shown after a loader finishes a vehicle. Every figure is read back from the trip. */
export function ReleasedPage({ tripId }: { tripId: string }) {
  const { data: trip, isLoading, error } = useLoaderTrip(tripId)
  const { data: me } = useMe()

  return (
    <div className="grid gap-4">
      <PageHeader title="Loaded & Released" description="Vehicle loading completion and handover receipt." />
      {isLoading ? (
        <Skeleton className="mx-auto h-[28rem] w-full max-w-2xl rounded-xl" />
      ) : error || !trip ? (
        <Alert variant="destructive" className="mx-auto max-w-2xl">
          <TriangleAlert />
          <AlertTitle>Could not load this vehicle</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      ) : trip.status !== "LOADED" || !trip.loadedAt ? (
        <Alert className="mx-auto max-w-2xl">
          <TriangleAlert />
          <AlertTitle>{trip.vehicle.id} has not been released yet</AlertTitle>
          <AlertDescription>
            <p>Finish loading from the load list first.</p>
            <Button variant="outline" size="sm" className="mt-2" render={<Link href={`/loader/vehicles/${trip.id}`} />}>
              <ArrowLeft /> Back to load list
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Receipt trip={trip} loadedAt={trip.loadedAt} depotName={me?.depot?.name} />
      )}
    </div>
  )
}

function Receipt({ trip, loadedAt, depotName }: { trip: LoaderTrip; loadedAt: string; depotName?: string }) {
  const load = stowedLoad(trip)
  const weightPct = (load.weightKg / trip.vehicle.weightCapKg) * 100
  const volumePct = (load.volumeM3 / trip.vehicle.volumeCapM3) * 100
  const order = loadingOrder(trip.stops)
  const stowed = order.filter((s) => s.loadStatus === "STOWED")
  const heldBack = order.filter((s) => s.loadStatus !== "STOWED")

  return (
    <Card className="mx-auto w-full max-w-2xl gap-5 p-6">
      <div className="grid justify-items-center gap-2 text-center">
        <span className={cn("flex size-14 items-center justify-center rounded-full ring-8", TONE.green, "ring-emerald-500/10")}>
          <Check className="size-7" />
        </span>
        <TagBadge tone="green">Vehicle loaded · ready for dispatch</TagBadge>
        <h2 className="text-xl font-semibold tracking-tight">Vehicle Loaded & Released</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {trip.vehicle.id} finished loading{depotName ? ` at ${depotName}` : ""} for {destination(trip)} and is handed over for its {minToHHMM(trip.plannedDepartMin)} departure.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Fact label="Vehicle" value={trip.vehicle.id} hint={`${trip.ref} · Trip ${trip.tripNo}`} />
        <Fact label="Driver" value={trip.driver?.name ?? "Not assigned"} />
        <Fact label="Released at" value={fmtTime(loadedAt)} tone="green" />
        <Fact label="Loaded weight" value={`${fmtNum(load.weightKg)} kg`} hint={`${fmtNum(weightPct, 1)}% of ${fmtNum(trip.vehicle.weightCapKg)} kg`} />
        <Fact label="Volumetric fill" value={`${fmtNum(load.volumeM3, 1)} m³`} hint={`${fmtNum(volumePct, 1)}% of ${fmtNum(trip.vehicle.volumeCapM3, 1)} m³`} />
        <Fact label="Issues flagged" value={`${trip.issues.length} open`} tone={trip.issues.length ? "red" : "green"} />
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          On the truck · {stowed.length} of {trip.stops.length} orders
        </p>
        <ul className="grid gap-1 text-sm">
          {stowed.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <CircleCheck className="size-3.5 shrink-0 text-primary" />
              <span className="font-medium">{s.order.ref}</span>
              <span className="truncate text-muted-foreground">→ {s.outlet.name}</span>
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                {s.order.units} units · {fmtNum(s.order.weightKg)} kg
              </span>
            </li>
          ))}
        </ul>
        {heldBack.length > 0 && (
          <>
            <p className="mt-1 text-xs font-medium tracking-wider text-destructive uppercase">Held back for dispatch · {heldBack.length}</p>
            <ul className="grid gap-1 text-sm">
              {heldBack.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <PackageX className="size-3.5 shrink-0 text-destructive" />
                  <span className="font-medium">{s.order.ref}</span>
                  <span className="text-muted-foreground">→ {s.outlet.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{stopIssues(trip, s.id).map((i) => i.ref).join(", ")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset", TONE.green)}>
        <span className="flex items-center gap-1.5">
          <CircleCheck className="size-4" /> Loaded and signed off by <span className="font-semibold">{trip.loadedBy?.name ?? "—"}</span>
        </span>
        <span className="text-xs tabular-nums">{fmtDateTime(loadedAt)}</span>
      </div>

      <Button size="lg" render={<Link href="/loader/queue" />}>
        Return to Loading Queue <ArrowRight />
      </Button>
    </Card>
  )
}

function Fact({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "green" | "red" }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", tone === "green" && "text-primary", tone === "red" && "text-destructive")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
