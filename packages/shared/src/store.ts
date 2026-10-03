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
  outlet: { id: string; name: string }
  createdBy: string
  lines: { id: string; description: string; category: string; quantity: number; weightKg: number; volumeM3: number }[]
  delivery: StoreOrderDelivery | null
  receipt: { status: string; notes: string | null; confirmedAt: string; confirmedBy: string } | null
  issues: { id: string; ref: string; type: string; status: string }[]
  timeline: { id: string; action: string; at: string; actor: string }[]
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
