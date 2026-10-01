import { BRAND_LABEL, DEFERRAL_REASON_META, type Brand, type DeferralReason } from "@waypoint/shared"
import { scoreOrder } from "./scoring"
import {
  budgetFor,
  compatible,
  dayStartFor,
  isFresh,
  schedule,
  tripDuration,
  tripKm,
  type Lookup,
} from "./trip"
import type {
  EngineOrder,
  EngineVehicle,
  OrderDecision,
  PlanInput,
  PlanOptions,
  PlanResult,
  PlannedTrip,
  PlanSummary,
  ScoreBreakdown,
} from "./types"

export const ENGINE_VERSION = "greedy-v1"

const DEFAULTS: PlanOptions = { enforceWindows: true, maxStopsPerTrip: 8, reeferChilledOnly: true }

interface Scored extends EngineOrder {
  score: number
  breakdown: ScoreBreakdown
}

interface VState {
  v: EngineVehicle
  trips: PlannedTrip[]
  freshUsed: number
  styleTechUsed: number
  fuelLeft: number
  busyUntil: number
}

interface Candidate {
  vs: VState
  orders: Scored[]
  value: number
  trip: PlannedTrip
}

/**
 * Greedy "best next trip" allocator.
 *
 * Phase 1 plans Fresh (03:30–08:00), phase 2 plans Style + Tech (trading day), so a vehicle
 * can run a Fresh trip and then a Style/Tech trip. In each step we build, for every
 * brand+district group, the best trip any vehicle could run next, and commit the one that
 * serves the most priority. Reefers and vans carry a penalty when used for loads that do
 * not need them, so scarce capability is saved for orders that do.
 */
export function planDay(input: PlanInput): PlanResult {
  const opts: PlanOptions = { ...DEFAULTS, ...input.options }
  const lk: Lookup = {
    outlet: new Map(input.outlets.map((o) => [o.id, o])),
    district: new Map(input.districts.map((d) => [d.id, d])),
    serviceAllowance: input.serviceAllowance,
  }

  const scored: Scored[] = input.orders.map((o) => {
    const { score, breakdown } = scoreOrder(o, input.context)
    return { ...o, score, breakdown }
  })

  const fleet: VState[] = input.vehicles
    .filter((v) => v.available)
    .map((v) => ({ v, trips: [], freshUsed: 0, styleTechUsed: 0, fuelLeft: v.fuelRemainingL, busyUntil: 0 }))

  const remaining = new Set(scored.map((o) => o.id))
  const byId = new Map(scored.map((o) => [o.id, o]))

  // Priority-first: the most urgent unplaced order seeds the next trip; the trip is then
  // filled with the best of its brand+district group. An order that no vehicle can take
  // now never becomes placeable later (state only tightens), so it is dropped for good.
  const byScore = (a: Scored, b: Scored) => b.score - a.score || a.volumeM3 - b.volumeM3
  for (const phase of [["FRESH"], ["STYLE", "TECH"]] as Brand[][]) {
    const unplaceable = new Set<string>()
    for (;;) {
      const open = scored.filter((o) => remaining.has(o.id) && !unplaceable.has(o.id) && phase.includes(o.brand))
      open.sort(byScore)
      let committed = false
      for (const seed of open) {
        const group = open.filter((o) => o.brand === seed.brand && o.districtId === seed.districtId)
        let best: Candidate | null = null
        for (const vs of fleet) {
          const c = buildCandidate(lk, vs, group, opts, seed)
          if (c && (!best || c.value > best.value)) best = c
        }
        if (!best) {
          unplaceable.add(seed.id)
          continue
        }
        commit(best)
        for (const o of best.orders) remaining.delete(o.id)
        committed = true
        break
      }
      if (!committed) break
    }
  }

  // Number trips per vehicle in time order
  for (const vs of fleet) vs.trips.sort((a, b) => a.departMin - b.departMin).forEach((t, i) => (t.tripNo = i + 1))
  const trips = fleet.flatMap((vs) => vs.trips)

  const assignment = new Map<string, PlannedTrip>()
  for (const t of trips) for (const s of t.stops) assignment.set(s.orderId, t)

  const decisions: OrderDecision[] = scored.map((o) => {
    const t = assignment.get(o.id)
    if (t)
      return {
        orderId: o.id,
        decision: "SERVED",
        priorityScore: o.score,
        scoreBreakdown: o.breakdown,
        vehicleId: t.vehicleId,
        tripNo: t.tripNo,
      }
    const d = diagnose(lk, o, fleet, input.vehicles, trips, byId, opts)
    return {
      orderId: o.id,
      decision: "DEFERRED",
      priorityScore: o.score,
      scoreBreakdown: o.breakdown,
      ...d,
    }
  })

  return { trips, decisions, summary: summarise(input, scored, trips, decisions, fleet) }
}

function buildCandidate(
  lk: Lookup,
  vs: VState,
  group: Scored[],
  opts: PlanOptions,
  seed: Scored,
): Candidate | null {
  if (vs.trips.length >= 2) return null
  // Reefer time is the scarcest resource: a chilled-seeded reefer trip carries only chilled
  // orders (every ambient stop would burn reefer minutes that another chilled trip needs).
  let rest = group.filter((o) => o.id !== seed.id)
  if (vs.v.temp === "REEFER" && seed.temp === "CHILLED" && opts.reeferChilledOnly)
    rest = rest.filter((o) => o.temp === "CHILLED")
  const orders = [seed, ...rest]
  const brand = orders[0].brand
  const districtId = orders[0].districtId
  const fresh = isFresh(brand)
  const used = fresh ? vs.freshUsed : vs.styleTechUsed
  const budgetLeft = budgetFor(brand) - used
  const earliest = Math.max(dayStartFor(brand), vs.busyUntil)

  const picked: Scored[] = []
  let w = 0
  let vol = 0
  for (const o of orders) {
    if (picked.length >= opts.maxStopsPerTrip) break
    if (compatible(lk, o, vs.v)) continue
    if (w + o.weightKg > vs.v.weightCapKg || vol + o.volumeM3 > vs.v.volumeCapM3) continue
    const next = [...picked, o]
    if (tripDuration(lk, brand, districtId, next) > budgetLeft) continue
    if (tripKm(lk, districtId, next.length) / vs.v.kmPerL > vs.fuelLeft) continue
    if (opts.enforceWindows && !schedule(lk, brand, districtId, next, earliest).feasible) continue
    picked.push(o)
    w += o.weightKg
    vol += o.volumeM3
  }
  if (picked[0]?.id !== seed.id) return null

  const sched = schedule(lk, brand, districtId, picked, earliest)
  const km = tripKm(lk, districtId, picked.length)
  const trip: PlannedTrip = {
    vehicleId: vs.v.id,
    tripNo: vs.trips.length + 1,
    brand,
    districtId,
    departMin: sched.departMin,
    durationMin: tripDuration(lk, brand, districtId, picked),
    endMin: sched.endMin,
    km,
    fuelL: round1(km / vs.v.kmPerL),
    weightKg: round1(w),
    volumeM3: Math.round(vol * 1000) / 1000,
    stops: sched.stops,
  }

  // Value: priority served, minus penalties for burning scarce capability or leaving space unused.
  let value = picked.reduce((s, o) => s + o.score, 0)
  const needsReefer = picked.some((o) => o.temp === "CHILLED")
  const needsVan = picked.some((o) => lk.outlet.get(o.outletId)!.parkingConstraint === "VAN_ONLY")
  if (vs.v.temp === "REEFER" && !needsReefer) value -= 25
  if (vs.v.type === "VAN" && !needsVan) value -= 25
  value -= 5 * (1 - Math.max(w / vs.v.weightCapKg, vol / vs.v.volumeCapM3))
  return { vs, orders: picked, value, trip }
}

function commit(c: Candidate) {
  const { vs, trip } = c
  vs.trips.push(trip)
  if (isFresh(trip.brand)) vs.freshUsed += trip.durationMin
  else vs.styleTechUsed += trip.durationMin
  vs.fuelLeft -= trip.fuelL
  vs.busyUntil = trip.endMin
}

/** Work out which constraint kept an order off the plan, and whether that was unavoidable. */
function diagnose(
  lk: Lookup,
  o: Scored,
  fleet: VState[],
  allVehicles: EngineVehicle[],
  trips: PlannedTrip[],
  byId: Map<string, Scored>,
  opts: PlanOptions,
): Pick<OrderDecision, "reason" | "explanation" | "unavoidable"> {
  const outlet = lk.outlet.get(o.outletId)!
  const vanOnly = outlet.parkingConstraint === "VAN_ONLY"
  const chilled = o.temp === "CHILLED"
  const need = [chilled ? "reefer" : null, vanOnly ? "van" : null].filter(Boolean).join(" ") || "vehicle"
  const compat = fleet.filter((vs) => !compatible(lk, o, vs.v))

  if (!compat.length) {
    const inWorkshop = allVehicles.filter((v) => !v.available && !compatible(lk, o, v)).length
    if (inWorkshop)
      return {
        reason: "VEHICLE_UNAVAILABLE",
        unavoidable: true,
        explanation: `Every ${need} that can serve ${outlet.id} is unavailable today (${inWorkshop} in workshop).`,
      }
    return {
      reason: chilled ? "REEFER_CAPACITY" : "ACCESS_RESTRICTION",
      unavoidable: true,
      explanation: `No ${need} at this depot can serve ${outlet.id}.`,
    }
  }

  const fits = compat.filter((vs) => o.weightKg <= vs.v.weightCapKg && o.volumeM3 <= vs.v.volumeCapM3)
  if (!fits.length) {
    const big = compat.reduce((m, vs) => (vs.v.volumeCapM3 > m.v.volumeCapM3 ? vs : m))
    return {
      reason: "VEHICLE_CAPACITY",
      unavoidable: true,
      explanation: `Order is ${o.volumeM3.toFixed(1)} m³ / ${Math.round(o.weightKg)} kg; the largest suitable vehicle (${big.v.id}) holds ${big.v.volumeCapM3} m³ / ${big.v.weightCapKg} kg and orders cannot be split. Needs a split or a hired vehicle.`,
    }
  }

  // Could a fresh vehicle at day start ever make this order alone?
  const solo = schedule(lk, o.brand, o.districtId, [o], dayStartFor(o.brand))
  if (opts.enforceWindows && !solo.feasible)
    return {
      reason: "DELIVERY_WINDOW",
      unavoidable: true,
      explanation: `Even leaving at ${hhmm(dayStartFor(o.brand))}, the earliest arrival misses ${outlet.id}'s window.`,
    }
  if (tripDuration(lk, o.brand, o.districtId, [o]) > budgetFor(o.brand))
    return {
      reason: "TIME_BUDGET",
      unavoidable: true,
      explanation: `A single-stop trip to ${o.districtId} exceeds the ${budgetFor(o.brand)}-min ${BRAND_LABEL[o.brand]} budget.`,
    }

  // Was it a packing choice? Lower-score orders of the same brand+district rode instead.
  const compatIds = new Set(compat.map((vs) => vs.v.id))
  const displaced = trips
    .filter((t) => compatIds.has(t.vehicleId) && t.brand === o.brand && t.districtId === o.districtId)
    .flatMap((t) => t.stops.map((s) => byId.get(s.orderId)!))
    .filter((x) => x.score < o.score).length
  const unavoidable = displaced === 0

  // Classify the binding constraint across compatible vehicles.
  const counts: Partial<Record<DeferralReason, number>> = {}
  for (const vs of compat) {
    let r: DeferralReason
    const used = isFresh(o.brand) ? vs.freshUsed : vs.styleTechUsed
    if (vs.trips.length >= 2) r = chilled ? "REEFER_CAPACITY" : vanOnly ? "ACCESS_RESTRICTION" : "VEHICLE_CAPACITY"
    else if (tripDuration(lk, o.brand, o.districtId, [o]) > budgetFor(o.brand) - used) r = "TIME_BUDGET"
    else if (tripKm(lk, o.districtId, 1) / vs.v.kmPerL > vs.fuelLeft) r = "FUEL_QUOTA"
    else if (
      opts.enforceWindows &&
      !schedule(lk, o.brand, o.districtId, [o], Math.max(dayStartFor(o.brand), vs.busyUntil)).feasible
    )
      r = "DELIVERY_WINDOW"
    else r = chilled ? "REEFER_CAPACITY" : "VEHICLE_CAPACITY"
    counts[r] = (counts[r] ?? 0) + 1
  }
  let binding = (Object.entries(counts).sort((a, b) => b[1]! - a[1]!)[0]?.[0] ?? "OTHER") as DeferralReason
  // When the only suitable vehicles are a scarce class, name the class rather than the symptom.
  if (binding === "TIME_BUDGET" || binding === "VEHICLE_CAPACITY") {
    if (chilled) binding = "REEFER_CAPACITY"
    else if (vanOnly) binding = "ACCESS_RESTRICTION"
  }
  const reason = binding
  const label = DEFERRAL_REASON_META[reason].label.toLowerCase()
  const why = counts.TIME_BUDGET ? "out of time budget" : "full"
  const base: Record<string, string> = {
    REEFER_CAPACITY: `All ${compat.length} reefer${vanOnly ? " van" : ""}s are ${why} or on their second trip; none can reach ${o.districtId} in time.`,
    ACCESS_RESTRICTION: `${outlet.id} is van-only and all ${compat.length} suitable vans are ${why}.`,
    VEHICLE_CAPACITY: `No remaining ${need} capacity for ${BRAND_LABEL[o.brand]} ${o.districtId} after higher-priority loads.`,
    TIME_BUDGET: `Remaining ${BRAND_LABEL[o.brand]} time budget on suitable vehicles is too short for a ${o.districtId} trip.`,
    FUEL_QUOTA: `Suitable vehicles do not have enough weekly fuel quota left for a ${o.districtId} round trip.`,
    DELIVERY_WINDOW: `Suitable vehicles are free only after ${outlet.id}'s window closes.`,
  }
  return {
    reason,
    unavoidable,
    explanation:
      (base[reason] ?? `Deferred: ${label}.`) +
      (unavoidable
        ? ""
        : ` ${displaced} smaller, lower-priority ${o.districtId} order(s) fitted the remaining space instead.`),
  }
}

function summarise(
  input: PlanInput,
  orders: Scored[],
  trips: PlannedTrip[],
  decisions: OrderDecision[],
  fleet: VState[],
): PlanSummary {
  const lkOutlet = new Map(input.outlets.map((o) => [o.id, o]))
  const served = decisions.filter((d) => d.decision === "SERVED").length
  const deferralsByReason: Partial<Record<DeferralReason, number>> = {}
  for (const d of decisions) if (d.reason) deferralsByReason[d.reason] = (deferralsByReason[d.reason] ?? 0) + 1

  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
  const avail = fleet.map((f) => f.v)
  const demandVol = sum(orders.map((o) => o.volumeM3))
  const servedIds = new Set(trips.flatMap((t) => t.stops.map((s) => s.orderId)))
  const servedVol = sum(orders.filter((o) => servedIds.has(o.id)).map((o) => o.volumeM3))
  const vehicleMap = new Map(input.vehicles.map((v) => [v.id, v]))

  const resources = [
    {
      key: "reefer",
      label: "Chilled volume vs reefer capacity",
      demand: round1(sum(orders.filter((o) => o.temp === "CHILLED").map((o) => o.volumeM3))),
      capacity: round1(sum(avail.filter((v) => v.temp === "REEFER").map((v) => v.volumeCapM3 * 2))),
      unit: "m³",
    },
    {
      key: "van",
      label: "Van-only volume vs van capacity",
      demand: round1(
        sum(orders.filter((o) => lkOutlet.get(o.outletId)?.parkingConstraint === "VAN_ONLY").map((o) => o.volumeM3)),
      ),
      capacity: round1(sum(avail.filter((v) => v.type === "VAN").map((v) => v.volumeCapM3 * 2))),
      unit: "m³",
    },
    {
      key: "fleet",
      label: "Total volume vs fleet (2 trips)",
      demand: round1(demandVol),
      capacity: round1(sum(avail.map((v) => v.volumeCapM3 * 2))),
      unit: "m³",
    },
    {
      key: "vehicles",
      label: "Vehicles available of depot fleet",
      demand: avail.length,
      capacity: input.vehicles.length,
      unit: "vehicles",
    },
  ]

  const limitingResources = Object.entries(deferralsByReason)
    .sort((a, b) => b[1]! - a[1]!)
    .map(([r, n]) => `${DEFERRAL_REASON_META[r as DeferralReason].label} (${n})`)

  const util = trips.map((t) => {
    const v = vehicleMap.get(t.vehicleId)!
    return Math.max(t.weightKg / v.weightCapKg, t.volumeM3 / v.volumeCapM3)
  })

  return {
    orders: orders.length,
    served,
    deferred: orders.length - served,
    trips: trips.length,
    vehiclesUsed: new Set(trips.map((t) => t.vehicleId)).size,
    vehiclesAvailable: avail.length,
    servedVolumeM3: round1(servedVol),
    demandVolumeM3: round1(demandVol),
    coveragePct: orders.length ? Math.round((served / orders.length) * 100) : 100,
    avgUtilisationPct: util.length ? Math.round((sum(util) / util.length) * 100) : 0,
    deferralsByReason,
    resources,
    limitingResources,
  }
}

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>()
  for (const x of xs) {
    const k = key(x)
    const arr = m.get(k)
    if (arr) arr.push(x)
    else m.set(k, [x])
  }
  return m
}

const round1 = (x: number) => Math.round(x * 10) / 10
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
