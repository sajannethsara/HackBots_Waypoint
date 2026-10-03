"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CreateStoreOrderInput, StoreDashboard, StoreOrderDetail, StoreOrderRules, StoreOrderSaved, StoreOrdersResponse, StoreProduct, StoreTemp, UpdateStoreOrderInput, CancelStoreOrderInput } from "@waypoint/shared"
import { api, qs } from "@/lib/api"

/** All store-manager data access: query keys and fetchers. The API scopes every call to the signed-in outlet. */

export const storeKeys = {
  dashboard: ["store", "dashboard"] as const,
  orders: (f: object) => ["store", "orders", f] as const,
  order: (id: string) => ["store", "order", id] as const,
  rules: ["store", "rules"] as const,
  products: (temp: string) => ["store", "products", temp] as const,
}

export function useStoreDashboard() {
  return useQuery({
    queryKey: storeKeys.dashboard,
    queryFn: () => api<StoreDashboard>("/store/dashboard"),
    refetchInterval: 30_000,
  })
}

export interface StoreOrderFilters {
  tab: "orders" | "drafts" | "cancelled"
  q?: string
  status?: string
  from?: string
  to?: string
  page: number
}

export function useStoreOrders(filters: StoreOrderFilters) {
  return useQuery({
    queryKey: storeKeys.orders(filters),
    queryFn: () => api<StoreOrdersResponse>(`/store/orders${qs({ ...filters, pageSize: 10 })}`),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  })
}

export function useStoreOrder(id: string | null) {
  return useQuery({
    queryKey: storeKeys.order(id ?? ""),
    queryFn: () => api<StoreOrderDetail>(`/store/orders/${id}`),
    enabled: !!id,
    refetchInterval: 30_000,
  })
}

export function useOrderRules() {
  return useQuery({ queryKey: storeKeys.rules, queryFn: () => api<StoreOrderRules>("/store/order-rules"), staleTime: 60_000 })
}

export function useStoreProducts(temp: StoreTemp | null) {
  return useQuery({
    queryKey: storeKeys.products(temp ?? ""),
    queryFn: () => api<StoreProduct[]>(`/store/products${qs({ temp })}`),
    enabled: !!temp,
    staleTime: 5 * 60_000,
  })
}

/** Saves a draft or submits an order. Refreshes every store list so counts and tabs stay right. */
export function useSaveOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStoreOrderInput) => api<StoreOrderSaved>("/store/orders", { method: "POST", json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store"] }),
  })
}

/** Saves changes to a submitted order that dispatch has not planned yet. */
export function useUpdateOrder(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateStoreOrderInput) => api<StoreOrderSaved>(`/store/orders/${id}`, { method: "PATCH", json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store"] }),
  })
}

/** Cancels a submitted order that dispatch has not planned yet. */
export function useCancelOrder(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CancelStoreOrderInput) => api<StoreOrderSaved>(`/store/orders/${id}/cancel`, { method: "POST", json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store"] }),
  })
}
