import { z } from "zod"
import type { Brand } from "./constants"

/** Store-manager app contracts: query validation plus the response shapes both sides rely on. */

export const STORE_ORDER_TABS = ["orders", "drafts", "cancelled"] as const
export type StoreOrderTab = (typeof STORE_ORDER_TABS)[number]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const storeOrdersQuerySchema = z.object({
  tab: z.enum(STORE_ORDER_TABS).default("orders"),
  q: z.string().trim().max(60).optional(),
  status: z.string().max(20).optional(),
  from: isoDate.optional(), // delivery date range, inclusive
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
})
export type StoreOrdersQuery = z.infer<typeof storeOrdersQuerySchema>

export interface StoreOrderRow {
  id: string
  ref: string
  brand: Brand
  temp: "CHILLED" | "AMBIENT"
  status: string
  units: number
  items: number
  weightKg: number
  deliveryDate: string
  requestedDate: string
  submittedAt: string
  deferCount: number
  /** True while the dispatcher has not planned the order: submitted orders can be edited, drafts continued. */
  editable: boolean
}

export interface StoreOrdersResponse {
  items: StoreOrderRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<StoreOrderTab, number>
}

/** Where an order is on the road, from the trip that carries it (null until a plan is published). */
export interface StoreOrderDelivery {
  tripId: string
  tripRef: string
  tripStatus: string
  vehicleId: string
  driver: { name: string; phone: string | null } | null
  stopStatus: string
  plannedArrivalMin: number
  etaMin: number | null
  completedAt: string | null
}

export interface StoreOrderDetail extends StoreOrderRow {
  volumeM3: number
  notes: string | null
  windowPref: string | null
  outlet: { id: string; name: string }
  createdBy: string
  lines: { id: string; productId: string | null; description: string; category: string; quantity: number; weightKg: number; volumeM3: number }[]
  delivery: StoreOrderDelivery | null
  receipt: { status: string; notes: string | null; confirmedAt: string; confirmedBy: string } | null
  issues: { id: string; ref: string; type: string; status: string }[]
  timeline: { id: string; action: string; at: string; actor: string }[]
  /** Set once the order is cancelled: the reason the store gave, for the cancellation receipt. */
  cancellation: { reason: StoreCancelReason; note: string | null; at: string; by: string } | null
}

export interface StoreDeliveryRow {
  orderId: string
  orderRef: string
  status: string
  deliveryDate: string
  vehicleId: string | null
  etaMin: number | null
  plannedArrivalMin: number | null
}

export interface StoreDashboard {
  kpis: { totalOrders: number; incoming: number; received: number; awaitingReceipt: number; openIssues: number }
  recentOrders: StoreOrderRow[]
  recentDeliveries: StoreDeliveryRow[]
}

// ───────────────────────────── Create order ─────────────────────────────

export type StoreTemp = "CHILLED" | "AMBIENT"

export const createStoreOrderSchema = z.object({
  /** Generated once per wizard session, so a double-click or retry never creates two orders. */
  clientRequestId: z.string().min(8).max(64),
  /** Continue an existing draft instead of creating a new order. */
  draftId: z.string().optional(),
  mode: z.enum(["draft", "submit"]),
  temp: z.enum(["CHILLED", "AMBIENT"]),
  deliveryDate: isoDate.optional(),
  windowPref: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(5000) }))
    .max(60)
    .refine((ls) => new Set(ls.map((l) => l.productId)).size === ls.length, "Each product can appear once"),
})
export type CreateStoreOrderInput = z.infer<typeof createStoreOrderSchema>

/** Editing a submitted order replaces its items and delivery details; the request id and mode do not apply. */
export const updateStoreOrderSchema = createStoreOrderSchema.omit({ clientRequestId: true, draftId: true, mode: true })
export type UpdateStoreOrderInput = z.infer<typeof updateStoreOrderSchema>

export interface StoreProduct {
  id: string
  sku: string
  name: string
  category: string
  temp: StoreTemp
  unitLabel: string
  unitWeightKg: number
  unitVolumeM3: number
  maxQty: number
}

/** Everything the wizard needs to enforce the ordering rules in the browser; the server enforces them again. */
export interface StoreOrderRules {
  today: string
  nowMin: number
  cutoffMin: number
  brand: Brand
  tempOptions: StoreTemp[]
  earliestDate: string
  latestDate: string
  /** Non-operating days between today and latestDate. */
  closedDates: string[]
  window: { openMin: number; closeMin: number }
  /** Largest single load the fleet can carry for each temperature (null if no suitable vehicle). */
  limits: Record<StoreTemp, { weightKg: number; volumeM3: number } | null>
}

export interface StoreOrderSaved {
  id: string
  ref: string
  status: string
  deliveryDate: string
  units: number
  items: number
  weightKg: number
}

// ───────────────────────────── Cancel order ─────────────────────────────

export const STORE_CANCEL_REASONS = ["ORDERED_BY_MISTAKE", "WRONG_ITEMS_OR_QUANTITY", "NO_LONGER_NEEDED", "CHANGE_OF_PLANS", "OTHER"] as const
export type StoreCancelReason = (typeof STORE_CANCEL_REASONS)[number]

export const STORE_CANCEL_REASON_LABEL: Record<StoreCancelReason, string> = {
  ORDERED_BY_MISTAKE: "Ordered by mistake",
  WRONG_ITEMS_OR_QUANTITY: "Wrong items or quantities",
  NO_LONGER_NEEDED: "No longer needed",
  CHANGE_OF_PLANS: "Change of plans",
  OTHER: "Other",
}

export const cancelStoreOrderSchema = z.object({
  reason: z.enum(STORE_CANCEL_REASONS),
  note: z.string().trim().max(300).optional(),
})
export type CancelStoreOrderInput = z.infer<typeof cancelStoreOrderSchema>

/** The one format for order references the system hands out: ORD-0000123. (S1-… refs belong to the challenge scenario.) */
export const formatOrderRef = (n: number) => `ORD-${String(n).padStart(7, "0")}`

// ───────────────────────────── Deliveries ─────────────────────────────

export const STORE_DELIVERY_TABS = ["upcoming", "today", "history"] as const
export type StoreDeliveryTab = (typeof STORE_DELIVERY_TABS)[number]

export const storeDeliveriesQuerySchema = z.object({
  tab: z.enum(STORE_DELIVERY_TABS).default("today"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
})
export type StoreDeliveriesQuery = z.infer<typeof storeDeliveriesQuerySchema>

/** Where a delivery is on its way to being counted in. */
export const DELIVERY_STAGES = ["PLANNED", "LOADED", "ON_THE_WAY", "ARRIVED", "DELIVERED", "RECEIVED"] as const
export type DeliveryStage = (typeof DELIVERY_STAGES)[number]
export const DELIVERY_STAGE_LABEL: Record<DeliveryStage, string> = {
  PLANNED: "Planned",
  LOADED: "Loaded",
  ON_THE_WAY: "On the way",
  ARRIVED: "Arrived",
  DELIVERED: "Delivered",
  RECEIVED: "Received",
}

export interface StoreDeliveryItem {
  orderId: string
  orderRef: string
  status: string
  stage: DeliveryStage | null
  deliveryDate: string
  temp: StoreTemp
  units: number
  items: number
  vehicleId: string | null
  driverName: string | null
  plannedArrivalMin: number | null
  etaMin: number | null
  /** The driver has handed it over and the store has not counted it in yet. */
  canReceive: boolean
}

/** The delivery the store is waiting for right now, with live position in the trip. */
export interface StoreOnTheWay {
  orderId: string
  orderRef: string
  stage: DeliveryStage
  tripRef: string
  vehicleId: string
  vehicleLabel: string
  driver: { name: string; phone: string | null } | null
  plannedArrivalMin: number
  etaMin: number
  /** Minutes behind (positive) or ahead (negative) of plan. */
  delayMin: number
  windowOpenMin: number
  windowCloseMin: number
  /** Stops the vehicle still has to make before yours. */
  stopsBefore: number
  totalStops: number
  /** True when the position comes from the driver app or the running clock, false for a plain schedule. */
  live: boolean
  units: number
  items: number
}

export interface StoreDeliveriesResponse {
  tab: StoreDeliveryTab
  today: string
  items: StoreDeliveryItem[]
  total: number
  page: number
  pageSize: number
  counts: Record<StoreDeliveryTab, number>
  onTheWay: StoreOnTheWay | null
}

// ───────────────────────────── Receiving ─────────────────────────────

export const LINE_CONDITIONS = ["GOOD", "DAMAGED", "EXPIRED", "WRONG_ITEM"] as const
export type LineCondition = (typeof LINE_CONDITIONS)[number]
export const LINE_CONDITION_LABEL: Record<LineCondition, string> = {
  GOOD: "Good",
  DAMAGED: "Damaged",
  EXPIRED: "Expired",
  WRONG_ITEM: "Wrong item",
}

/** What the driver says was handed over: the baseline the store counts against. */
export interface StoreReceivingDetail {
  orderId: string
  orderRef: string
  status: string
  temp: StoreTemp
  deliveredAt: string | null
  recipientName: string | null
  driverNotes: string | null
  /** True once a receipt exists (the order is RECEIVED). */
  received: boolean
  /** True when the order is in a state the store can count in. */
  canReceive: boolean
  lines: { orderLineId: string; description: string; category: string; orderedQty: number; expectedQty: number; refusedQty: number; reason: string | null }[]
}

export const receiveDeliverySchema = z.object({
  lines: z
    .array(
      z.object({
        orderLineId: z.string(),
        receivedQty: z.number().int().min(0).max(100_000),
        condition: z.enum(LINE_CONDITIONS).default("GOOD"),
        notes: z.string().trim().max(200).optional(),
      }),
    )
    .min(1),
  notes: z.string().trim().max(500).optional(),
})
export type ReceiveDeliveryInput = z.infer<typeof receiveDeliverySchema>

export interface StoreReceiptResult {
  orderId: string
  orderRef: string
  receiptStatus: string
  /** Issues raised automatically for lines that were short, damaged or wrong. */
  issues: { id: string; ref: string; type: string }[]
}

// ───────────────────────────── Issues ─────────────────────────────

export const STORE_ISSUE_TYPES = ["RECEIPT_MISSING", "RECEIPT_DAMAGED", "RECEIPT_WRONG_ITEMS", "OTHER"] as const
export type StoreIssueType = (typeof STORE_ISSUE_TYPES)[number]

export const reportStoreIssueSchema = z.object({
  clientId: z.string().min(8).max(64).optional(),
  type: z.enum(STORE_ISSUE_TYPES),
  orderLineId: z.string().optional(),
  quantity: z.number().int().positive().max(100_000).optional(),
  description: z.string().trim().min(3).max(500),
  photoId: z.string().min(8).optional(),
})
export type ReportStoreIssueInput = z.infer<typeof reportStoreIssueSchema>

export interface StoreIssueRow {
  id: string
  ref: string
  type: string
  severity: string
  status: string
  description: string
  quantity: number | null
  createdAt: string
  orderId: string | null
  orderRef: string | null
  resolution: string | null
}

export interface StoreIssueDetail extends StoreIssueRow {
  stage: string
  line: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  reportedBy: string
  /** Id of the attached photo; the image itself is served at /api/media/<id>. */
  photoId: string | null
  timeline: { id: string; action: string; at: string; actor: string }[]
}

export interface StoreMediaSaved {
  id: string
  sizeBytes: number
}

// ───────────────────────────── Live tracking ─────────────────────────────

/**
 * What a store may see of the vehicle bringing its order. Deliberately narrow: this outlet's own stop, the
 * vehicle, and the road still ahead of it. Other outlets' stops and trips never appear.
 */
export interface StoreLiveView {
  orderId: string
  orderRef: string
  stage: DeliveryStage
  generatedAt: string
  /** Position comes from the driver app or the running clock, not just a timetable. */
  live: boolean
  depot: { name: string; position: { lat: number; lng: number } }
  destination: { name: string; position: { lat: number; lng: number }; windowOpenMin: number; windowCloseMin: number }
  vehicle: {
    id: string
    label: string
    position: { lat: number; lng: number }
    heading: number
    /** The vehicle has left the depot (otherwise only the depot and destination are drawn). */
    departed: boolean
    status: string
    /** Minutes since the driver's last GPS fix; null when the position is not from a phone. */
    lastSeenMin: number | null
    fromDriver: boolean
    simulatedGps: boolean
  }
  etaMin: number
  delayMin: number
  stopsBefore: number
  totalStops: number
  /** Road still to drive from the vehicle to this outlet. Empty before departure and after arrival. */
  route: { lat: number; lng: number }[]
  routeSource: "mapbox" | "straight" | null
}
