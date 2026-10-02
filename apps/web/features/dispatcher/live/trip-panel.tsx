"use client"

import Link from "next/link"
import { Check, ExternalLink, MapPin, Phone, Truck, User, X } from "lucide-react"
import type { LiveStop, LiveTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fmtNum, minToHHMM } from "@/lib/format"
import { cn } from "@/lib/utils"
import { TRIP_TONE, tripLabel } from "./status"

/** Trip details for the selected vehicle: overview, vehicle & driver, stop-by-stop progress. */
export function TripPanel({ trip, onClose }: { trip: LiveTrip; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur">
      <div className="flex items-start gap-2 border-b p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Truck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{trip.ref}</span>
            <TagBadge tone={TRIP_TONE[trip.status]}>{tripLabel(trip.status)}</TagBadge>
            {trip.delayMin >= 5 && <TagBadge tone="red">+{trip.delayMin} min</TagBadge>}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <BrandBadge brand={trip.brand} /> {trip.districtId} · {trip.vehicleId}
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3 text-sm">
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2.5 text-xs">
            <Fact label="Planned start" value={minToHHMM(trip.plannedDepartMin)} />
            <Fact label="Started" value={trip.actualDepartMin != null ? minToHHMM(trip.actualDepartMin) : "—"} />
            <Fact label="Back at depot" value={minToHHMM(trip.etaReturnMin)} />
            <Fact label="Outlets" value={trip.stops.length} />
            <Fact label="Distance" value={`${fmtNum(trip.plannedKm)} km`} />
            <Fact label="Planned" value={`${Math.round(trip.plannedDurationMin)} min`} />
          </dl>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border p-2.5">
              <Truck className="mb-1 size-3.5 text-muted-foreground" />
              <p className="font-medium">{trip.vehicleId}</p>
              <p className="text-muted-foreground">{trip.vehicleLabel}</p>
            </div>
            <div className="rounded-lg border p-2.5">
              <User className="mb-1 size-3.5 text-muted-foreground" />
              <p className="truncate font-medium">{trip.driver?.name ?? "Unassigned"}</p>
              {trip.driver?.phone ? (
                <a href={`tel:${trip.driver.phone}`} className="inline-flex items-center gap-1 text-primary">
                  <Phone className="size-3" /> Call
                </a>
              ) : (
                <p className="text-muted-foreground">Driver app</p>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium tracking-wide text-muted-foreground uppercase">Route progress</span>
              <span className="font-medium tabular-nums">{trip.progressPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${trip.progressPct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {trip.stopsDone} / {trip.stops.length} outlets · {trip.locationLabel}
            </p>
            {trip.reported && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", trip.reported.fixAgeMin != null && trip.reported.fixAgeMin <= 10 ? "bg-emerald-500" : "bg-amber-500")} />
                Driver app{trip.reported.simulated ? " (demo GPS)" : ""} · {trip.reported.fixAgeMin == null ? "no GPS fix yet" : trip.reported.fixAgeMin < 1 ? "GPS fix just now" : `GPS fix ${trip.reported.fixAgeMin} min ago`}
              </p>
            )}
          </div>

          <ol className="grid gap-1.5">
            {trip.stops.map((s) => (
              <StopRow key={s.id} stop={s} />
            ))}
          </ol>
        </div>
      </ScrollArea>

      <div className="border-t p-2">
        <Button variant="outline" size="sm" className="w-full" nativeButton={false} render={<Link href={`/dispatcher/trips/${trip.id}`} />}>
          <ExternalLink data-icon="inline-start" /> Open trip details
        </Button>
      </div>
    </div>
  )
}

function StopRow({ stop: s }: { stop: LiveStop }) {
  const done = s.status === "COMPLETED"
  const current = s.status === "IN_PROGRESS"
  return (
    <li className={cn("flex items-start gap-2.5 rounded-lg border p-2", current && "border-sky-500/60 ring-1 ring-sky-500/30", s.late && !done && "border-red-500/40")}>
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px]",
          done && "border-emerald-600 bg-emerald-600 text-white",
          current && "border-sky-500 bg-sky-500 text-white",
          !done && !current && "border-muted-foreground/40",
        )}
      >
        {done ? <Check className="size-3" /> : current ? <MapPin className="size-3" /> : null}
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <p className="truncate font-medium">
          {s.seq}. {s.outletId} <span className="font-normal text-muted-foreground">· {s.orderRef}</span>
        </p>
        <p className="text-muted-foreground tabular-nums">
          Window {minToHHMM(s.windowOpenMin)}–{minToHHMM(s.windowCloseMin)}
        </p>
      </div>
      <div className="text-right text-xs tabular-nums">
        {done ? (
          <TagBadge tone={s.late ? "amber" : "green"}>{minToHHMM(s.completedMin ?? s.etaMin)}</TagBadge>
        ) : (
          <span className={cn(s.late ? "text-red-600" : s.delayMin >= 15 ? "text-amber-600" : "text-foreground")}>ETA {minToHHMM(s.etaMin)}</span>
        )}
        {!done && s.delayMin > 0 && <p className="text-[10px] text-muted-foreground">+{s.delayMin} min</p>}
      </div>
    </li>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
