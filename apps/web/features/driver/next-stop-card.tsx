"use client"

import { ChevronRight, CircleAlert, MapPin, PackageCheck } from "lucide-react"
import type { DriverStop } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { distanceM, fmtDistance, stopTiming } from "./lib/model"
import { useDriver } from "./lib/driver-provider"
import { useNav } from "./nav"
import { ChilledChip, fmt, NavigateButton, TimingChip } from "./ui"

/**
 * The one thing a driver needs while on the road: where to go next, when, and what to hand over.
 * Everything else (other stops, plan detail) stays a tap away.
 */
export function NextStopCard({ stop, index, total, compact }: { stop: DriverStop; index: number; total: number; compact?: boolean }) {
  const { gps, nowMin, arrive } = useDriver()
  const { openStop } = useNav()
  const from = gps.position
  const dist = from ? distanceM(from, stop.outlet.position) : null
  const timing = stopTiming(stop, nowMin, from)
  const arrived = stop.status === "ARRIVED"
  const here = gps.atNext && stop.status === "PENDING"

  return (
    <section className={cn("grid gap-3 rounded-2xl border bg-card p-3.5 shadow-sm", here && "border-primary/50 ring-2 ring-primary/20")}>
      <button type="button" onClick={() => openStop(stop.id)} className="grid gap-2 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">{arrived ? "At outlet" : `Next stop · ${index + 1} of ${total}`}</span>
          {stop.chilled && <ChilledChip />}
          {!arrived && <TimingChip stop={stop} nowMin={nowMin} from={from} />}
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg leading-snug font-semibold tracking-tight">{stop.outlet.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" /> {stop.outlet.district}
              {dist != null && <span>· {fmtDistance(dist)} away</span>}
            </p>
          </div>
          <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-[1fr_1.5fr_0.8fr] gap-2 text-sm">
          <Cell label="Arrive by" value={fmt(timing.etaMin)} />
          <Cell label="Window" value={`${fmt(stop.windowOpenMin)}–${fmt(stop.windowCloseMin)}`} />
          <Cell label="Items" value={`${stop.units}`} />
        </div>
        {!compact && stop.outlet.access && (
          <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <CircleAlert className="size-3.5 shrink-0" /> {stop.outlet.access}
          </p>
        )}
        {!compact && stop.note && <p className="text-xs text-muted-foreground">Store note: {stop.note}</p>}
      </button>

      {arrived ? (
        <Button className="h-12 text-[15px]" onClick={() => openStop(stop.id)}>
          <PackageCheck data-icon="inline-start" /> Record delivery
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <NavigateButton stop={stop} />
          <Button
            className={cn("h-12 text-[15px]", here && "animate-pulse")}
            onClick={() => {
              arrive(stop)
              openStop(stop.id)
            }}
          >
            {here ? "You're here" : "I've arrived"}
          </Button>
        </div>
      )}
    </section>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold whitespace-nowrap tabular-nums">{value}</p>
    </div>
  )
}
