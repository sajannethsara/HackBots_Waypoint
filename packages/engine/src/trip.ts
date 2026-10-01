import { RULES, type Brand } from "@waypoint/shared"
import type {
  EngineDistrict,
  EngineOrder,
  EngineOutlet,
  EngineVehicle,
  PlannedStop,
  Violation,
} from "./types"

export interface Lookup {
  outlet: Map<string, EngineOutlet>
  district: Map<string, EngineDistrict>
  serviceAllowance: Record<string, number>
}

/** Effective receiving window = outlet window ∩ mall access window. */
export function effectiveWindow(o: EngineOutlet): [number, number] {
  let open = o.windowOpenMin
  let close = o.windowCloseMin
  if (o.mallWindowOpenMin != null && o.mallWindowCloseMin != null) {
    open = Math.max(open, o.mallWindowOpenMin)
    close = Math.min(close, o.mallWindowCloseMin)
  }
  return [open, close]
}

export function serviceMin(lk: Lookup, brand: Brand, outlet: EngineOutlet): number {
  return lk.serviceAllowance[`${brand}:${outlet.dockType}`] ?? 20
}

export function isFresh(brand: Brand) {
  return brand === "FRESH"
}

export function budgetFor(brand: Brand) {
  return isFresh(brand) ? RULES.freshBudgetMin : RULES.styleTechBudgetMin
}

export function dayStartFor(brand: Brand) {
  return isFresh(brand) ? RULES.freshStartMin : RULES.tradingStartMin
}

/** Task 2B trip-time formula: outbound + inter-stop × (n−1) + Σ handling. */
export function tripDuration(lk: Lookup, brand: Brand, districtId: string, orders: EngineOrder[]) {
  const d = lk.district.get(districtId)!
  const handling = orders.reduce((s, o) => s + serviceMin(lk, brand, lk.outlet.get(o.outletId)!), 0)
  return d.depotToDistrictMin + d.interStopMin * Math.max(0, orders.length - 1) + handling
}

/** Round-trip distance including the return leg — what the fuel tank actually pays for. */
export function tripKm(lk: Lookup, districtId: string, n: number) {
  const d = lk.district.get(districtId)!
  return d.depotToDistrictKm * 2 + d.interStopKm * Math.max(0, n - 1)
}

export interface Schedule {
  departMin: number
  stops: PlannedStop[]
  endMin: number
  feasible: boolean
  lateCount: number
}

/**
 * Sequence stops by window close (earliest deadline first) and simulate the clock.
 * Early arrivals wait for the window to open. Departure is pushed as late as possible
 * so the first stop is reached when its window opens, but never before `earliestDepart`.
 */
export function schedule(
  lk: Lookup,
  brand: Brand,
  districtId: string,
  orders: EngineOrder[],
  earliestDepart: number,
): Schedule {
  const d = lk.district.get(districtId)!
  const items = orders
    .map((o) => {
      const outlet = lk.outlet.get(o.outletId)!
      const [open, close] = effectiveWindow(outlet)
      return { o, outlet, open, close }
    })
    .sort((a, b) => a.close - b.close || a.open - b.open)

  const firstOpen = items[0]?.open ?? earliestDepart
  const departMin = Math.max(earliestDepart, firstOpen - d.depotToDistrictMin)
  let t = departMin + d.depotToDistrictMin
  let lateCount = 0
  const stops: PlannedStop[] = items.map((it, i) => {
    if (i > 0) t += d.interStopMin
    const arrival = t
    const start = Math.max(arrival, it.open)
    const svc = serviceMin(lk, brand, it.outlet)
    const late = arrival > it.close
    if (late) lateCount++
    t = start + svc
    return {
      orderId: it.o.id,
      seq: i + 1,
      arrivalMin: Math.round(arrival),
      waitMin: Math.round(start - arrival),
      serviceMin: svc,
      windowOpenMin: it.open,
      windowCloseMin: it.close,
      atRisk: late || it.close - arrival < 15,
      riskReason: late
        ? `Arrives ${Math.round(arrival - it.close)} min after window closes`
        : it.close - arrival < 15
          ? "Less than 15 min slack before window closes"
          : undefined,
    }
  })
  return { departMin, stops, endMin: t + d.depotToDistrictMin, feasible: lateCount === 0, lateCount }
}

/** Static compatibility of one order with one vehicle (temperature + access). */
export function compatible(lk: Lookup, o: EngineOrder, v: EngineVehicle): Violation | null {
  if (o.temp === "CHILLED" && v.temp !== "REEFER")
    return { rule: "REFRIGERATION", message: `${o.ref} is chilled; ${v.id} is not a reefer` }
  const outlet = lk.outlet.get(o.outletId)!
  if (outlet.parkingConstraint === "VAN_ONLY" && v.type !== "VAN")
    return { rule: "ACCESS", message: `${outlet.id} is van-only; ${v.id} is a truck` }
  return null
}

export interface TripSpec {
  vehicle: EngineVehicle
  brand: Brand
  districtId: string
  orders: EngineOrder[]
}

/** Full rule check for one trip — used by the planner and by manual edits. */
export function validateTrip(lk: Lookup, spec: TripSpec, enforceWindows = true): Violation[] {
  const v: Violation[] = []
  const { vehicle, brand, districtId, orders } = spec
  for (const o of orders) {
    if (o.brand !== brand || o.districtId !== districtId)
      v.push({ rule: "BRAND_DISTRICT", message: `${o.ref} is ${o.brand}/${o.districtId}; trip is ${brand}/${districtId}` })
    const c = compatible(lk, o, vehicle)
    if (c) v.push(c)
  }
  const w = orders.reduce((s, o) => s + o.weightKg, 0)
  const vol = orders.reduce((s, o) => s + o.volumeM3, 0)
  if (w > vehicle.weightCapKg)
    v.push({ rule: "CAPACITY", message: `Weight ${w.toFixed(0)} kg exceeds ${vehicle.weightCapKg} kg` })
  if (vol > vehicle.volumeCapM3)
    v.push({ rule: "CAPACITY", message: `Volume ${vol.toFixed(2)} m³ exceeds ${vehicle.volumeCapM3} m³` })
  const dur = tripDuration(lk, brand, districtId, orders)
  if (dur > budgetFor(brand))
    v.push({ rule: "TIME", message: `Trip takes ${Math.round(dur)} min; budget is ${budgetFor(brand)} min` })
  const fuel = tripKm(lk, districtId, orders.length) / vehicle.kmPerL
  if (fuel > vehicle.fuelRemainingL)
    v.push({ rule: "FUEL", message: `Needs ${fuel.toFixed(1)} L; ${vehicle.fuelRemainingL.toFixed(1)} L left this week` })
  if (enforceWindows) {
    const s = schedule(lk, brand, districtId, orders, dayStartFor(brand))
    for (const st of s.stops)
      if (st.arrivalMin > st.windowCloseMin)
        v.push({ rule: "WINDOW", message: `${orders.find((o) => o.id === st.orderId)?.ref ?? st.orderId} would arrive ${st.arrivalMin - st.windowCloseMin} min after its window closes` })
  }
  return v
}
