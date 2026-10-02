import type {
  Brand,
  DeferralReason,
  DockType,
  IssuePlaybookAction,
  IssueSeverity,
  IssueStage,
  IssueStatus,
  IssueType,
  LiveAlert,
  LiveClock,
  LiveRoute,
  LiveTrip,
  LiveTripStatus,
  ParkingConstraint,
  Role,
} from "@waypoint/shared"

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

// ── Trips ─────────────────────────────────────────────────


export interface TripRow {
  id: string
  ref: string
  tripNo: number
  brand: Brand
  districtId: string
  vehicleId: string
  vehicleType: "TRUCK" | "VAN"
  vehicleTemp: "REEFER" | "AMBIENT"
  driver: string | null
  stops: number
  openIssues: number
  plannedDepartMin: number
  plannedDurationMin: number
  plannedKm: number
  plannedFuelL: number
  loadWeightKg: number
  loadVolumeM3: number
  utilPct: number
  live: {
    status: LiveTripStatus
    delayMin: number
    progressPct: number
    stopsDone: number
    locationLabel: string
    etaReturnMin: number
    nextStop: { outletId: string; etaMin: number } | null
  } | null
}

export interface TripsResponse {
  plan: { id: string; version: number; status: string; publishedAt: string | null } | null
  clock: LiveClock | null
  trips: TripRow[]
}

export interface IssueRow {
  id: string
  ref: string
  clientId: string | null
  stage: IssueStage
  type: IssueType
  severity: IssueSeverity
  status: IssueStatus
  description: string
  quantity: number | null
  tripId: string | null
  stopId: string | null
  orderId: string | null
  outletId: string | null
  vehicleId: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  reportedBy: { name: string; role: string }
  resolvedBy: { name: string } | null
  trip: { id: string; ref: string; vehicleId: string; brand: Brand; districtId: string } | null
  stop: { seq: number } | null
  order: { id: string; ref: string } | null
  outlet: { id: string; name: string; districtId: string } | null
}

export interface IssuesResponse {
  issues: IssueRow[]
  counts: { open: number; acknowledged: number; resolved: number; highOpen: number; all: number }
}

export interface IssueDetail extends Omit<IssueRow, "trip" | "stop" | "order" | "outlet" | "reportedBy"> {
  reportedBy: { name: string; role: string; phone: string | null; email: string }
  trip: {
    id: string
    ref: string
    vehicleId: string
    brand: Brand
    districtId: string
    status: string
    plannedDepartMin: number
    driver: { name: string; phone: string | null } | null
    plan: { version: number; status: string; date: string }
  } | null
  stop: { seq: number; plannedArrivalMin: number; status: string } | null
  order: { id: string; ref: string; temp: "CHILLED" | "AMBIENT"; units: number; weightKg: number; volumeM3: number; lines: OrderLine[] } | null
  orderLine: OrderLine | null
  outlet: { id: string; name: string; districtId: string; windowOpenMin: number; windowCloseMin: number; managers: { name: string; phone: string | null }[] } | null
  vehicle: { id: string; type: string; temp: string; status: string } | null
  history: { id: string; action: string; createdAt: string; actor: { name: string } | null; after: Record<string, unknown> | null }[]
  playbook: IssuePlaybookAction[]
}

export interface AuditEntry {
  id: string
  action: string
  at: string
  actor: string
  entityType: string
  entityId: string
  after: Record<string, unknown> | null
}

export interface TripDetailStop {
  id: string
  seq: number
  status: string
  plannedArrivalMin: number
  plannedWaitMin: number
  plannedServiceMin: number
  atRisk: boolean
  riskReason: string | null
  arrivedAt: string | null
  completedAt: string | null
  proof: { recipientName: string; capturedAt: string } | null
  order: {
    id: string
    ref: string
    brand: Brand
    temp: "CHILLED" | "AMBIENT"
    units: number
    weightKg: number
    volumeM3: number
    deferCount: number
    status: string
    outlet: OutletLite & { name: string; lat: number | null; lng: number | null }
    lines: OrderLine[]
    receipt: { status: string; confirmedAt: string } | null
    decisions: { priorityScore: number; scoreBreakdown: Record<string, unknown>; source: string; explanation: string | null }[]
  }
}

export interface TripDetail {
  route: LiveRoute | null
  trip: {
    id: string
    ref: string
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
    loadedAt: string | null
    departedAt: string | null
    completedAt: string | null
    plan: { id: string; version: number; status: string; date: string; depotId: string; publishedAt: string | null; generatedAt: string; engineVersion: string; publishedBy: { name: string } | null }
    vehicle: Vehicle
    driver: { id: string; name: string; phone: string | null; email: string } | null
    loadedBy: { name: string } | null
    district: { id: string; depotToDistrictKm: number; depotToDistrictMin: number; interStopKm: number; interStopMin: number; roadClass: string }
    stops: TripDetailStop[]
    deliveryEvents: { id: string; type: string; occurredAt: string }[]
  }
  depot: { id: string; name: string; position: { lat: number; lng: number } }
  sibling: { id: string; ref: string; tripNo: number; brand: Brand; districtId: string; plannedDepartMin: number; plannedDurationMin: number; plannedFuelL: number } | null
  fuelUsedThisWeekL: number | null
  live: LiveTrip | null
  clock: LiveClock | null
  alerts: LiveAlert[]
  issues: (Omit<IssueRow, "trip" | "order" | "outlet"> & { stop: { seq: number } | null })[]
  audit: AuditEntry[]
}
