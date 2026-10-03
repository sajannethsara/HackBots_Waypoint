"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CreateStoreOrderInput, StoreDashboard, StoreOrderDetail, StoreOrderRules, StoreOrderSaved, StoreOrdersResponse, StoreProduct, StoreTemp, UpdateStoreOrderInput, CancelStoreOrderInput, StoreDeliveriesResponse, StoreDeliveryTab, StoreReceivingDetail, ReceiveDeliveryInput, StoreReceiptResult, StoreIssueRow, StoreIssueDetail, ReportStoreIssueInput } from "@waypoint/shared"
import { api, qs } from "@/lib/api"

/** All store-manager data access: query keys and fetchers. The API scopes every call to the signed-in outlet. */

export const storeKeys = {
  dashboard: ["store", "dashboard"] as const,
  orders: (f: object) => ["store", "orders", f] as const,
  order: (id: string) => ["store", "order", id] as const,
  rules: ["store", "rules"] as const,
  deliveries: (tab: string, page: number) => ["store", "deliveries", tab, page] as const,
  receiving: (id: string) => ["store", "receiving", id] as const,
  issues: (status: string) => ["store", "issues", status] as const,
  issue: (id: string) => ["store", "issue", id] as const,
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

/** Polls quickly while a vehicle is heading to the outlet, slowly otherwise. */
export function useStoreDeliveries(tab: StoreDeliveryTab, page: number) {
  return useQuery({
    queryKey: storeKeys.deliveries(tab, page),
    queryFn: () => api<StoreDeliveriesResponse>(`/store/deliveries${qs({ tab, page, pageSize: 10 })}`),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.onTheWay && ["ON_THE_WAY", "ARRIVED"].includes(q.state.data.onTheWay.stage) ? 5_000 : 30_000),
  })
}

export function useReceivingDetail(orderId: string) {
  return useQuery({ queryKey: storeKeys.receiving(orderId), queryFn: () => api<StoreReceivingDetail>(`/store/orders/${orderId}/receiving`) })
}

/** Counts a delivery in. Refreshes orders, deliveries and issues, since all three change. */
export function useReceiveDelivery(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReceiveDeliveryInput) => api<StoreReceiptResult>(`/store/orders/${orderId}/receipt`, { method: "POST", json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store"] }),
  })
}

export function useReportIssue(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReportStoreIssueInput) => api<{ id: string; ref: string; type: string }>(`/store/orders/${orderId}/issues`, { method: "POST", json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store"] }),
  })
}

export function useStoreIssues(status: "all" | "open" | "resolved") {
  return useQuery({
    queryKey: storeKeys.issues(status),
    queryFn: () => api<StoreIssueRow[]>(`/store/issues${qs({ status: status === "all" ? undefined : status })}`),
    refetchInterval: 30_000,
  })
}

export function useStoreIssue(id: string) {
  return useQuery({ queryKey: storeKeys.issue(id), queryFn: () => api<StoreIssueDetail>(`/store/issues/${id}`), refetchInterval: 30_000 })
}
