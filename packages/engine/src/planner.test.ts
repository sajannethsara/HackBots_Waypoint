import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { RULES } from "@waypoint/shared"
import { loadS1 } from "./data/s1"
import { planDay } from "./planner"
import { validateTrip, type Lookup } from "./trip"

/**
 * Feasibility invariants on the real peak-day scenario (Task 2B rules 1–7).
 * Passing means the plan is valid, not that it is optimal.
 */
const { scenario: _s, ...input } = loadS1(join(__dirname, "../../../data"))
const result = planDay(input)
const lk: Lookup = {
  outlet: new Map(input.outlets.map((o) => [o.id, o])),
  district: new Map(input.districts.map((d) => [d.id, d])),
  serviceAllowance: input.serviceAllowance,
}
const byId = new Map(input.orders.map((o) => [o.id, o]))
const vehicles = new Map(input.vehicles.map((v) => [v.id, v]))

describe("planDay on scenario S1", () => {
  it("decides every order exactly once", () => {
    expect(result.decisions).toHaveLength(input.orders.length)
    const served = result.trips.flatMap((t) => t.stops.map((s) => s.orderId))
    expect(new Set(served).size).toBe(served.length)
    expect(served.length).toBe(result.decisions.filter((d) => d.decision === "SERVED").length)
  })

  it("only uses available vehicles, at most two trips each", () => {
    const perVehicle = new Map<string, number>()
    for (const t of result.trips) {
      expect(vehicles.get(t.vehicleId)?.available).toBe(true)
      perVehicle.set(t.vehicleId, (perVehicle.get(t.vehicleId) ?? 0) + 1)
    }
    for (const n of perVehicle.values()) expect(n).toBeLessThanOrEqual(RULES.maxTripsPerVehicle)
  })

  it("every trip passes brand/district, temperature, access, capacity, time, fuel and window rules", () => {
    for (const t of result.trips) {
      const violations = validateTrip(lk, {
        vehicle: vehicles.get(t.vehicleId)!,
        brand: t.brand,
        districtId: t.districtId,
        orders: t.stops.map((s) => byId.get(s.orderId)!),
      }, false)
      expect(violations, `${t.vehicleId} trip ${t.tripNo}`).toEqual([])
    }
  })

  it("respects the Fresh and Style+Tech daily budgets per vehicle", () => {
    const used = new Map<string, number>()
    for (const t of result.trips) {
      const key = `${t.vehicleId}|${t.brand === "FRESH" ? "F" : "ST"}`
      used.set(key, (used.get(key) ?? 0) + t.durationMin)
    }
    for (const [key, min] of used)
      expect(min).toBeLessThanOrEqual(key.endsWith("|F") ? RULES.freshBudgetMin : RULES.styleTechBudgetMin)
  })

  it("explains every deferral", () => {
    for (const d of result.decisions.filter((d) => d.decision === "DEFERRED")) {
      expect(d.reason).toBeTruthy()
      expect(d.explanation?.length).toBeGreaterThan(10)
    }
  })

  it("never defers a higher-priority order in favour of a lower one in the same group", () => {
    const served = new Set(result.trips.flatMap((t) => t.stops.map((s) => s.orderId)))
    for (const d of result.decisions.filter((x) => x.decision === "DEFERRED" && !x.unavoidable)) {
      const o = byId.get(d.orderId)!
      // a trade-off is only allowed when the deferred order is bigger than what rode instead
      const rode = result.decisions.filter((x) => served.has(x.orderId) && byId.get(x.orderId)!.districtId === o.districtId && x.priorityScore < d.priorityScore)
      for (const r of rode) expect(byId.get(r.orderId)!.volumeM3).toBeLessThan(o.volumeM3)
    }
  })

  it("serves most of the day", () => {
    expect(result.summary.coveragePct).toBeGreaterThanOrEqual(75)
  })
})
