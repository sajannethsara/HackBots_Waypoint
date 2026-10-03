"use client"

import { Clock, Fuel, PackageCheck, Route, Truck, User } from "lucide-react"
import { RULES } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fmtNum, minToHHMM } from "@/lib/format"
import type { Trip, TripPreview } from "@/lib/types"
import { Meter } from "./trip-canvas"

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-card px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  )
}

/** Tab 3: the selected trip's vehicle, driver, capacity, time and fuel, live with the canvas edits. */
export function TripDetails({ trip, preview, stops }: { trip: Trip; preview?: TripPreview; stops: number }) {
  const v = trip.vehicle
  const fresh = trip.brand === "FRESH"
  const budget = preview?.budgetMin ?? (fresh ? RULES.freshBudgetMin : RULES.styleTechBudgetMin)
  const duration = preview?.durationMin ?? trip.plannedDurationMin
  const km = preview?.km ?? trip.plannedKm
  const fuel = preview?.fuelL ?? trip.plannedFuelL
  const depart = preview?.departMin ?? trip.plannedDepartMin
  return (
    <ScrollArea className="@container min-h-0 flex-1">
      <div className="grid gap-5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold">{trip.ref}</p>
          <BrandBadge brand={trip.brand} />
          <TagBadge tone="gray">{trip.districtId}</TagBadge>
          <TagBadge tone="gray">
            trip {trip.tripNo} of {RULES.maxTripsPerVehicle}
          </TagBadge>
        </div>

        <dl className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Fact label="Stops">{stops}</Fact>
          <Fact label="Depart depot">{minToHHMM(depart)}</Fact>
          <Fact label="Last stop done">{preview ? minToHHMM(depart + duration) : "—"}</Fact>
          <Fact label="Distance (round trip)">{fmtNum(km)} km</Fact>
        </dl>

        <section className="grid gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Truck className="size-3.5" /> Vehicle and driver
          </p>
          <dl className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
            <Fact label="Vehicle">{v.id}</Fact>
            <Fact label="Type">
              {v.temp === "REEFER" ? "Reefer" : "Ambient"} {v.type.toLowerCase()}
            </Fact>
            <Fact label="Efficiency">{v.kmPerL} km/L</Fact>
            <Fact label="Driver">
              <span className="inline-flex items-center gap-1">
                <User className="size-3 text-muted-foreground" />
                {trip.driver?.name ?? v.driver?.name ?? "Assigned on publish"}
              </span>
            </Fact>
          </dl>
        </section>

        <div className="grid gap-4 @2xl:grid-cols-2">
          <section className="grid content-start gap-3 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <PackageCheck className="size-3.5" /> Capacity
            </p>
            <Meter icon={PackageCheck} label="Weight" value={preview?.loadWeightKg ?? trip.loadWeightKg} max={v.weightCapKg} unit="kg" />
            <Meter icon={PackageCheck} label="Volume" value={preview?.loadVolumeM3 ?? trip.loadVolumeM3} max={v.volumeCapM3} unit="m³" digits={1} />
          </section>

          <section className="grid content-start gap-3 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Clock className="size-3.5" /> Time budget ({fresh ? "Fresh 03:30–08:00" : "Style + Tech trading day"})
            </p>
            <Meter icon={Route} label="This trip" value={duration} max={budget} unit="min" />
            <Meter icon={Clock} label={`${v.id} today`} value={preview?.vehicleUsedMin ?? duration} max={budget} unit="min" />
          </section>

          <section className="grid content-start gap-3 rounded-lg border p-3 @2xl:col-span-2">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Fuel className="size-3.5" /> Fuel
            </p>
            <Meter icon={Fuel} label="Today's trips vs weekly quota" value={preview?.vehicleFuelL ?? fuel} max={v.weeklyFuelQuotaL} unit="L" digits={1} />
            <p className="text-[11px] text-muted-foreground">
              {fmtNum(fuel, 1)} L this trip at {v.kmPerL} km/L. Quota is checked against fuel already used this ISO week.
            </p>
          </section>
        </div>
      </div>
    </ScrollArea>
  )
}
