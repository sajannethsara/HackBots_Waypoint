import type { Brand, DeferralReason, DockType, ParkingConstraint, Role } from "@waypoint/shared"

/** Response shapes of the Waypoint API (only the fields the UI reads). */

export interface Me {
  id: string
  email: string
  name: string
  role: Role
  depotId: string | null
  depot: { name: string } | null
  outletId: string | null
  outlet: { name: string; brand: Brand } | null
  vehicleId: string | null
}

export interface AppContext {
  operatingDate: string
  calendar: { isPayday: boolean; festival: string | null; festivalRamp: number; monsoon: boolean; dowName: string; isoWeek: number } | null
  depots: { id: string; name: string }[]
  defaultDepotId: string
}

export interface OutletLite {
  id: string
  name: string
  districtId: string
  dockType: DockType
  parkingConstraint: ParkingConstraint
  windowOpenMin?: number
  windowCloseMin?: number
  mallWindowOpenMin?: number | null
  mallWindowCloseMin?: number | null
  lastDeliveredOn?: string | null
}

export interface ResourceUsage {
  key: string
  label: string
  demand: number
  capacity: number
  unit: string
}

export interface PlanSummary {
  orders: number
  served: number
  deferred: number
  trips: number
  vehiclesUsed: number
  vehiclesAvailable: number
  servedVolumeM3: number
  demandVolumeM3: number
  coveragePct: number
  avgUtilisationPct: number
  deferralsByReason: Partial<Record<DeferralReason, number>>
  resources: ResourceUsage[]
  limitingResources: string[]
  edited?: boolean
}

export interface Vehicle {
  id: string
  type: "TRUCK" | "VAN"
  temp: "REEFER" | "AMBIENT"
  weightCapKg: number
  volumeCapM3: number
  kmPerL: number
  weeklyFuelQuotaL: number
  status: "AVAILABLE" | "IN_WORKSHOP"
  depotId: string
  driver?: { id: string; name: string } | null
}

export interface Stop {
  id: string
  seq: number
  orderId: string
  plannedArrivalMin: number
  plannedWaitMin: number
  plannedServiceMin: number
  atRisk: boolean
  riskReason: string | null
  status: string
  order: {
    id: string
    ref: string
    temp: "CHILLED" | "AMBIENT"
    units: number
    weightKg: number
    volumeM3: number
    deferCount: number
    outlet: OutletLite
  }
}

export interface Trip {
  id: string
  ref: string
  vehicleId: string
  vehicle: Vehicle
  tripNo: number
  brand: Brand
  districtId: string
  status: string
  plannedDepartMin: number
  plannedDurationMin: number
  plannedKm: number
  plannedFuelL: number
  loadWeightKg: number
  loadVolumeM3: number
  driver: { id: string; name: string } | null
  stops: Stop[]
}

export interface OrderLine {
  id: string
  description: string
  category: string
  quantity: number
  weightKg: number
  volumeM3: number
}

export interface Decision {
  id: string
  orderId: string
  decision: "SERVED" | "DEFERRED"
  source: "ENGINE" | "DISPATCHER"
  priorityScore: number
  scoreBreakdown: Record<string, number | boolean | null>
  reason: DeferralReason | null
  explanation: string | null
  consecutiveDefers: number
  note: string | null
  overriddenBy: { name: string } | null
  order: {
    id: string
    ref: string
    brand: Brand
    temp: "CHILLED" | "AMBIENT"
    units: number
    weightKg: number
    volumeM3: number
    deferCount: number
    outletId: string
    requestedDate: string
    outlet: OutletLite
    lines: OrderLine[]
    stops: { tripId: string }[]
  }
}

export interface Plan {
  id: string
  depotId: string
  date: string
  version: number
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED"
  engineVersion: string
  summary: PlanSummary
  generatedAt: string
  publishedAt: string | null
  publishedBy: { name: string } | null
  trips: Trip[]
  decisions: Decision[]
}

export interface DemandOverview {
  totalOrders: number
  byBrand: { key: string; orders: number; weightKg: number; volumeM3: number }[]
  byDistrict: { key: string; orders: number; weightKg: number; volumeM3: number }[]
  vanOnly: number
  fleet: { total: number; available: number; inWorkshop: number; reefersAvailable: number; reefersTotal: number; vansAvailable: number }
}

export interface OrderRow {
  id: string
  ref: string
  brand: Brand
  temp: "CHILLED" | "AMBIENT"
  units: number
  weightKg: number
  volumeM3: number
  deferCount: number
  status: string
  requestedDate: string
  deliveryDate: string
  outlet: OutletLite
  decision: { decision: string; reason: DeferralReason | null; explanation: string | null; priorityScore: number; source: string } | null
  stop: { seq: number; plannedArrivalMin: number; atRisk: boolean; trip: { id: string; ref: string; vehicleId: string } } | null
  state: "unassigned" | "assigned" | "deferred"
}

export interface OrdersResponse {
  plan: { id: string; status: string; version: number } | null
  counts: { all: number; unassigned: number; assigned: number; deferred: number }
  brandTotals: { brand: Brand; orders: number; chilled: number; assigned: number }[]
  orders: OrderRow[]
}

export interface Dashboard {
  plan: { id: string; status: string; version: number; publishedAt: string | null; summary: PlanSummary } | null
  kpis: {
    confirmedOrders: number
    chilledOrders: number
    planned: number
    coveragePct: number
    deferred: number
    openIssues: number
    vehiclesInUse: number
    vehiclesAvailable: number
    vehiclesTotal: number
  }
  deliveries: { planned: number; outForDelivery: number; delivered: number; deferred: number }
  byBrand: { brand: Brand; total: number; planned: number; deferred: number }[]
  actions: { kind: string; severity: "high" | "medium" | "low"; title: string; detail: string; count: number; href: string }[]
  trips: { id: string; ref: string; vehicleId: string; brand: Brand; districtId: string; status: string; driver: string | null; stops: number; done: number; eta: number; atRisk: boolean }[]
  upcoming: { time: number; outletId: string; orderRef: string; brand: Brand; tripRef: string; status: string; atRisk: boolean }[]
  activity: { id: string; action: string; at: string; actor: string; entityType: string; entityId: string; after: Record<string, unknown> | null }[]
}
