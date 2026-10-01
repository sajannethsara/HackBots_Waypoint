"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, useSyncExternalStore } from "react"
import { io } from "socket.io-client"
import { toast } from "sonner"
import type { LiveClock, LiveSnapshot } from "@waypoint/shared"
import { useWorkspace } from "@/hooks/use-workspace"
import { api, ApiError, qs } from "@/lib/api"

export type LinkState = "connecting" | "live" | "offline" | "paused"

const liveKey = (depotId: string, date: string) => ["live", depotId, date] as const

function subscribeVisibility(cb: () => void) {
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
 * Live snapshot: one REST fetch for first paint, then pushed updates over a WebSocket.
 * The socket is opened only while this view is mounted and the tab is visible, so the
 * server does no live work for dashboards nobody is looking at.
 */
export function useLiveSnapshot(wsUrl?: string) {
  const { depotId, date, ready } = useWorkspace()
  const qc = useQueryClient()
  const visible = useTabVisible()
  const [link, setLink] = useState<Exclude<LinkState, "paused">>("connecting")

  const query = useQuery({
    queryKey: liveKey(depotId, date),
    queryFn: () => api<LiveSnapshot>(`/live/snapshot${qs({ depotId, date })}`),
    enabled: ready,
  })

  useEffect(() => {
    if (!ready || !visible) return
    const base = wsUrl || `${window.location.protocol}//${window.location.hostname}:4000`
    const socket = io(`${base}/live`, { withCredentials: true, transports: ["websocket"], reconnectionDelayMax: 5000 })
    socket.on("connect", () => {
      setLink("live")
      socket.emit("subscribe", { depotId, date })
    })
    socket.on("disconnect", () => setLink("offline"))
    socket.on("connect_error", () => setLink("offline"))
    socket.on("snapshot", (s: LiveSnapshot) => {
      if (s.depotId === depotId && s.date === date) qc.setQueryData(liveKey(depotId, date), s)
    })
    return () => {
      socket.disconnect()
    }
  }, [ready, visible, depotId, date, wsUrl, qc])

  return { ...query, link: (visible ? link : "paused") as LinkState }
}

export function useClockControl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { action: "play" | "pause" | "reset" | "seek" | "speed"; value?: number }) =>
      api<LiveClock>("/live/clock", { method: "POST", json: body }),
    // The server broadcasts a fresh snapshot to every open socket; refetch covers a closed one.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live"] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not change the clock"),
  })
}
