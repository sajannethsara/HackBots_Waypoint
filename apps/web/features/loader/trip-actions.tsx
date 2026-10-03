"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Lock, Play, TriangleAlert, Undo2 } from "lucide-react"
import { toast } from "sonner"
import type { LoaderTrip } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { canUnclaim, isFlagged, type ClaimState } from "./model"
import { issuesHref, useClaimTrip, useUnclaimTrip } from "./queries"

export const tripHref = (trip: LoaderTrip) => (trip.status === "LOADED" ? `/loader/vehicles/${trip.id}/released` : `/loader/vehicles/${trip.id}`)

/** Claim a trip and open its load list; a lost race refreshes the queue and says who was faster. */
export function useStartLoading() {
  const router = useRouter()
  const claim = useClaimTrip()
  const start = (trip: LoaderTrip) =>
    claim.mutate(trip.id, {
      onSuccess: () => router.push(`/loader/vehicles/${trip.id}`),
      onError: (err) =>
        toast.error(err instanceof ApiError && err.status === 409 ? `${trip.vehicle.id} was just claimed by another loader` : err.message, {
          description: err instanceof ApiError && err.status === 409 ? "The queue has been refreshed." : undefined,
        }),
    })
  return { start, pending: claim.isPending, variables: claim.variables }
}

/** The buttons a trip offers the loader looking at it, shared by the queue cards and the dashboard table. */
export function TripActions({ trip, state, showUnclaim = true }: { trip: LoaderTrip; state: ClaimState; showUnclaim?: boolean }) {
  const router = useRouter()
  const { start, pending, variables } = useStartLoading()
  const unclaim = useUnclaimTrip()
  const onUnclaim = () =>
    unclaim.mutate(trip.id, {
      onSuccess: () => toast.success(`${trip.vehicle.id} unclaimed and back in the queue`),
      onError: (err) => toast.error(err.message),
    })
  const claiming = pending && variables === trip.id

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isFlagged(trip) && (
        <Button variant="destructive" size="sm" nativeButton={false} render={<Link href={issuesHref(trip.issues.map((i) => i.id), trip.id)} />}>
          <TriangleAlert /> View issue
        </Button>
      )}
      {state === "unclaimed" && (
        <Button variant="outline" size="sm" onClick={() => start(trip)} disabled={pending}>
          <Play /> {claiming ? "Claiming…" : "Start loading"}
        </Button>
      )}
      {state === "mine" && (
        <>
          {showUnclaim && canUnclaim(trip) && (
            <Button variant="ghost" size="sm" onClick={onUnclaim} disabled={unclaim.isPending}>
              <Undo2 /> {unclaim.isPending ? "Unclaiming…" : "Unclaim"}
            </Button>
          )}
          <Button size="sm" onClick={() => router.push(`/loader/vehicles/${trip.id}`)}>
            Continue loading <ArrowRight />
          </Button>
        </>
      )}
      {state === "locked" && (
        <Button variant="outline" size="sm" disabled>
          <Lock /> In progress
        </Button>
      )}
      {trip.status === "LOADED" && (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={tripHref(trip)} />}>
          Receipt <ArrowRight />
        </Button>
      )}
    </div>
  )
}
