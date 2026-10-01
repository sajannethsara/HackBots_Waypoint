import type {
  Brand,
  DeferralReason,
  DockType,
  ParkingConstraint,
  TempRequirement,
  VehicleTemp,
  VehicleType,
} from "@waypoint/shared"

/** Everything the engine needs, as plain data. Callers map from DB rows or CSVs. */

export interface EngineOrder {
  id: string
  ref: string
  outletId: string
  brand: Brand
  districtId: string
  temp: TempRequirement
  units: number
  weightKg: number
  volumeM3: number
  /** How many runs this order has already been pushed. 1+ means "deferred yesterday". */
  deferCount: number
  daysSinceLastServed: number
}

export interface EngineOutlet {
  id: string
  brand: Brand
  districtId: string
  dockType: DockType
  parkingConstraint: ParkingConstraint
  windowOpenMin: number
  windowCloseMin: number
  mallWindowOpenMin?: number | null
  mallWindowCloseMin?: number | null
}

export interface EngineVehicle {
  id: string
  type: VehicleType
  temp: VehicleTemp
  weightCapKg: number
  volumeCapM3: number
  kmPerL: number
  /** Weekly quota minus what has already been used this ISO week. */
  fuelRemainingL: number
  available: boolean
}

export interface EngineDistrict {
  id: string
  depotToDistrictKm: number
  depotToDistrictMin: number
  interStopKm: number
  interStopMin: number
}

export interface DayContext {
  festivalRamp: number
  isPayday: boolean
  monsoon: boolean
}

export interface PlanOptions {
  /** true: an order that cannot arrive inside its window is deferred. false: it is kept and flagged at risk. */
  enforceWindows: boolean
  maxStopsPerTrip: number
  /** Keep reefers for chilled loads instead of topping them up with ambient orders. */
  reeferChilledOnly: boolean
}

export interface PlanInput {
  orders: EngineOrder[]
  outlets: EngineOutlet[]
  vehicles: EngineVehicle[]
  districts: EngineDistrict[]
  /** key `${brand}:${dockType}` -> minutes */
  serviceAllowance: Record<string, number>
  context: DayContext
  options?: Partial<PlanOptions>
}

export interface PlannedStop {
  orderId: string
  seq: number
  arrivalMin: number
  waitMin: number
  serviceMin: number
  windowOpenMin: number
  windowCloseMin: number
  atRisk: boolean
  riskReason?: string
}

export interface PlannedTrip {
  vehicleId: string
  tripNo: number
  brand: Brand
  districtId: string
  departMin: number
  /** Task 2B formula: outbound + inter-stop + handling (no return leg). */
  durationMin: number
  /** Includes the return leg, used to chain a vehicle's second trip. */
  endMin: number
  km: number
  fuelL: number
  weightKg: number
  volumeM3: number
  stops: PlannedStop[]
}

export interface ScoreBreakdown {
  [factor: string]: number
}

export interface OrderDecision {
  orderId: string
  decision: "SERVED" | "DEFERRED"
  priorityScore: number
  scoreBreakdown: ScoreBreakdown
  reason?: DeferralReason
  explanation?: string
  /** true when no allocation could have served it; false when it lost to higher-priority orders. */
  unavoidable?: boolean
  vehicleId?: string
  tripNo?: number
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
}

export interface PlanResult {
  trips: PlannedTrip[]
  decisions: OrderDecision[]
  summary: PlanSummary
}

export interface Violation {
  rule: string
  message: string
}
