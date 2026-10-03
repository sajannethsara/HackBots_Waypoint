"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type {
  AssignOrderInput,
  CreateIssueInput,
  CreateTripInput,
  DeferOrderInput,
  GeneratePlanInput,
  ResolveIssueInput,
  SaveLayoutInput,
} from "@waypoint/shared"
import { useWorkspace } from "@/hooks/use-workspace"
import { api, ApiError, qs, type Violation } from "@/lib/api"
import type {
  Dashboard,
  DemandOverview,
  IssueDetail,
  IssuesResponse,
  OrderDetail,
  OrdersResponse,
  OutletDetail,
  OutletOverviewRow,
  Plan,
  TripDetail,
  TripPreview,
  TripsResponse,
  Vehicle,
  VehicleDetail,
} from "@/lib/types"

/** All dispatcher data access in one place: query keys, fetchers and mutations. */

export const keys = {
  dashboard: (d: string, t: string) => ["dashboard", d, t] as const,
  orders: (d: string, t: string, f: object) => ["orders", d, t, f] as const,
  plan: (d: string, t: string) => ["plan", d, t] as const,
  demand: (d: string, t: string) => ["demand", d, t] as const,
  vehicles: (d: string) => ["vehicles", d] as const,
}

export function useDashboard() {
  const { depotId, date, ready } = useWorkspace()
  return useQuery({
    queryKey: keys.dashboard(depotId, date),
    queryFn: () => api<Dashboard>(`/dashboard${qs({ depotId, date })}`),
    enabled: ready,
    refetchInterval: 30_000,
  })
}

export function useOrders(filters: { view?: string; brand?: string; district?: string; q?: string }) {
  const { depotId, date, ready } = useWorkspace()
  return useQuery({
    queryKey: keys.orders(depotId, date, filters),
    queryFn: () => api<OrdersResponse>(`/orders${qs({ depotId, date, ...filters })}`),
    enabled: ready,
    placeholderData: (prev) => prev,
  })
}

export function useCurrentPlan() {
  const { depotId, date, ready } = useWorkspace()
  return useQuery({
    queryKey: keys.plan(depotId, date),
    queryFn: () => api<Plan | null>(`/plans/current${qs({ depotId, date })}`),
    enabled: ready,
    // Once published the depot gate moves on its own (claims, auto-start), so keep it fresh.
    refetchInterval: (q) => (q.state.data?.status === "PUBLISHED" ? 4_000 : false),
  })
}

export function useDemand() {
  const { depotId, date, ready } = useWorkspace()
  return useQuery({
    queryKey: keys.demand(depotId, date),
    queryFn: () => api<DemandOverview>(`/plans/demand${qs({ depotId, date })}`),
    enabled: ready,
  })
}

export function useVehicles() {
  const { depotId, ready } = useWorkspace()
  return useQuery({
    queryKey: keys.vehicles(depotId),
    queryFn: () => api<Vehicle[]>(`/vehicles${qs({ depotId })}`),
    enabled: ready,
  })
}

/** After any plan change, the plan, orders and dashboard all move together. */
function usePlanCache() {
  const qc = useQueryClient()
  const { depotId, date } = useWorkspace()
  return (plan?: Plan | null) => {
    if (plan !== undefined) qc.setQueryData(keys.plan(depotId, date), plan)
    else qc.invalidateQueries({ queryKey: ["plan"] })
    qc.invalidateQueries({ queryKey: ["orders"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }
}

const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

export function useGeneratePlan() {
  const sync = usePlanCache()
  const { depotId, date } = useWorkspace()
  return useMutation({
    mutationFn: (options: GeneratePlanInput["options"]) =>
      api<Plan>("/plans/generate", { method: "POST", json: { depotId, date, options } }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success(`Plan v${plan.version} generated`, {
        description: `${plan.summary.served} served · ${plan.summary.deferred} deferred · ${plan.summary.trips} trips`,
      })
    },
    onError,
  })
}

export function useDeferOrder(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: (input: DeferOrderInput) => api<Plan>(`/plans/${planId}/defer`, { method: "POST", json: input }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success("Order deferred", { description: "Reason recorded on the plan." })
    },
    onError,
  })
}

export function useCheckAssign(planId?: string) {
  return useMutation({
    mutationFn: (input: AssignOrderInput) =>
      api<{ ok: boolean; violations: Violation[]; tripRef: string }>(`/plans/${planId}/assign/check`, { method: "POST", json: input }),
  })
}

export function useAssignOrder(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: (input: AssignOrderInput) => api<Plan>(`/plans/${planId}/assign`, { method: "POST", json: input }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success("Order assigned", { description: "Trip re-sequenced and re-timed." })
    },
    onError,
  })
}

/** Live re-timing of a trip in the canvas sequence. Keyed by the exact order list, so each edit recalculates. */
export function useTripPreview(planId: string | undefined, tripId: string | undefined, orderIds: string[], enabled = true) {
  return useQuery({
    queryKey: ["trip-preview", planId, tripId, orderIds.join(",")],
    queryFn: () => api<TripPreview>(`/plans/${planId}/trips/preview`, { method: "POST", json: { tripId, orderIds } }),
    enabled: enabled && !!planId && !!tripId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

export function useSaveLayout(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: (input: SaveLayoutInput) => api<Plan>(`/plans/${planId}/layout`, { method: "PUT", json: input }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success("Trip saved", { description: "Order and arrival times updated on the draft." })
    },
    onError,
  })
}

export function useCreateTrip(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: (input: CreateTripInput) => api<Plan>(`/plans/${planId}/trips`, { method: "POST", json: input }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success("Trip created")
    },
    onError,
  })
}

export function useRemoveTrip(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: (tripId: string) => api<Plan>(`/plans/${planId}/trips/${tripId}`, { method: "DELETE" }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success("Trip removed", { description: "Its orders moved to the deferred pool." })
    },
    onError,
  })
}

export function useResetTrip(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: (tripId: string) => api<Plan>(`/plans/${planId}/trips/${tripId}/reset`, { method: "POST" }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success("Trip reset to the generated plan")
    },
    onError,
  })
}

export function usePublishPlan(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: () => api<Plan>(`/plans/${planId}/publish`, { method: "POST" }),
    onSuccess: (plan) => {
      sync(plan)
      toast.success(`Plan v${plan.version} published`, { description: "Loaders, drivers and stores have been notified." })
    },
    onError,
  })
}

export function useDiscardPlan(planId?: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: () => api(`/plans/${planId}`, { method: "DELETE" }),
    onSuccess: () => sync(),
    onError,
  })
}

// ── Trips ─────────────────────────────────────────────────

export function useTrips() {
  const { depotId, date, ready } = useWorkspace()
  return useQuery({
    queryKey: ["trips", depotId, date],
    queryFn: () => api<TripsResponse>(`/trips${qs({ depotId, date })}`),
    enabled: ready,
    // Live columns move only while the replay clock runs; poll lightly then.
    refetchInterval: (q) => (q.state.data?.clock?.running ? 10_000 : false),
  })
}

export function useTripDetail(id: string) {
  return useQuery({
    queryKey: ["trip", id],
    queryFn: () => api<TripDetail>(`/trips/${id}`),
    refetchInterval: (q) => (q.state.data?.clock?.running ? 15_000 : false),
  })
}

// ── Issues ────────────────────────────────────────────────

export function useIssues(filters: { status?: string; stage?: string; severity?: string; q?: string }) {
  const { depotId, ready } = useWorkspace()
  return useQuery({
    queryKey: ["issues", depotId, filters],
    queryFn: () => api<IssuesResponse>(`/issues${qs({ depotId, ...filters })}`),
    enabled: ready,
    placeholderData: (prev) => prev,
    refetchInterval: 20_000,
  })
}

export function useIssueSummary() {
  const { depotId, ready } = useWorkspace()
  return useQuery({
    queryKey: ["issues", depotId, "summary"],
    queryFn: () => api<{ open: number }>(`/issues/summary${qs({ depotId })}`),
    enabled: ready,
    refetchInterval: 30_000,
  })
}

export function useIssue(id: string) {
  return useQuery({ queryKey: ["issue", id], queryFn: () => api<IssueDetail>(`/issues/${id}`) })
}

function useIssueCache() {
  const qc = useQueryClient()
  return (issue?: IssueDetail) => {
    if (issue) qc.setQueryData(["issue", issue.id], issue)
    qc.invalidateQueries({ queryKey: ["issues"] })
    qc.invalidateQueries({ queryKey: ["trip"] })
    qc.invalidateQueries({ queryKey: ["trips"] })
    qc.invalidateQueries({ queryKey: ["dashboard"] })
  }
}

export function useCreateIssue() {
  const sync = useIssueCache()
  return useMutation({
    mutationFn: (input: CreateIssueInput) => api<{ id: string; ref: string }>("/issues", { method: "POST", json: input }),
    onSuccess: (i) => {
      sync()
      toast.success(`${i.ref} reported`, { description: "Added to the issues queue." })
    },
    onError,
  })
}

export function useAcknowledgeIssue(id: string) {
  const sync = useIssueCache()
  return useMutation({
    mutationFn: () => api<IssueDetail>(`/issues/${id}/acknowledge`, { method: "POST" }),
    onSuccess: (i) => {
      sync(i)
      toast.success(`${i.ref} acknowledged`)
    },
    onError,
  })
}

export function useResolveIssue(id: string) {
  const sync = useIssueCache()
  return useMutation({
    mutationFn: (input: ResolveIssueInput) => api<IssueDetail>(`/issues/${id}/resolve`, { method: "POST", json: input }),
    onSuccess: (i) => {
      sync(i)
      toast.success(`${i.ref} resolved`, { description: "Resolution recorded and notifications sent." })
    },
    onError,
  })
}

// ── Resources: vehicles, outlets, orders ──────────────────

export function useVehicleDetail(id: string) {
  return useQuery({ queryKey: ["vehicle", id], queryFn: () => api<VehicleDetail>(`/vehicles/${id}`) })
}

export function useOutletsOverview(q: string) {
  const { depotId, date, ready } = useWorkspace()
  return useQuery({
    queryKey: ["outlets", depotId, date, q],
    queryFn: () => api<OutletOverviewRow[]>(`/outlets/overview${qs({ depotId, date, q })}`),
    enabled: ready,
    placeholderData: (prev) => prev,
  })
}

export function useOutletDetail(id: string) {
  return useQuery({ queryKey: ["outlet", id], queryFn: () => api<OutletDetail>(`/outlets/${id}`) })
}

export function useOrderDetail(id: string) {
  return useQuery({ queryKey: ["order", id], queryFn: () => api<OrderDetail>(`/orders/${id}`) })
}

export function useDistricts() {
  const { depotId, ready } = useWorkspace()
  return useQuery({
    queryKey: ["districts", depotId],
    queryFn: () => api<{ id: string; depotToDistrictKm: number; depotToDistrictMin: number }[]>(`/districts${qs({ depotId })}`),
    enabled: ready,
    staleTime: 10 * 60_000,
  })
}

/** Depot gate actions on a published trip. */
function useGateAction(action: "start" | "hold" | "release", ok: string) {
  const sync = usePlanCache()
  return useMutation({
    mutationFn: (tripId: string) => api<{ ok: true }>(`/gate/trips/${tripId}/${action}`, { method: "POST" }),
    onSuccess: () => {
      sync()
      toast.success(ok)
    },
    onError,
  })
}

export function useGate() {
  return { start: useGateAction("start", "Trip is live"), hold: useGateAction("hold", "Trip held at the depot"), release: useGateAction("release", "Hold lifted") }
}
