"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { AppContext, Me } from "@/lib/types"

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), staleTime: 5 * 60_000 })
}

export function useAppContext() {
  return useQuery({ queryKey: ["context"], queryFn: () => api<AppContext>("/context"), staleTime: 5 * 60_000 })
}

export function useLogout() {
  const router = useRouter()
  const qc = useQueryClient()
  return async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {})
    qc.clear()
    router.replace("/login")
  }
}
