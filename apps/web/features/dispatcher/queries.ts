"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { AssignOrderInput, DeferOrderInput, GeneratePlanInput } from "@waypoint/shared"
import { useWorkspace } from "@/hooks/use-workspace"
import { api, ApiError, qs, type Violation } from "@/lib/api"
import type { Dashboard, DemandOverview, OrdersResponse, Plan, Vehicle } from "@/lib/types"

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
