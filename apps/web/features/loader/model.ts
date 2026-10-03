import { BRAND_LABEL, type LoaderStop, type LoaderTrip } from "@waypoint/shared"
import type { Tone } from "@/components/shared/badges"

/** Where a trip stands for the loader looking at it. */
export type ClaimState = "unclaimed" | "mine" | "locked" | "done"

export function claimState(trip: LoaderTrip, meId: string | undefined): ClaimState {
  if (trip.status === "PLANNED") return "unclaimed"
  if (trip.status !== "LOADING") return "done"
  return trip.claimedBy?.id === meId ? "mine" : "locked"
}

export const isFlagged = (trip: LoaderTrip) => trip.issues.length > 0

export function statusPill(trip: LoaderTrip, state: ClaimState): { label: string; tone: Tone } {
  if (isFlagged(trip)) return { label: "Flagged", tone: "red" }
  switch (state) {
    case "unclaimed":
      return { label: "Unclaimed", tone: "amber" }
    case "mine":
      return { label: "Claimed by me", tone: "blue" }
    case "locked":
      return { label: `Locked by ${trip.claimedBy?.name.split(" ")[0] ?? "another loader"}`, tone: "gray" }
    case "done":
      return { label: trip.status === "LOADED" ? "Loaded & released" : trip.status.charAt(0) + trip.status.slice(1).toLowerCase(), tone: "green" }
  }
}

export const destination = (trip: LoaderTrip) => `Waypoint ${BRAND_LABEL[trip.brand]} – ${trip.district.id}`

export const cargoSpec = (trip: LoaderTrip) =>
  `${trip.vehicle.temp === "REEFER" ? "Reefer · chilled" : "Ambient dry goods"} · ${trip.vehicle.type === "TRUCK" ? "Truck" : "Van"}`

/** Stops in loading order: the last delivery goes in first, at the bulkhead. */
export const loadingOrder = (stops: LoaderStop[]) => [...stops].sort((a, b) => b.seq - a.seq)

/** Weight and volume already on the truck (stowed stops only). */
export function stowedLoad(trip: LoaderTrip) {
  const stowed = trip.stops.filter((s) => s.loadStatus === "STOWED")
  return {
    stowed: stowed.length,
    weightKg: stowed.reduce((t, s) => t + s.order.weightKg, 0),
    volumeM3: stowed.reduce((t, s) => t + s.order.volumeM3, 0),
  }
}

/** Stops that still stop the trip being finished: not stowed and not flagged with an open issue. */
export function unfinishedStops(trip: LoaderTrip) {
  const flagged = new Set(trip.issues.map((i) => i.stopId).filter(Boolean))
  return trip.stops.filter((s) => s.loadStatus !== "STOWED" && !flagged.has(s.id))
}

/** Open issues raised against one stop. */
export const stopIssues = (trip: LoaderTrip, stopId: string) => trip.issues.filter((i) => i.stopId === stopId)
