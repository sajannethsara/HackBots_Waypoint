import type { Brand, TempRequirement, VehicleTemp, VehicleType } from "./constants"
import type { DriverTripStatus } from "./driver"
import type { IssueSeverity, IssueStatus, IssueType } from "./issues"

/** Loader workspace: the loading bay's queue and one vehicle's load list. Built by the API, read by the web app. */

export const LOADER_QUEUE_FILTERS = ["all", "unclaimed", "mine", "flagged"] as const
export type LoaderQueueFilter = (typeof LOADER_QUEUE_FILTERS)[number]

export type LoadStatus = "PENDING" | "STOWED" | "FLAGGED"

export interface LoaderStop {
  id: string
  /** Delivery order. Loading runs the other way: the highest seq goes in first. */
  seq: number
  loadStatus: LoadStatus
  order: {
    id: string
    ref: string
    temp: TempRequirement
    units: number
    weightKg: number
    volumeM3: number
    lines: { id: string; description: string; category: string; quantity: number; weightKg: number; volumeM3: number }[]
  }
  outlet: { id: string; name: string; windowOpenMin: number; windowCloseMin: number }
}

/** An open problem raised at the loading stage. */
export interface LoaderIssue {
  id: string
  ref: string
  type: IssueType
  severity: IssueSeverity
  status: IssueStatus
  description: string
}

export interface LoaderTrip {
  id: string
  ref: string
  tripNo: number
  brand: Brand
  status: DriverTripStatus
  plannedDepartMin: number
  loadWeightKg: number
  loadVolumeM3: number
  claimedBy: { id: string; name: string } | null
  claimedAt: string | null
  driver: { name: string } | null
  vehicle: { id: string; type: VehicleType; temp: VehicleTemp; weightCapKg: number; volumeCapM3: number }
  district: { id: string }
  issues: LoaderIssue[]
  /** In delivery order (seq ascending). */
  stops: LoaderStop[]
}

/** Body of the 409 returned when confirming a stop would overload the vehicle. */
export interface LoaderCapacityBreach {
  message: string
  weight: { loaded: number; cap: number }
  volume: { loaded: number; cap: number }
}
