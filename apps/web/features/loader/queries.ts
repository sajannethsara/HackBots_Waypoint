"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  LoaderCapacityBreach,
  LoaderCompleteBlocked,
  LoaderIssueDetail,
  LoaderIssueInput,
  LoaderIssueResult,
  LoaderQueueFilter,
  LoaderTrip,
  StopCountInput,
  StopCountResult,
  StopLineResult,
} from "@waypoint/shared"
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
  // Polled: dispatch can defer a stop, cancel the trip or re-publish the day while the loader works on it.
  return useQuery({ queryKey: loaderKeys.trip(id), queryFn: () => api<LoaderTrip>(`/loader/trips/${id}`), retry: false, refetchInterval: 15_000 })
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

/** Finish loading: the trip becomes LOADED and is handed over for departure. */
export function useCompleteTrip() {
  const settle = useSettleTrip()
  return useMutation({
    mutationFn: (tripId: string) => api<LoaderTrip>(`/loader/trips/${tripId}/complete`, { method: "POST" }),
    onSuccess: (trip) => settle(trip),
    onError: () => settle(),
  })
}

/** The stops the API says still block finishing, if that is why it refused. */
export function blockingStops(err: unknown): LoaderCompleteBlocked["blocking"] | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null
  return (err.body as Partial<LoaderCompleteBlocked>).blocking ?? null
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

/** Issues read back for the status screen; polled so "awaiting decision" turns into the dispatcher's answer. */
export function useLoaderIssues(ids: string[]) {
  return useQuery({
    queryKey: ["loader", "issues", ids] as const,
    queryFn: () => api<LoaderIssueDetail[]>(`/loader/issues?ids=${ids.join(",")}`),
    enabled: ids.length > 0,
    refetchInterval: 10_000,
  })
}

/** Where to see what happened to issues: the confirmation screen right after sending, the status screen later. */
export const issuesHref = (ids: string[], tripId?: string, sent = false) =>
  `/loader/issues?ids=${ids.join(",")}${tripId ? `&trip=${tripId}` : ""}${sent ? "&sent=1" : ""}`

/** Save a stop's item checklist (raises shortfall issues and stows the stop server-side). */
export function useCountStop(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stopId, input }: { stopId: string; input: StopCountInput }) =>
      api<StopCountResult>(`/loader/stops/${stopId}/count`, { method: "POST", json: input }),
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: loaderKeys.trip(tripId) }), qc.invalidateQueries({ queryKey: ["loader", "queue"] })]),
  })
}

/** Tick or untick one item as fully loaded; the API stows the stop when the last item is ticked. */
export function useMarkLine(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stopId, lineId, loaded }: { stopId: string; lineId: string; loaded: boolean }) =>
      api<StopLineResult>(`/loader/stops/${stopId}/lines/${lineId}`, { method: "POST", json: { loaded } }),
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: loaderKeys.trip(tripId) }), qc.invalidateQueries({ queryKey: ["loader", "queue"] })]),
  })
}
