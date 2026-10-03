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
