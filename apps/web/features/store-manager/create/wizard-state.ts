import type { CreateStoreOrderInput, StoreOrderRules, StoreProduct, StoreTemp } from "@waypoint/shared"
import { minToHHMM } from "@/lib/format"

/** Everything the four wizard steps edit. Quantities are keyed by product id; 0 or missing means not selected. */
export interface OrderDraft {
  draftId?: string
  temp: StoreTemp | null
  qty: Record<string, number>
  deliveryDate?: string
  windowPref?: string
  notes: string
}

export const EMPTY_DRAFT: OrderDraft = { temp: null, qty: {}, notes: "" }

export const STEPS = [
  { key: "type", label: "Order type" },
  { key: "products", label: "Products" },
  { key: "delivery", label: "Delivery" },
  { key: "review", label: "Review" },
]

export const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const fromIso = (s: string) => new Date(`${s}T00:00:00`)

export function totals(draft: OrderDraft, products: StoreProduct[]) {
  const picked = products.filter((p) => (draft.qty[p.id] ?? 0) > 0)
  return {
    picked,
    items: picked.length,
    units: picked.reduce((s, p) => s + draft.qty[p.id], 0),
    weightKg: picked.reduce((s, p) => s + p.unitWeightKg * draft.qty[p.id], 0),
    volumeM3: picked.reduce((s, p) => s + p.unitVolumeM3 * draft.qty[p.id], 0),
  }
}

/** Null when the load fits one vehicle, otherwise the sentence the planner-facing rule would give. */
export function sizeProblem(t: ReturnType<typeof totals>, temp: StoreTemp | null, rules?: StoreOrderRules) {
  const lim = temp && rules?.limits[temp]
  if (!lim || !t.items) return null
  if (t.weightKg <= lim.weightKg && t.volumeM3 <= lim.volumeM3) return null
  return `This order is larger than one vehicle can carry (up to ${Math.round(lim.weightKg)} kg and ${lim.volumeM3} m³). Split it into two orders.`
}

/** Delivery slots inside the outlet's receiving window: the whole window, then each half. */
export function windowSlots(rules: StoreOrderRules) {
  const { openMin, closeMin } = rules.window
  const mid = Math.round((openMin + (closeMin - openMin) / 2) / 15) * 15
  const slot = (a: number, b: number) => `${minToHHMM(a)}-${minToHHMM(b)}`
  return [
    { value: "", label: `Any time (${minToHHMM(openMin)}–${minToHHMM(closeMin)})` },
    { value: slot(openMin, mid), label: `Early (${minToHHMM(openMin)}–${minToHHMM(mid)})` },
    { value: slot(mid, closeMin), label: `Later (${minToHHMM(mid)}–${minToHHMM(closeMin)})` },
  ]
}

export function toInput(draft: OrderDraft, mode: "draft" | "submit", clientRequestId: string): CreateStoreOrderInput {
  return {
    clientRequestId,
    draftId: draft.draftId,
    mode,
    temp: draft.temp ?? "AMBIENT",
    deliveryDate: draft.deliveryDate,
    windowPref: draft.windowPref || undefined,
    notes: draft.notes.trim() || undefined,
    lines: Object.entries(draft.qty)
      .filter(([, q]) => q > 0)
      .map(([productId, quantity]) => ({ productId, quantity })),
  }
}
