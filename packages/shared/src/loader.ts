import { z } from "zod"
import type { Brand, TempRequirement, VehicleTemp, VehicleType } from "./constants"
import type { DriverTripStatus } from "./driver"
import type { IssueSeverity, IssueStatus, IssueType } from "./issues"

/** Loader workspace: the loading bay's queue and one vehicle's load list. Built by the API, read by the web app. */

/** `loaded` = trips the current loader finished (released), whatever happened to them since. */
export const LOADER_QUEUE_FILTERS = ["all", "unclaimed", "mine", "flagged", "loaded"] as const
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
    lines: {
      id: string
      description: string
      category: string
      quantity: number
      weightKg: number
      volumeM3: number
      /** The loader's item count for this stop, once the checklist has been saved. Missing = quantity - loaded - damaged. */
      count: { loadedQty: number; damagedQty: number; countedAt: string } | null
    }[]
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
  /** The stop it concerns, if any: a flagged stop does not block finishing the trip. */
  stopId: string | null
  /** The order line (item) it concerns, if it is about one item. */
  orderLineId: string | null
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
  /** The plan this trip belongs to. Only trips of the depot's current PUBLISHED plan can be loaded. */
  plan: { status: "DRAFT" | "PUBLISHED" | "SUPERSEDED"; version: number }
  claimedBy: { id: string; name: string } | null
  claimedAt: string | null
  /** Set when the loader finishes loading (status LOADED). */
  loadedBy: { id: string; name: string } | null
  loadedAt: string | null
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

/** Body of the 400 returned when a trip cannot be finished: the stops neither stowed nor flagged with an issue. */
export interface LoaderCompleteBlocked {
  message: string
  blocking: { stopId: string; seq: number; orderRef: string; outletName: string; loadStatus: LoadStatus }[]
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

// ───────────────────────────── Item checklist (count a stop's order lines) ─────────────────────────────

/**
 * The loader's count of one stop, every order line exactly once. The API saves it, raises a missing
 * and/or damaged issue for any shortfall, and stows the stop if anything good went on the truck.
 */
export const stopCountSchema = z.object({
  /** One per submission, so a retry never raises the same issues twice. */
  clientId: z.string().min(8).max(64),
  lines: z
    .array(z.object({ orderLineId: z.string().min(1), loadedQty: z.number().int().min(0), damagedQty: z.number().int().min(0) }))
    .min(1)
    .max(50),
  notes: z.string().max(500).optional(),
})
export type StopCountInput = z.input<typeof stopCountSchema>
export type StopCountRequest = z.output<typeof stopCountSchema>

export interface StopCountResult {
  stop: { id: string; loadStatus: LoadStatus }
  /** Issues raised for shortfalls (none when every unit was loaded in good condition). */
  issues: LoaderIssueResult["issues"]
  /** Set when stowing would overload the vehicle: the count and issues are saved, the stop is not stowed. */
  breach: LoaderCapacityBreach | null
}

// ───────────────────────────── Reading back raised issues (confirmation screen) ─────────────────────────────

export interface LoaderIssueDetail {
  id: string
  ref: string
  type: IssueType
  severity: IssueSeverity
  status: IssueStatus
  description: string
  quantity: number | null
  createdAt: string
  resolution: string | null
  resolvedAt: string | null
  reportedBy: { name: string }
  trip: { id: string; ref: string; vehicleId: string } | null
  order: { ref: string } | null
  outlet: { name: string } | null
  orderLine: { description: string } | null
  /** The issue's group chat with dispatch, once it has been opened. */
  chatId: string | null
}

// ───────────────────────────── Marking one item loaded (item by item on the load list) ─────────────────────────────

/** Tick (or untick) one item as fully loaded in good condition. Ticking the last item stows the stop. */
export const stopLineSchema = z.object({ loaded: z.boolean() })
export type StopLineInput = z.infer<typeof stopLineSchema>

export interface StopLineResult {
  stop: { id: string; loadStatus: LoadStatus }
  /** Set when the last tick tried to stow the stop and the vehicle would overload: the tick is saved, the stop is not stowed. */
  breach: LoaderCapacityBreach | null
}
