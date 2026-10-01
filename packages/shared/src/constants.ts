/** Operating rules from the challenge brief. Single source of truth for API, engine and UI. */

export const BRANDS = ["FRESH", "STYLE", "TECH"] as const
export type Brand = (typeof BRANDS)[number]

export const ROLES = ["DISPATCHER", "LOADER", "DRIVER", "STORE_MANAGER"] as const
export type Role = (typeof ROLES)[number]

export const DOCK_TYPES = ["REAR_DOCK", "STREET", "MALL_BAY"] as const
export type DockType = (typeof DOCK_TYPES)[number]

export const PARKING = ["NORMAL", "VAN_ONLY", "MALL_DOCK"] as const
export type ParkingConstraint = (typeof PARKING)[number]

export type VehicleType = "TRUCK" | "VAN"
export type VehicleTemp = "REEFER" | "AMBIENT"
export type TempRequirement = "CHILLED" | "AMBIENT"

export const DEFERRAL_REASONS = [
  "REEFER_CAPACITY",
  "VEHICLE_CAPACITY",
  "FUEL_QUOTA",
  "DELIVERY_WINDOW",
  "ACCESS_RESTRICTION",
  "VEHICLE_UNAVAILABLE",
  "LOADING_SHORTFALL",
  "TIME_BUDGET",
  "LOWER_PRIORITY",
  "OTHER",
] as const
export type DeferralReason = (typeof DEFERRAL_REASONS)[number]

export const RULES = {
  /** Orders for the next run close at 16:00 the day before. */
  orderCutoffMin: 16 * 60,
  maxTripsPerVehicle: 2,
  /** Fresh trips run 03:30 → 08:00 with a 270-minute budget per vehicle. */
  freshStartMin: 3 * 60 + 30,
  freshBudgetMin: 270,
  /** Style + Tech share a 480-minute trading-day budget per vehicle. */
  tradingStartMin: 8 * 60,
  styleTechBudgetMin: 480,
  operatingDays: "Mon–Sat",
} as const

export const DEPOTS = ["PELIYAGODA", "KANDY"] as const
export type DepotId = (typeof DEPOTS)[number]
