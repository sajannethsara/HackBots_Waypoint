import { Check, Navigation2, Package, Warehouse } from "lucide-react"
import type { LiveStop, LiveTrip } from "@waypoint/shared"
import { minToHHMM } from "@/lib/format"
import { cn } from "@/lib/utils"
import { STOP_COLOR, TRIP_COLOR, tripLabel } from "../status"

/** Map indicators shared by the Google and schematic maps: glowing, theme-aware circles. */

const glow = (color: string) => ({ ["--glow" as string]: color }) as React.CSSProperties

export function DepotDot({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="wp-glow-static flex size-8 items-center justify-center rounded-xl bg-foreground text-background" style={glow("var(--primary)")}>
        <Warehouse className="size-4" />
      </span>
      <span className="rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow-sm ring-1 ring-border backdrop-blur">{name}</span>
    </div>
  )
}

export function stopColor(s: LiveStop) {
  return s.late && s.status !== "COMPLETED" ? STOP_COLOR.LATE : STOP_COLOR[s.status]
}

/** Numbered when a single trip is in focus; a small dot on the overview. */
export function StopDot({ stop, numbered, highlight }: { stop: LiveStop; numbered?: boolean; highlight?: boolean }) {
  const color = stopColor(stop)
  const done = stop.status === "COMPLETED"
  const here = stop.status === "IN_PROGRESS"
  if (!numbered)
    return (
      <span
        title={`${stop.outletId} · ${stop.status.toLowerCase().replace("_", " ")}`}
        className={cn("block size-2.5 rounded-full border-2 bg-background")}
        style={{ borderColor: color, background: done || here ? color : undefined }}
      />
    )
  return (
    <div className="group relative flex flex-col items-center">
      {highlight && <span className="wp-ping-fast absolute size-6 rounded-full bg-red-500" />}
      {highlight && <span className="wp-glow absolute -inset-1.5 rounded-full border-2 border-red-500" style={glow("#ef4444")} />}
      {highlight && (
        <span className="absolute -top-6 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white shadow-md">Issue here</span>
      )}
      {here && <span className="wp-ping absolute size-6 rounded-full" style={{ background: color }} />}
      <span
        className={cn(
          "relative flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums shadow-sm",
          done || here ? "text-white" : "bg-background text-foreground",
        )}
        style={{ borderColor: color, background: done || here ? color : undefined }}
      >
        {done ? <Check className="size-3.5" strokeWidth={3} /> : stop.seq}
      </span>
      <span className="pointer-events-none absolute top-7 rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap shadow-sm ring-1 ring-border">
        {stop.outletId}
        <span className="ml-1 text-muted-foreground tabular-nums">{done && stop.completedMin != null ? minToHHMM(stop.completedMin) : `~${minToHHMM(stop.etaMin)}`}</span>
      </span>
    </div>
  )
}

/** Vehicle: status colour, breathing glow, radar ping while moving, arrow pointing along the road. */
export function VehicleDot({ trip, selected, showLabel }: { trip: LiveTrip; selected?: boolean; showLabel?: boolean }) {
  const color = TRIP_COLOR[trip.status]
  const travelling = trip.status === "ON_ROUTE" || trip.status === "DELAYED" || trip.status === "RETURNING"
  return (
    <div className="group relative flex cursor-pointer flex-col items-center gap-1">
      {travelling && <span className={cn("absolute top-0 size-8 rounded-full", trip.status === "DELAYED" ? "wp-ping-fast" : "wp-ping")} style={{ background: color }} />}
      <span
        className={cn(
          "wp-glow relative flex size-8 items-center justify-center rounded-full border-2 border-white text-white transition-transform group-hover:scale-110 dark:border-white/90",
          selected && "scale-110",
        )}
        style={{ background: color, ...glow(color) }}
      >
        {travelling ? (
          <Navigation2 className="size-4 fill-white transition-transform duration-700" style={{ transform: `rotate(${trip.heading}deg)` }} />
        ) : (
          <Package className="size-4" />
        )}
      </span>
      {showLabel && (
        <span className="rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow-sm ring-1 ring-border backdrop-blur">
          {trip.vehicleId}
          {trip.delayMin >= 15 && <span className="ml-1 text-red-600 dark:text-red-400">+{trip.delayMin}m</span>}
        </span>
      )}
      {/* Hover card */}
      <div className="pointer-events-none absolute bottom-11 hidden w-52 rounded-lg border bg-popover p-2.5 text-left text-xs text-popover-foreground shadow-lg group-hover:block">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: color }} />
          <span className="font-semibold">{trip.ref}</span>
          <span className="text-muted-foreground">· {trip.vehicleId}</span>
        </div>
        <p className="mt-1 font-medium">
          {tripLabel(trip.status)}
          {trip.delayMin >= 5 && <span className="text-red-600 dark:text-red-400"> · +{trip.delayMin} min</span>}
        </p>
        <p className="text-muted-foreground">{trip.locationLabel}</p>
        {trip.nextStop && (
          <p className="mt-1 text-muted-foreground">
            Next {trip.nextStop.outletId} · ETA <span className="font-medium text-foreground tabular-nums">{minToHHMM(trip.nextStop.etaMin)}</span>
          </p>
        )}
        <p className="text-muted-foreground">
          {trip.stopsDone}/{trip.stops.length} outlets · {trip.driver?.name ?? "—"}
        </p>
      </div>
    </div>
  )
}
