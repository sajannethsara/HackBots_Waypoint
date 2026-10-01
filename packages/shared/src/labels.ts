import type { Brand, DeferralReason, DockType, ParkingConstraint, Role } from "./constants"

export const BRAND_LABEL: Record<Brand, string> = {
  FRESH: "Fresh",
  STYLE: "Style",
  TECH: "Tech",
}

export const ROLE_LABEL: Record<Role, string> = {
  DISPATCHER: "Dispatcher",
  LOADER: "Loader",
  DRIVER: "Driver",
  STORE_MANAGER: "Store manager",
}

export const DOCK_LABEL: Record<DockType, string> = {
  REAR_DOCK: "Rear dock",
  STREET: "Street",
  MALL_BAY: "Mall bay",
}

export const PARKING_LABEL: Record<ParkingConstraint, string> = {
  NORMAL: "Normal",
  VAN_ONLY: "Van only",
  MALL_DOCK: "Mall dock",
}

export const DEFERRAL_REASON_META: Record<DeferralReason, { label: string; hint: string }> = {
  REEFER_CAPACITY: { label: "Refrigerated capacity", hint: "No reefer available" },
  VEHICLE_CAPACITY: { label: "Vehicle capacity", hint: "Exceeds weight / volume" },
  FUEL_QUOTA: { label: "Fuel constraint", hint: "Vehicle weekly quota exceeded" },
  DELIVERY_WINDOW: { label: "Delivery window", hint: "Cannot meet outlet window" },
  ACCESS_RESTRICTION: { label: "Access restriction", hint: "Van only / outlet access" },
  VEHICLE_UNAVAILABLE: { label: "Vehicle unavailable", hint: "Breakdown / workshop" },
  LOADING_SHORTFALL: { label: "Loading shortfall", hint: "Items missing / damaged" },
  TIME_BUDGET: { label: "Time budget", hint: "Trip exceeds daily budget" },
  LOWER_PRIORITY: { label: "Lower priority", hint: "Capacity given to higher priority" },
  OTHER: { label: "Other", hint: "Specify reason" },
}

export const DEPOT_LABEL: Record<string, string> = {
  PELIYAGODA: "Peliyagoda DC",
  KANDY: "Kandy Hub",
}
