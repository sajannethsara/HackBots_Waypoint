import { z } from "zod"
import { DEFERRAL_REASONS, type DeferralReason } from "./constants"
import type { IssueType } from "./issues"
import type { Role } from "./constants"

/**
 * Dispatcher decisions on an issue that change the system (not just the status), and who the
 * dispatcher can bring into the issue chat. Shared by the API (validation) and the issue page.
 */

export const ISSUE_ACTION_IDS = ["defer-order", "vehicle-out-of-service", "vehicle-return", "short-ship"] as const
export type IssueActionId = (typeof ISSUE_ACTION_IDS)[number]

export const issueActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("defer-order"), reason: z.enum(DEFERRAL_REASONS), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("vehicle-out-of-service"), deferRemaining: z.boolean().default(false), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("vehicle-return"), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("short-ship"), note: z.string().trim().max(500).optional() }),
])
export type IssueActionInput = z.infer<typeof issueActionSchema>

export const issueChatInviteSchema = z.object({ userId: z.string().min(1) })
export type IssueChatInviteInput = z.infer<typeof issueChatInviteSchema>

/** Reason pre-selected in the defer dialog, by what went wrong. */
export const DEFAULT_DEFER_REASON: Record<IssueType, DeferralReason> = {
  LOAD_MISSING: "LOADING_SHORTFALL",
  LOAD_DAMAGED: "LOADING_SHORTFALL",
  SEQUENCE_ISSUE: "LOADING_SHORTFALL",
  DEPARTURE_DELAY: "TIME_BUDGET",
  CAPACITY_BREACH: "VEHICLE_CAPACITY",
  LATE_ARRIVAL: "DELIVERY_WINDOW",
  DELIVERY_REFUSED: "OTHER",
  OUTLET_CLOSED: "DELIVERY_WINDOW",
  ACCESS_BLOCKED: "ACCESS_RESTRICTION",
  VEHICLE_BREAKDOWN: "VEHICLE_UNAVAILABLE",
  TEMPERATURE: "REEFER_CAPACITY",
  RECEIPT_MISSING: "OTHER",
  RECEIPT_DAMAGED: "OTHER",
  RECEIPT_WRONG_ITEMS: "OTHER",
  OTHER: "OTHER",
}

export interface IssueActionOption {
  id: IssueActionId
  label: string
  /** What happens in the system if the dispatcher confirms. */
  effect: string
  /** Names the thing it applies to, e.g. "S1-012 on TRIP-016 (stop 3)". */
  target: string | null
  available: boolean
  /** Why it can't be used right now (only when not available). */
  unavailableReason?: string
  /** For "vehicle-out-of-service": how many pending stops could be deferred with it. */
  pendingStops?: number
  defaultReason?: DeferralReason
}

export interface IssueActionTaken {
  id: string
  action: IssueActionId
  summary: string
  actor: string
  at: string
}

export interface IssueActionsResponse {
  actions: IssueActionOption[]
  taken: IssueActionTaken[]
}

export interface IssueActionResult {
  summary: string
}

export interface IssueChatCandidate {
  id: string
  name: string
  role: Role
  /** Why they are relevant, e.g. "Store manager · Waypoint Fresh Galle 053 (stop 3)". */
  relation: string
}
