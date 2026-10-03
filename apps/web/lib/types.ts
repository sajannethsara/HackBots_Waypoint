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
  lat?: number | null
  lng?: number | null
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
  loader: { id: string; name: string } | null
  /** Depot gate */
  driverClaimedAt: string | null
  loaderClaimedAt: string | null
  heldAt: string | null
  liveAt: string | null
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

/** Server-side timing + rule check of a trip in the dispatcher's sequence (nothing saved). */
export interface TripPreview {
  tripId: string
  departMin: number
  endMin: number
  durationMin: number
  km: number
  fuelL: number
  loadWeightKg: number
  loadVolumeM3: number
  vehicleUsedMin: number
  budgetMin: number
  vehicleFuelL: number
  stops: {
    orderId: string
    seq: number
    arrivalMin: number
    waitMin: number
    serviceMin: number
    windowOpenMin: number
    windowCloseMin: number
    atRisk: boolean
    riskReason: string | null
  }[]
  violations: { rule: string; message: string }[]
}

export interface Plan {
  id: string
  depotId: string
  depot: { id: string; name: string; lat: number | null; lng: number | null }
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

// ── Resource detail pages (vehicles, outlets, orders) ──

export interface IssueChip {
  id: string
  ref: string
  type: IssueType
  severity: IssueSeverity
  status: IssueStatus
  createdAt: string
  tripId: string | null
}

export interface VehicleTripRow {
  id: string
  ref: string
  tripNo: number
  date: string
  brand: Brand
  districtId: string
  status: string
  driver: string | null
  stops: number
  openIssues: number
  plannedDepartMin: number
  plannedDurationMin: number
  plannedKm: number
  plannedFuelL: number
  utilPct: number
}

export interface VehicleDetail {
  vehicle: Vehicle & {
    fuelType: string
    depot: { id: string; name: string }
    driver: { id: string; name: string; phone: string | null; email: string } | null
  }
  operatingDate: string
  stats: { trips: number; completedTrips: number; activeDays: number; stops: number; km: number; fuelL: number; avgUtilPct: number | null; openIssues: number }
  fuelWeek: { isoYear: number; isoWeek: number; litres: number; km: number; quotaL: number } | null
  history: VehicleTripRow[]
  issues: IssueChip[]
}

export interface OutletTodayStop {
  orderId: string
  orderRef: string
  status: string
  units: number
  deferCount: number
  trip: { id: string; ref: string; vehicleId: string } | null
  stopSeq: number | null
  plannedArrivalMin: number | null
}

export interface OutletOverviewRow {
  id: string
  name: string
  brand: Brand
  districtId: string
  windowOpenMin: number
  windowCloseMin: number
  parkingConstraint: ParkingConstraint
  lastDeliveredOn: string | null
  openIssues: number
  today: OutletTodayStop | null
}

export interface OutletOrderRow {
  id: string
  ref: string
  brand: Brand
  temp: "CHILLED" | "AMBIENT"
  status: string
  units: number
  weightKg: number
  volumeM3: number
  deferCount: number
  requestedDate: string
  deliveryDate: string
  receipt: { status: string } | null
  stop: { seq: number; status: string; plannedArrivalMin: number; trip: { id: string; ref: string; vehicleId: string } } | null
}

export interface OutletDetail {
  outlet: OutletLite & {
    brand: Brand
    lat: number | null
    lng: number | null
    depotId: string
    depot: { id: string; name: string }
    district: { id: string }
    managers: { id: string; name: string; phone: string | null; email: string }[]
    windowOpenMin: number
    windowCloseMin: number
  }
  stats: { orders: number; units: number; weightKg: number; delivered: number; refused: number; deferrals: number; openIssues: number }
  orders: OutletOrderRow[]
  issues: IssueChip[]
}

export interface OrderDetail {
  id: string
  ref: string
  brand: Brand
  temp: "CHILLED" | "AMBIENT"
  status: string
  units: number
  weightKg: number
  volumeM3: number
  deferCount: number
  requestedDate: string
  deliveryDate: string
  submittedAt: string
  notes: string | null
  createdBy: { name: string }
  depot: { id: string; name: string }
  outlet: OutletLite & {
    brand: Brand
    dockType: DockType
    parkingConstraint: ParkingConstraint
    lastDeliveredOn: string | null
    managers: { id: string; name: string; phone: string | null }[]
  }
  lines: OrderLine[]
  decisions: {
    id: string
    decision: "SERVED" | "DEFERRED"
    source: string
    priorityScore: number
    scoreBreakdown: Record<string, unknown>
    reason: DeferralReason | null
    explanation: string | null
    note: string | null
    createdAt: string
    plan: { version: number; status: string; date: string }
    overriddenBy: { name: string } | null
  }[]
  stops: {
    id: string
    seq: number
    status: string
    plannedArrivalMin: number
    etaMin: number | null
    atRisk: boolean
    riskReason: string | null
    completedAt: string | null
    proof: { recipientName: string | null; capturedAt: string } | null
    trip: {
      id: string
      ref: string
      vehicleId: string
      status: string
      plannedDepartMin: number
      driver: { name: string; phone: string | null } | null
      plan: { status: string; version: number; date: string; depotId: string }
    }
  }[]
  receipt: { status: string; notes: string | null; confirmedAt: string; confirmedBy: { name: string } } | null
  issues: IssueChip[]
  audit: { id: string; action: string; at: string; actor: string; entityType: string; after: unknown }[]
}

/** Everything that needs the dispatcher's attention for a depot and day. */
export interface ExceptionsOverview {
  plan: { id: string; status: "DRAFT" | "PUBLISHED"; version: number } | null
  clockMinute: number
  counts: { deferred: number; atRisk: number; gate: number; deliveries: number; issues: number; fleet: number }
  deferred: {
    orderId: string
    ref: string
    outlet: { id: string; name: string; districtId: string }
    brand: Brand
    temp: "CHILLED" | "AMBIENT"
    weightKg: number
    volumeM3: number
    deferCount: number
    priorityScore: number
    reason: DeferralReason | null
    source: "ENGINE" | "DISPATCHER"
    unavoidable: boolean
    explanation: string | null
    by: string | null
  }[]
  atRisk: {
    stopId: string
    seq: number
    tripId: string
    tripRef: string
    vehicleId: string
    brand: Brand
    live: boolean
    orderId: string
    orderRef: string
    outlet: { id: string; name: string; districtId: string }
    arrivalMin: number
    windowCloseMin: number
    reason: string | null
  }[]
  gate: {
    tripId: string
    ref: string
    vehicleId: string
    brand: Brand
    districtId: string
    stops: number
    departMin: number
    overdue: boolean
    held: boolean
    driver: string | null
    driverClaimedAt: string | null
    loader: string | null
    loaderClaimedAt: string | null
  }[]
  deliveries: {
    stopId: string
    status: "PARTIAL" | "REFUSED"
    at: string | null
    tripId: string
    tripRef: string
    driver: string | null
    orderId: string
    orderRef: string
    outlet: { id: string; name: string; districtId: string }
    refusedQty: number
    reason: string | null
    receivedBy: string | null
  }[]
  issues: {
    id: string
    ref: string
    type: IssueType
    severity: IssueSeverity
    status: IssueStatus
    description: string
    createdAt: string
    tripRef: string | null
    outletId: string | null
    orderRef: string | null
  }[]
  fleet: { id: string; type: "TRUCK" | "VAN"; temp: "REEFER" | "AMBIENT"; kind: "WORKSHOP" | "FUEL"; usedL: number; quotaL: number }[]
}
