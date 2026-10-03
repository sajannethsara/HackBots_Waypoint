"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { LoaderCapacityBreach, LoaderIssueInput, LoaderIssueResult, LoaderQueueFilter, LoaderTrip } from "@waypoint/shared"
import { api, ApiError } from "@/lib/api"

/** All loader data access in one place: query keys, fetchers and mutations. */

export const loaderKeys = {
  all: ["loader"] as const,
  queue: (filter: LoaderQueueFilter) => ["loader", "queue", filter] as const,
  trip: (id: string) => ["loader", "trip", id] as const,
}

export function useLoaderQueue(filter: LoaderQueueFilter) {
  return useQuery({
    queryKey: loaderKeys.queue(filter),
    queryFn: () => api<LoaderTrip[]>(`/loader/trips?filter=${filter}`),
    refetchInterval: 20_000, // other loaders claim trips too
  })
}

export function useLoaderTrip(id: string) {
  return useQuery({ queryKey: loaderKeys.trip(id), queryFn: () => api<LoaderTrip>(`/loader/trips/${id}`), retry: false })
}

/** Put a trip the server just returned into its detail cache, and refresh every queue list. */
function useSettleTrip() {
  const qc = useQueryClient()
  return (trip?: LoaderTrip) => {
    if (trip) qc.setQueryData(loaderKeys.trip(trip.id), trip)
    return qc.invalidateQueries({ queryKey: ["loader", "queue"] })
  }
}

export function useClaimTrip() {
  const settle = useSettleTrip()
  return useMutation({
    mutationFn: (tripId: string) => api<LoaderTrip>(`/loader/trips/${tripId}/claim`, { method: "POST" }),
    onSuccess: (trip) => settle(trip),
    onError: () => settle(), // a 409 means the queue is stale: someone else got there first
  })
}

export function useUnclaimTrip() {
  const settle = useSettleTrip()
  return useMutation({
    mutationFn: (tripId: string) => api<LoaderTrip>(`/loader/trips/${tripId}/unclaim`, { method: "POST" }),
    onSuccess: (trip) => settle(trip),
    onError: () => settle(),
  })
}

export function useConfirmStop(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stopId: string) => api<{ id: string; loadStatus: string }>(`/loader/stops/${stopId}/confirm`, { method: "POST" }),
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: loaderKeys.trip(tripId) }), qc.invalidateQueries({ queryKey: ["loader", "queue"] })]),
  })
}

/** Report a loading problem; the trip and queue refresh so the vehicle shows as flagged. */
export function useReportIssue(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoaderIssueInput) => api<LoaderIssueResult>("/loader/issues", { method: "POST", json: input }),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: loaderKeys.trip(tripId) }), qc.invalidateQueries({ queryKey: ["loader", "queue"] })]),
  })
}

/** "Sent ISS-0042 and ISS-0043 to dispatch" */
export const sentMessage = (r: LoaderIssueResult) => {
  const refs = r.issues.map((i) => i.ref)
  return `Sent ${refs.length > 1 ? `${refs.slice(0, -1).join(", ")} and ${refs[refs.length - 1]}` : refs[0]} to dispatch`
}

/** What went wrong confirming a stop, told apart by the API's status and body. */
export type ConfirmFailure =
  | { kind: "breach"; breach: LoaderCapacityBreach }
  /** 403/409 without capacity numbers: the trip was unclaimed, reassigned or already loaded. */
  | { kind: "inactive"; message: string }
  | { kind: "error"; message: string }

export function confirmFailure(err: unknown): ConfirmFailure {
  if (err instanceof ApiError) {
    const body = err.body as Partial<LoaderCapacityBreach>
    if (err.status === 409 && body.weight && body.volume) return { kind: "breach", breach: body as LoaderCapacityBreach }
    if (err.status === 409 || err.status === 403) return { kind: "inactive", message: err.message }
  }
  return { kind: "error", message: err instanceof Error ? err.message : "Could not confirm this stop" }
}
