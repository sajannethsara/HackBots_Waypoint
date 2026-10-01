import { LIVE_STATUS_LABEL, type LiveStopStatus, type LiveTripStatus } from "@waypoint/shared"
import type { Tone } from "@/components/shared/badges"

/** One colour per live status, used by map markers, routes, chips and the donut. */
export const TRIP_COLOR: Record<LiveTripStatus, string> = {
  SCHEDULED: "#94a3b8",
  LOADING: "#f59e0b",
  ON_ROUTE: "#16a34a",
  AT_OUTLET: "#8b5cf6",
  DELAYED: "#ef4444",
  RETURNING: "#0ea5e9",
  COMPLETED: "#64748b",
}

export const TRIP_TONE: Record<LiveTripStatus, Tone> = {
  SCHEDULED: "gray",
  LOADING: "amber",
  ON_ROUTE: "green",
  AT_OUTLET: "violet",
  DELAYED: "red",
  RETURNING: "blue",
  COMPLETED: "gray",
}

export const STOP_COLOR: Record<LiveStopStatus | "LATE", string> = {
  PENDING: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  COMPLETED: "#16a34a",
  LATE: "#ef4444",
}

export const tripLabel = (s: LiveTripStatus) => LIVE_STATUS_LABEL[s]

export const isMoving = (s: LiveTripStatus) => s === "ON_ROUTE" || s === "DELAYED" || s === "RETURNING" || s === "AT_OUTLET"
