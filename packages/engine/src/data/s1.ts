/** Loads Datathon scenario S1 (Task 2B) from the competition CSVs into engine input. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { hhmmToMin, parseCsv, parseWindow, toEnum, type Brand } from "@waypoint/shared"
import type { EngineDistrict, EngineOrder, EngineOutlet, EngineVehicle, PlanInput } from "../types"

export function loadS1(dataDir: string): PlanInput & { scenario: Record<string, string>[] } {
  const read = (p: string) => parseCsv(readFileSync(join(dataDir, p), "utf8"))
  const scenario = read("Test Data/task2b_peak_day_scenarios.csv")
  const fleet = new Map(read("Test Data/task2b_peak_day_fleet.csv").map((r) => [r.vehicle_id, r.status]))
  const depot = scenario[0].depot

  const outlets: EngineOutlet[] = read("General Data/outlets.csv").map((r) => {
    const mall = parseWindow(r.mall_window)
    return {
      id: r.outlet_id,
      brand: toEnum<Brand>(r.brand),
      districtId: r.district,
      dockType: toEnum(r.dock_type),
      parkingConstraint: toEnum(r.parking_constraint),
      windowOpenMin: hhmmToMin(r.window_open_time),
      windowCloseMin: hhmmToMin(r.window_close_time),
      mallWindowOpenMin: mall?.[0],
      mallWindowCloseMin: mall?.[1],
    }
  })

  const vehicles: EngineVehicle[] = read("General Data/vehicles.csv")
    .filter((r) => r.depot === depot && fleet.has(r.vehicle_id))
    .map((r) => ({
      id: r.vehicle_id,
      type: toEnum(r.type),
      temp: toEnum(r.temp),
      weightCapKg: +r.weight_cap_kg,
      volumeCapM3: +r.volume_cap_m3,
      kmPerL: +r.km_per_l,
      fuelRemainingL: +r.weekly_fuel_quota_l,
      available: fleet.get(r.vehicle_id) === "available",
    }))

  const districts: EngineDistrict[] = read("General Data/district_travel.csv").map((r) => ({
    id: r.district,
    depotToDistrictKm: +r.depot_to_district_km,
    depotToDistrictMin: +r.depot_to_district_freeflow_min,
    interStopKm: +r.inter_stop_km,
    interStopMin: +r.inter_stop_freeflow_min,
  }))

  const serviceAllowance = Object.fromEntries(
    read("General Data/service_allowance.csv").map((r) => [
      `${toEnum(r.brand)}:${toEnum(r.dock_type)}`,
      +r.service_allowance_min,
    ]),
  )

  const orders: EngineOrder[] = scenario.map((r) => ({
    id: r.order_ref,
    ref: r.order_ref,
    outletId: r.outlet_id,
    brand: toEnum<Brand>(r.brand),
    districtId: r.district,
    temp: toEnum(r.temp_requirement),
    units: +r.order_units,
    weightKg: +r.order_weight_kg,
    volumeM3: +r.order_volume_m3,
    deferCount: +r.deferred_yesterday,
    daysSinceLastServed: +r.days_since_last_served,
  }))


  return {
    scenario,
    orders,
    outlets,
    vehicles,
    districts,
    serviceAllowance,
    context: { festivalRamp: 0.3, isPayday: false, monsoon: false },
  }
}
