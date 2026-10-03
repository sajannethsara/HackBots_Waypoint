"use client"

import { useQuery } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import type { StoreLiveView } from "@waypoint/shared"
import { api } from "@/lib/api"

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb)
  return () => document.removeEventListener("visibilitychange", cb)
}
const useTabVisible = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  )

/**
 * Live view of the vehicle bringing one order. Polls every 5 s (a bit longer than the 1.9 s marker glide) and stops
 * while the tab is hidden, so a forgotten tab costs the server nothing.
 */
export function useStoreLive(orderId: string, enabled = true) {
  const visible = useTabVisible()
  return useQuery({
    queryKey: ["store", "live", orderId],
    queryFn: () => api<StoreLiveView>(`/store/orders/${orderId}/live`),
    enabled,
    refetchInterval: visible ? 5_000 : false,
    placeholderData: (prev) => prev,
    retry: false, // a 404 means "not on today's trip", which is an answer, not a glitch
  })
}
