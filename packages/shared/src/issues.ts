import { z } from "zod"

/** One exception model for every stage. Labels and playbooks are shared by API and UI. */

export const ISSUE_TYPES = [
  "LOAD_MISSING",
  "LOAD_DAMAGED",
  "SEQUENCE_ISSUE",
  "DEPARTURE_DELAY",
  "CAPACITY_BREACH",
  "LATE_ARRIVAL",
  "DELIVERY_REFUSED",
  "OUTLET_CLOSED",
  "ACCESS_BLOCKED",
  "VEHICLE_BREAKDOWN",
  "TEMPERATURE",
  "RECEIPT_MISSING",
  "RECEIPT_DAMAGED",
  "RECEIPT_WRONG_ITEMS",
  "OTHER",
] as const
export type IssueType = (typeof ISSUE_TYPES)[number]
export const ISSUE_STAGES = ["PLANNING", "LOADING", "DELIVERY", "RECEIPT"] as const
export type IssueStage = (typeof ISSUE_STAGES)[number]
export const ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number]
export type IssueStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED"

export interface IssuePlaybookAction {
  id: string
  label: string
  hint: string
  /** Side effect the API performs besides recording the resolution. */
  effect?: "NOTIFY_STORE" | "NOTIFY_DRIVER"
}

const notifyStore: IssuePlaybookAction = {
  id: "notify-store",
  label: "Notify the store",
  hint: "Send the outlet manager what changed and the new expectation",
  effect: "NOTIFY_STORE",
}
const notifyDriver: IssuePlaybookAction = {
  id: "notify-driver",
  label: "Message the driver",
  hint: "Push the instruction to the driver's run sheet",
  effect: "NOTIFY_DRIVER",
}

export const ISSUE_TYPE_META: Record<IssueType, { label: string; playbook: IssuePlaybookAction[] }> = {
  LOAD_MISSING: {
    label: "Load missing",
    playbook: [
      { id: "repick", label: "Re-pick from stock before departure", hint: "Loader picks the missing lines again" },
      { id: "short-ship", label: "Ship short and credit the store", hint: "Deliver what is loaded; missing qty is credited" },
      notifyStore,
    ],
  },
  LOAD_DAMAGED: {
    label: "Load damaged",
    playbook: [
      { id: "replace", label: "Replace damaged items", hint: "Swap from stock before departure" },
      { id: "write-off", label: "Write off and credit", hint: "Record as damaged in warehouse" },
      notifyStore,
    ],
  },
  SEQUENCE_ISSUE: {
    label: "Sequence issue",
    playbook: [
      { id: "resequence", label: "Reorder the load", hint: "Adjust the loading order to match the delivery sequence" },
      { id: "verify-manifest", label: "Verify the manifest", hint: "Check each order against its planned stop" },
      notifyDriver,
    ],
  },
  DEPARTURE_DELAY: {
    label: "Departure delay",
    playbook: [
      { id: "release-after-check", label: "Release after final check", hint: "Complete the remaining loading checks before departure" },
      notifyDriver,
      notifyStore,
    ],
  },
  CAPACITY_BREACH: {
    label: "Capacity breach",
    playbook: [
      { id: "split", label: "Move orders to another trip", hint: "Use Planning → Assign to rebalance" },
      { id: "defer", label: "Defer the overflow", hint: "Lowest-priority orders roll to the next run" },
    ],
  },
  LATE_ARRIVAL: {
    label: "Late arrival",
    playbook: [
      notifyStore,
      notifyDriver,
      { id: "accept-late", label: "Accept late delivery", hint: "Store keeps staff to receive after the window" },
      { id: "redeliver", label: "Reschedule to next run", hint: "Store cannot receive late today" },
    ],
  },
  DELIVERY_REFUSED: {
    label: "Delivery refused",
    playbook: [
      { id: "return", label: "Return goods to depot", hint: "Driver brings refused items back" },
      { id: "redeliver", label: "Redeliver next run", hint: "Order re-enters planning tomorrow" },
      notifyStore,
    ],
  },
  OUTLET_CLOSED: {
    label: "Outlet closed",
    playbook: [
      { id: "redeliver", label: "Redeliver next run", hint: "Order re-enters planning tomorrow" },
      notifyStore,
    ],
  },
  ACCESS_BLOCKED: {
    label: "Access blocked",
    playbook: [
      { id: "alt-route", label: "Send alternative access instructions", hint: "Use the side entrance or alternate bay" },
      notifyDriver,
      notifyStore,
    ],
  },
  VEHICLE_BREAKDOWN: {
    label: "Vehicle breakdown",
    playbook: [
      { id: "swap", label: "Swap to a standby vehicle", hint: "Transfer load and replan the remaining stops" },
      { id: "workshop", label: "Send to workshop", hint: "Vehicle becomes unavailable for planning" },
      notifyStore,
    ],
  },
  TEMPERATURE: {
    label: "Temperature excursion",
    playbook: [
      { id: "inspect", label: "Inspect chilled load", hint: "Quality check before handover" },
      { id: "reject", label: "Reject and replace", hint: "Unsafe stock is written off" },
      notifyStore,
    ],
  },
  RECEIPT_MISSING: {
    label: "Items missing at receipt",
    playbook: [
      { id: "check-pod", label: "Check proof of delivery", hint: "Compare against the driver's signed POD" },
      { id: "credit", label: "Credit the store", hint: "Issue a credit for missing quantity" },
      notifyStore,
    ],
  },
  RECEIPT_DAMAGED: {
    label: "Damaged at receipt",
    playbook: [
      { id: "credit", label: "Credit the store", hint: "Issue a credit for damaged quantity" },
      { id: "replace", label: "Replace on next run", hint: "Add replacement to the next order" },
      notifyStore,
    ],
  },
  RECEIPT_WRONG_ITEMS: {
    label: "Wrong items received",
    playbook: [
      { id: "collect", label: "Collect wrong items next run", hint: "Driver collects on the next visit" },
      { id: "replace", label: "Send correct items", hint: "Add to next run" },
      notifyStore,
    ],
  },
  OTHER: { label: "Other", playbook: [notifyStore, notifyDriver] },
}

export const ISSUE_STAGE_LABEL: Record<IssueStage, string> = {
  PLANNING: "Planning",
  LOADING: "Loading",
  DELIVERY: "Delivery",
  RECEIPT: "Receipt",
}

export const createIssueSchema = z.object({
  clientId: z.string().optional(),
  stage: z.enum(ISSUE_STAGES),
  type: z.enum(ISSUE_TYPES),
  severity: z.enum(ISSUE_SEVERITIES).default("MEDIUM"),
  description: z.string().min(3).max(1000),
  quantity: z.number().int().positive().optional(),
  tripId: z.string().optional(),
  stopId: z.string().optional(),
  orderId: z.string().optional(),
  orderLineId: z.string().optional(),
  outletId: z.string().optional(),
  vehicleId: z.string().optional(),
})
export type CreateIssueInput = z.infer<typeof createIssueSchema>

export const resolveIssueInputSchema = z.object({
  actions: z.array(z.string()).default([]),
  resolution: z.string().min(3).max(1000),
})
export type ResolveIssueInput = z.infer<typeof resolveIssueInputSchema>
