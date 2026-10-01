import { Truck, Warehouse } from "lucide-react"
import type { LiveStop, LiveTrip } from "@waypoint/shared"
import { cn } from "@/lib/utils"
import { STOP_COLOR, TRIP_COLOR } from "../status"

/** Marker visuals shared by the Google and schematic maps: clean circles, theme-aware. */

export function DepotDot({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background shadow-md ring-4 ring-background/80">
        <Warehouse className="size-3.5" />
      </span>
      <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap shadow-sm">{name}</span>
    </div>
  )
}

export function stopColor(s: LiveStop) {
  return s.late && s.status !== "COMPLETED" ? STOP_COLOR.LATE : STOP_COLOR[s.status]
}

export function StopDot({ stop, dim }: { stop: LiveStop; dim?: boolean }) {
  const color = stopColor(stop)
  const done = stop.status === "COMPLETED"
  return (
    <span
      title={`${stop.outletId} · ${stop.status.toLowerCase().replace("_", " ")}`}
      className={cn("block size-2.5 rounded-full border-2 bg-background shadow-sm transition-opacity", dim && "opacity-30")}
      style={{ borderColor: color, background: done || stop.status === "IN_PROGRESS" ? color : undefined }}
    />
  )
}

export function VehicleDot({ trip, selected, dim, showLabel }: { trip: LiveTrip; selected?: boolean; dim?: boolean; showLabel?: boolean }) {
  const color = TRIP_COLOR[trip.status]
  return (
    <div className={cn("flex flex-col items-center gap-1 transition-opacity", dim && "opacity-30")}>
      <span
        className={cn(
          "relative flex size-7 cursor-pointer items-center justify-center rounded-full text-white shadow-md ring-2 ring-background transition-transform hover:scale-110",
          selected && "scale-110 ring-4",
        )}
        style={{ background: color }}
      >
        {trip.status === "DELAYED" && <span className="absolute inset-0 animate-ping rounded-full opacity-40" style={{ background: color }} />}
        <Truck className="relative size-3.5" />
      </span>
      {showLabel && (
        <span className="rounded bg-background/95 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap shadow-sm ring-1 ring-border">
          {trip.vehicleId}
          {trip.delayMin >= 15 && <span className="ml-1 text-red-600">+{trip.delayMin}m</span>}
        </span>
      )}
    </div>
  )
}
