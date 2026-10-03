"use client"

import { useQuery } from "@tanstack/react-query"
import type { StoreDashboard, StoreOrderDetail, StoreOrdersResponse } from "@waypoint/shared"
import { api, qs } from "@/lib/api"

/** All store-manager data access: query keys and fetchers. The API scopes every call to the signed-in outlet. */

export const storeKeys = {
  dashboard: ["store", "dashboard"] as const,
  orders: (f: object) => ["store", "orders", f] as const,
  order: (id: string) => ["store", "order", id] as const,
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
