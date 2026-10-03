import { z } from "zod"
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

// ───────────────────────────── Reporting a loading issue ─────────────────────────────

export const LOADER_ISSUE_KINDS = ["missing", "damaged", "sequence", "delay", "capacity"] as const
export type LoaderIssueKind = (typeof LOADER_ISSUE_KINDS)[number]

/** What the loader chose in the capacity-breach screen. There is no override. */
export const CAPACITY_RESOLUTIONS = ["hold", "discrepancy"] as const
export type CapacityResolution = (typeof CAPACITY_RESOLUTIONS)[number]

/**
 * One report from the loading bay. The API writes the description itself from these facts and
 * raises one issue per affected order line, so dispatch can act on each shortage separately.
 */
export const loaderIssueSchema = z
  .object({
    /** One per submission; the API derives each issue's clientId from it, so a retry never duplicates. */
    clientId: z.string().min(8).max(64),
    kind: z.enum(LOADER_ISSUE_KINDS),
    tripId: z.string().min(1),
    stopId: z.string().min(1).optional(),
    lines: z.array(z.object({ orderLineId: z.string().min(1), units: z.number().int().positive() })).max(50).default([]),
    delayMin: z.number().int().positive().max(24 * 60).optional(),
    delayReason: z.string().max(120).optional(),
    resolution: z.enum(CAPACITY_RESOLUTIONS).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    const need = (ok: unknown, path: string, message: string) => !ok && ctx.addIssue({ code: "custom", path: [path], message })
    if (v.kind !== "delay") need(v.stopId, "stopId", "Choose the affected order")
    if (v.kind === "missing" || v.kind === "damaged") need(v.lines.length, "lines", "Choose at least one item")
    if (v.kind === "delay") need(v.delayMin, "delayMin", "Enter the expected delay in minutes")
    if (v.kind === "capacity") need(v.resolution, "resolution", "Choose how to resolve the breach")
    if (new Set(v.lines.map((l) => l.orderLineId)).size !== v.lines.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Each item once" })
  })
export type LoaderIssueInput = z.input<typeof loaderIssueSchema>
/** The request after validation (defaults applied), as the API handles it. */
export type LoaderIssueRequest = z.output<typeof loaderIssueSchema>

/** What the API answers: the issues it raised (one per item for missing/damaged). */
export interface LoaderIssueResult {
  issues: { id: string; ref: string; type: IssueType; description: string }[]
}
