"use client"

import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import type { LiveSnapshot, LiveTrip } from "@waypoint/shared"
import { Skeleton } from "@/components/ui/skeleton"
import type { TripDetail } from "@/lib/types"
import type { LiveMapProps } from "../../live/map/types"

const MapSkeleton = () => <Skeleton className="size-full rounded-none" />
const MapboxLiveMap = dynamic(() => import("../../live/map/mapbox-live-map"), { ssr: false, loading: MapSkeleton })
const SchematicLiveMap = dynamic(() => import("../../live/map/schematic-live-map"), { ssr: false, loading: MapSkeleton })

/** Before publishing (no live state) the route is drawn from the plan itself. */
export function plannedAsLive(d: TripDetail): LiveTrip {
  const t = d.trip
  const depot = d.depot.position
  const stops = t.stops.map((s) => ({
    id: s.id,
    orderId: s.order.id,
    seq: s.seq,
    orderRef: s.order.ref,
    outletId: s.order.outlet.id,
    outletName: s.order.outlet.name,
    position: { lat: s.order.outlet.lat ?? depot.lat, lng: s.order.outlet.lng ?? depot.lng },
    windowOpenMin: s.order.outlet.windowOpenMin ?? 0,
    windowCloseMin: s.order.outlet.windowCloseMin ?? 0,
    plannedArrivalMin: s.plannedArrivalMin,
    etaMin: s.plannedArrivalMin,
    completedMin: null,
    delayMin: 0,
    status: "PENDING" as const,
    late: false,
  }))
  return {
    id: t.id,
    ref: t.ref,
    brand: t.brand,
    districtId: t.districtId,
    vehicleId: t.vehicle.id,
    vehicleLabel: "",
    driver: t.driver ? { name: t.driver.name, phone: t.driver.phone } : null,
    status: "SCHEDULED",
    delayMin: 0,
    position: depot,
    heading: 0,
    locationLabel: "At depot",
    progressPct: 0,
    stopsDone: 0,
    plannedDepartMin: t.plannedDepartMin,
    actualDepartMin: null,
    plannedDurationMin: t.plannedDurationMin,
    plannedKm: t.plannedKm,
    etaReturnMin: Math.round(t.plannedDepartMin + t.plannedDurationMin + t.district.depotToDistrictMin),
    nextStop: stops[0] ? { outletId: stops[0].outletId, etaMin: stops[0].etaMin } : null,
    stops,
    path: [depot, ...stops.map((s) => s.position), depot],
    pathIndex: 0,
    leg: 0,
    legProgress: 0,
  }
}

export function TripMap({ detail, trip, mapboxToken, highlightStopId }: { detail: TripDetail; trip: LiveTrip; mapboxToken?: string; highlightStopId?: string }) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  // A one-trip snapshot: the map fits to this route and nothing else.
  const snapshot = {
    depotId: detail.depot.id,
    date: detail.trip.plan.date.slice(0, 10),
    planId: `${detail.trip.plan.id}:${trip.id}`,
    planVersion: detail.trip.plan.version,
    source: "simulation",
    generatedAt: "",
    clock: detail.clock ?? { minute: 0, running: false, speed: 1 },
    depot: { name: detail.depot.name, position: detail.depot.position },
    kpis: {} as LiveSnapshot["kpis"],
    trips: [trip],
    alerts: [],
  } satisfies LiveSnapshot
  const props: LiveMapProps = { snapshot, trips: [trip], routes: detail.route ? { [trip.id]: detail.route } : undefined, selectedId: trip.id, onSelect: () => {}, theme, highlightStopId }
  return mapboxToken ? <MapboxLiveMap token={mapboxToken} {...props} /> : <SchematicLiveMap {...props} />
}
