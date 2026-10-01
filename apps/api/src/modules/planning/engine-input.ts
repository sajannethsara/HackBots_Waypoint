import type { Outlet, Prisma, Vehicle } from "@waypoint/db"
import type { EngineDistrict, EngineOrder, EngineOutlet, EngineVehicle, Lookup } from "@waypoint/engine"
import { daysBetween, toDateOnly } from "@waypoint/shared"
import type { PrismaService } from "../../common/prisma.service"

/** Maps DB rows to the engine's plain-data contract. */

export function toEngineOutlet(o: Outlet): EngineOutlet {
  return {
    id: o.id,
    brand: o.brand,
    districtId: o.districtId,
    dockType: o.dockType,
    parkingConstraint: o.parkingConstraint,
    windowOpenMin: o.windowOpenMin,
    windowCloseMin: o.windowCloseMin,
    mallWindowOpenMin: o.mallWindowOpenMin,
    mallWindowCloseMin: o.mallWindowCloseMin,
  }
}

export function toEngineOrder(
  o: Prisma.OrderGetPayload<{ include: { outlet: true } }>,
  date: string,
): EngineOrder {
  const last = o.outlet.lastDeliveredOn ? toDateOnly(o.outlet.lastDeliveredOn) : null
  return {
    id: o.id,
    ref: o.ref,
    outletId: o.outletId,
    brand: o.brand,
    districtId: o.outlet.districtId,
    temp: o.temp,
    units: o.units,
    weightKg: o.weightKg,
    volumeM3: o.volumeM3,
    deferCount: o.deferCount,
    daysSinceLastServed: last ? Math.max(1, daysBetween(last, date)) : 1,
  }
}

export function toEngineVehicle(v: Vehicle, fuelUsedL: number): EngineVehicle {
  return {
    id: v.id,
    type: v.type,
    temp: v.temp,
    weightCapKg: v.weightCapKg,
    volumeCapM3: v.volumeCapM3,
    kmPerL: v.kmPerL,
    fuelRemainingL: Math.max(0, v.weeklyFuelQuotaL - fuelUsedL),
    available: v.status === "AVAILABLE",
  }
}

/** Everything static the engine needs for a depot: outlets, districts, allowances, fleet + fuel. */
export async function loadDepotContext(db: PrismaService, depotId: string, isoYear: number, isoWeek: number, excludePlanId?: string) {
  const [outlets, districts, allowances, vehicles, fuel] = await Promise.all([
    db.outlet.findMany({ where: { depotId } }),
    db.district.findMany({ where: { depotId } }),
    db.serviceAllowance.findMany(),
    db.vehicle.findMany({ where: { depotId }, orderBy: { id: "asc" } }),
    db.fuelLedgerEntry.groupBy({
      by: ["vehicleId"],
      where: {
        isoYear,
        isoWeek,
        vehicle: { depotId },
        // a draft's own planned litres must not count against itself
        ...(excludePlanId ? { NOT: { trip: { planId: excludePlanId } } } : {}),
      },
      _sum: { litres: true },
    }),
  ])
  const used = new Map(fuel.map((f) => [f.vehicleId, f._sum.litres ?? 0]))
  const engineDistricts: EngineDistrict[] = districts.map((d) => ({
    id: d.id,
    depotToDistrictKm: d.depotToDistrictKm,
    depotToDistrictMin: d.depotToDistrictMin,
    interStopKm: d.interStopKm,
    interStopMin: d.interStopMin,
  }))
  const engineOutlets = outlets.map(toEngineOutlet)
  const serviceAllowance = Object.fromEntries(allowances.map((a) => [`${a.brand}:${a.dockType}`, a.minutes]))
  const engineVehicles = vehicles.map((v) => toEngineVehicle(v, used.get(v.id) ?? 0))
  const lookup: Lookup = {
    outlet: new Map(engineOutlets.map((o) => [o.id, o])),
    district: new Map(engineDistricts.map((d) => [d.id, d])),
    serviceAllowance,
  }
  return { outlets: engineOutlets, districts: engineDistricts, serviceAllowance, vehicles: engineVehicles, lookup }
}
