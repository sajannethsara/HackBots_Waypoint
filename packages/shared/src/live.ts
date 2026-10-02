import type { Brand } from "./constants"

/** Live operations contract, shared by the API (REST + WebSocket) and the web app. */

export type LiveTripStatus = "SCHEDULED" | "LOADING" | "ON_ROUTE" | "AT_OUTLET" | "DELAYED" | "RETURNING" | "COMPLETED"
export type LiveStopStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED"

export interface LatLng {
  lat: number
  lng: number
}

export interface LiveClock {
  /** Simulated minutes since midnight on the operating day. */
  minute: number
  running: boolean
  /** Simulated minutes per real minute. */
  speed: number
}

export interface LiveStop {
  id: string
  orderId: string
  seq: number
  orderRef: string
  outletId: string
  outletName: string
  position: LatLng
  windowOpenMin: number
  windowCloseMin: number
  plannedArrivalMin: number
  /** Actual arrival when reached, otherwise the projected arrival. */
  etaMin: number
  completedMin: number | null
  delayMin: number
  status: LiveStopStatus
  late: boolean
}

export interface LiveTrip {
  id: string
  ref: string
  brand: Brand
  districtId: string
  vehicleId: string
  vehicleLabel: string
  driver: { name: string; phone: string | null } | null
  status: LiveTripStatus
  delayMin: number
  position: LatLng
  heading: number
  locationLabel: string
  progressPct: number
  stopsDone: number
  plannedDepartMin: number
  actualDepartMin: number | null
  plannedDurationMin: number
  plannedKm: number
  etaReturnMin: number
  nextStop: { outletId: string; etaMin: number } | null
  stops: LiveStop[]
  /** Depot → stops → depot, for drawing the route. */
  path: LatLng[]
  /** Index in `path` the vehicle has passed (completed portion). */
  pathIndex: number
  /** Road leg the vehicle is on (0 = depot → stop 1, n = last stop → depot, n + 1 = done). */
  leg: number
  /** Distance fraction travelled along `leg` (0–1). */
  legProgress: number
  /** Present when the driver app is driving this trip: stops and status come from the driver, not the replay. */
  reported?: { lastFixAt: string | null; fixAgeMin: number | null; simulated: boolean }
}

/** Road geometry for one trip, one polyline per leg: depot → stop 1 → … → stop n → depot. */
export interface LiveRoute {
  source: "mapbox" | "straight"
  legs: [number, number][][]
  /** Turn-by-turn steps per leg (Mapbox routes only). */
  steps?: import("./driver").DriverNavStep[][]
  km: number
  min: number
}

export type LiveRoutes = Record<string, LiveRoute>

export interface LiveAlert {
  id: string
  atMin: number
  severity: "high" | "medium" | "low" | "ok"
  title: string
  detail: string
  tripId: string
}

export interface LiveSnapshot {
  depotId: string
  date: string
  planId: string | null
  planVersion: number | null
  source: "simulation" | "driver" | "mixed"
  generatedAt: string
  clock: LiveClock
  depot: { name: string; position: LatLng }
  kpis: {
    vehiclesOnRoad: number
    fleetAvailable: number
    activeTrips: number
    totalTrips: number
    onTime: number
    delayed: number
    atDepot: number
    completedTrips: number
    stopsDone: number
    stopsTotal: number
    openIssues: number
  }
  trips: LiveTrip[]
  alerts: LiveAlert[]
}

export const LIVE_STATUS_LABEL: Record<LiveTripStatus, string> = {
  SCHEDULED: "Scheduled",
  LOADING: "Loading",
  ON_ROUTE: "On route",
  AT_OUTLET: "At outlet",
  DELAYED: "Delayed",
  RETURNING: "Returning",
  COMPLETED: "Completed",
}
