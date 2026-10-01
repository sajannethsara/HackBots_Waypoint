import type { PrismaClient } from "@prisma/client"
import { depotId, hhmmToMin, parseWindow, toEnum } from "@waypoint/shared"
import { readCsv, rng } from "./csv"

/** Our enrichment for the map (district centroids). Documented in docs/data-model.md. */
const CENTROIDS: Record<string, [number, number]> = {
  Colombo: [6.9271, 79.8612],
  Gampaha: [7.0873, 79.999],
  Kalutara: [6.5854, 79.9607],
  Galle: [6.0535, 80.221],
  Matara: [5.9549, 80.555],
  Kurunegala: [7.4863, 80.3623],
  Puttalam: [8.0362, 79.8283],
  Kandy: [7.2906, 80.6337],
  Matale: [7.4675, 80.6234],
  "Nuwara Eliya": [6.9497, 80.7891],
  Badulla: [6.9934, 81.055],
  Kegalle: [7.2513, 80.3464],
}

/**
 * Where outlets cluster on the map: an inland anchor per district and a spread in degrees.
 * Coastal districts only spread east (`eastOnly`) so no outlet lands in the sea.
 */
const OUTLET_ANCHORS: Record<string, { lat: number; lng: number; spread: number; eastOnly?: boolean }> = {
  Colombo: { lat: 6.885, lng: 79.875, spread: 0.035, eastOnly: true },
  Gampaha: { lat: 7.07, lng: 79.99, spread: 0.06 },
  Kalutara: { lat: 6.6, lng: 79.975, spread: 0.05, eastOnly: true },
  Galle: { lat: 6.06, lng: 80.23, spread: 0.04, eastOnly: true },
  Matara: { lat: 5.96, lng: 80.56, spread: 0.035, eastOnly: true },
  Kurunegala: { lat: 7.48, lng: 80.36, spread: 0.06 },
  Puttalam: { lat: 8.02, lng: 79.86, spread: 0.04, eastOnly: true },
  Kandy: { lat: 7.29, lng: 80.635, spread: 0.035 },
  Matale: { lat: 7.465, lng: 80.625, spread: 0.04 },
  "Nuwara Eliya": { lat: 6.955, lng: 80.78, spread: 0.04 },
  Badulla: { lat: 6.99, lng: 81.055, spread: 0.04 },
  Kegalle: { lat: 7.25, lng: 80.345, spread: 0.04 },
}

export function outletPoint(outletId: string, district: string) {
  const a = OUTLET_ANCHORS[district] ?? { lat: 7.0, lng: 80.0, spread: 0.05 }
  const r = rng(`geo-${outletId}`)
  const dLat = (r() * 2 - 1) * a.spread
  const dLngRaw = (r() * 2 - 1) * a.spread
  const dLng = a.eastOnly ? Math.abs(dLngRaw) : dLngRaw
  return { lat: +(a.lat + dLat).toFixed(5), lng: +(a.lng + dLng).toFixed(5) }
}

export async function seedReference(db: PrismaClient, workshop: Set<string>) {
  await db.depot.createMany({
    data: [
      { id: "PELIYAGODA", name: "Peliyagoda DC", lat: 6.9608, lng: 79.8836 },
      { id: "KANDY", name: "Kandy Hub", lat: 7.2985, lng: 80.6125 },
    ],
  })

  await db.district.createMany({
    data: readCsv("General Data/district_travel.csv").map((r) => ({
      id: r.district,
      depotId: depotId(r.depot),
      roadClass: toEnum(r.road_class),
      freeFlowKmh: +r.free_flow_kmh,
      depotToDistrictKm: +r.depot_to_district_km,
      depotToDistrictMin: +r.depot_to_district_freeflow_min,
      interStopKm: +r.inter_stop_km,
      interStopMin: +r.inter_stop_freeflow_min,
      centroidLat: CENTROIDS[r.district]?.[0],
      centroidLng: CENTROIDS[r.district]?.[1],
    })),
  })

  await db.outlet.createMany({
    data: readCsv("General Data/outlets.csv").map((r) => {
      const mall = parseWindow(r.mall_window)
      const brand = toEnum<"FRESH" | "STYLE" | "TECH">(r.brand)
      return {
        id: r.outlet_id,
        name: `Waypoint ${r.brand} ${r.district} ${r.outlet_id.slice(3)}`,
        brand,
        districtId: r.district,
        depotId: depotId(r.depot),
        dockType: toEnum(r.dock_type),
        parkingConstraint: toEnum(r.parking_constraint),
        mallWindowOpenMin: mall?.[0],
        mallWindowCloseMin: mall?.[1],
        windowOpenMin: hhmmToMin(r.window_open_time),
        windowCloseMin: hhmmToMin(r.window_close_time),
        ...outletPoint(r.outlet_id, r.district),
      }
    }),
  })

  await db.vehicle.createMany({
    data: readCsv("General Data/vehicles.csv").map((r) => ({
      id: r.vehicle_id,
      type: toEnum(r.type),
      temp: toEnum(r.temp),
      weightCapKg: +r.weight_cap_kg,
      volumeCapM3: +r.volume_cap_m3,
      fuelType: r.fuel_type,
      kmPerL: +r.km_per_l,
      weeklyFuelQuotaL: +r.weekly_fuel_quota_l,
      depotId: depotId(r.depot),
      status: workshop.has(r.vehicle_id) ? "IN_WORKSHOP" : "AVAILABLE",
    })),
  })

  await db.serviceAllowance.createMany({
    data: readCsv("General Data/service_allowance.csv").map((r) => ({
      brand: toEnum(r.brand),
      dockType: toEnum(r.dock_type),
      minutes: +r.service_allowance_min,
    })),
  })

  await db.calendarDay.createMany({
    data: readCsv("General Data/calendar.csv").map((r) => ({
      date: new Date(`${r.date}T00:00:00Z`),
      dow: +r.dow,
      dowName: r.dow_name,
      isWeekend: r.is_weekend === "1",
      isoYear: +r.iso_year,
      isoWeek: +r.iso_week,
      isPayday: r.is_payday === "1",
      festival: r.festival || null,
      festivalRamp: +r.festival_ramp,
      isHoliday: r.is_holiday === "1",
      monsoon: r.monsoon === "1",
      isOperating: r.is_operating === "1",
    })),
  })

  await db.trafficSpeed.createMany({
    data: readCsv("General Data/traffic_speed.csv").map((r) => ({
      districtId: r.district,
      hour: +r.hour,
      monsoon: r.monsoon === "1",
      speedIndex: +r.speed_index,
    })),
  })

  await db.roadCondition.createMany({
    data: readCsv("General Data/road_conditions.csv").map((r) => ({
      districtId: r.district,
      date: new Date(`${r.date}T00:00:00Z`),
      disruptionIndex: +r.disruption_index,
    })),
  })
}
