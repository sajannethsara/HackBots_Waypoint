"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowRight, CircleCheck, Clock, Package, Plus, TriangleAlert, Truck } from "lucide-react"
import { minToHHMM, type LoaderTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMe } from "@/hooks/use-session"
import { cn } from "@/lib/utils"
import { claimState, destination, isFlagged, statusPill, type ClaimState } from "./model"
import { useLoaderQueue } from "./queries"
import { TripActions, tripHref, useStartLoading } from "./trip-actions"

const SHOWN = 8
/** What needs the loader first: their own vehicles, then work waiting, then everything else. */
const PRIORITY: Record<ClaimState, number> = { mine: 0, unclaimed: 1, locked: 2, done: 3 }

export function LoaderDashboardPage() {
  const { data: me } = useMe()
  const { data: trips, isLoading, isError, error } = useLoaderQueue("all")
  const { start, pending } = useStartLoading()

  const view = useMemo(() => {
    const list = (trips ?? []).map((t) => ({ trip: t, state: claimState(t, me?.id) }))
    const loaded = list.filter((r) => r.trip.status === "LOADED")
    const unclaimed = list.filter((r) => r.state === "unclaimed").sort((a, b) => a.trip.plannedDepartMin - b.trip.plannedDepartMin)
    return {
      rows: [...list].sort((a, b) => PRIORITY[a.state] - PRIORITY[b.state] || a.trip.plannedDepartMin - b.trip.plannedDepartMin),
      mine: list.filter((r) => r.state === "mine").length,
      loaded: loaded.length,
      loadedByMe: loaded.filter((r) => r.trip.loadedBy?.id === me?.id).length,
      flagged: list.filter((r) => isFlagged(r.trip)),
      // The earliest departure nobody holds; flagged vehicles wait for dispatch, so they go last.
      next: unclaimed.find((r) => !isFlagged(r.trip)) ?? unclaimed[0],
    }
  }, [trips, me?.id])

  return (
    // Layout follows the content width (sidebar open or not), so tablets get cards instead of a cramped table.
    <div className="@container grid gap-4">
      <PageHeader title="Dashboard" description={`Overview of today's vehicle loading queue${me?.depot ? ` at ${me.depot.name}` : ""}.`} />

      <div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-4">
        <StatCard icon={Truck} tone="green" label="Vehicles today" value={isLoading ? "…" : (trips?.length ?? 0)} hint="On today's published plan" />
        <StatCard icon={Clock} tone="blue" label="Claimed by me" value={isLoading ? "…" : view.mine} hint="Being loaded by you now" />
        <StatCard icon={CircleCheck} tone="green" label="Loaded & released" value={isLoading ? "…" : view.loaded} hint={`${view.loadedByMe} by you`} />
        <StatCard
          icon={TriangleAlert}
          tone={view.flagged.length ? "red" : "gray"}
          label="Flagged vehicles"
          value={isLoading ? "…" : view.flagged.length}
          hint={`${view.flagged.reduce((n, r) => n + r.trip.issues.length, 0)} open loading issues`}
        />
      </div>

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Today&apos;s Loading Queue</h2>
            <p className="text-sm text-muted-foreground">Your vehicles first, then those waiting for a loader, by departure time.</p>
          </div>
          <Button onClick={() => view.next && start(view.next.trip)} disabled={!view.next || pending}>
            <Plus />
            {pending ? "Claiming…" : view.next ? `Claim next vehicle · ${view.next.trip.vehicle.id} ${minToHHMM(view.next.trip.plannedDepartMin)}` : "No vehicle waiting"}
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-4 text-sm text-destructive">{error.message}</p>
        ) : view.rows.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Package />
              </EmptyMedia>
              <EmptyTitle>No vehicles to load today</EmptyTitle>
              <EmptyDescription>Trips appear here once dispatch publishes today&apos;s plan for your depot.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="hidden overflow-x-auto @4xl:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Vehicle</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Trip</TableHead>
                    <TableHead>Departure</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.slice(0, SHOWN).map(({ trip, state }) => (
                    <Row key={trip.id} trip={trip} state={state} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y @4xl:hidden">
              {view.rows.slice(0, SHOWN).map(({ trip, state }) => (
                <RowCard key={trip.id} trip={trip} state={state} />
              ))}
            </ul>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Showing {Math.min(SHOWN, view.rows.length)} of {view.rows.length} vehicles
              </span>
              <Link href="/loader/queue" className="flex items-center gap-1 font-medium text-primary hover:underline">
                View all in queue <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function Row({ trip, state }: { trip: LoaderTrip; state: ClaimState }) {
  const pill = statusPill(trip, state)
  return (
    <TableRow className={cn(state === "mine" && "bg-primary/5")}>
      <TableCell className="pl-4 font-semibold">
        <Link href={tripHref(trip)} className="hover:underline">
          {trip.vehicle.id}
        </Link>
      </TableCell>
      <TableCell>
        <BrandBadge brand={trip.brand} />
      </TableCell>
      <TableCell className="max-w-56 truncate">{destination(trip)}</TableCell>
      <TableCell className="text-muted-foreground">Trip {trip.tripNo}</TableCell>
      <TableCell className="tabular-nums">{minToHHMM(trip.plannedDepartMin)}</TableCell>
      <TableCell>
        <TagBadge tone={pill.tone}>{pill.label}</TagBadge>
      </TableCell>
      <TableCell className="pr-4">
        <TripActions trip={trip} state={state} showUnclaim={false} />
      </TableCell>
    </TableRow>
  )
}

/** The same row as a card, for narrow content areas (tablet portrait, or landscape with the sidebar open). */
function RowCard({ trip, state }: { trip: LoaderTrip; state: ClaimState }) {
  const pill = statusPill(trip, state)
  return (
    <li className={cn("grid gap-2 px-4 py-3", state === "mine" && "bg-primary/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={tripHref(trip)} className="text-base font-semibold hover:underline">
          {trip.vehicle.id}
        </Link>
        <BrandBadge brand={trip.brand} />
        <span className="ml-auto">
          <TagBadge tone={pill.tone}>{pill.label}</TagBadge>
        </span>
      </div>
      <p className="text-sm">{destination(trip)}</p>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Trip {trip.tripNo} · <Clock className="size-3.5" /> departs <span className="font-medium text-foreground tabular-nums">{minToHHMM(trip.plannedDepartMin)}</span>
      </p>
      <TripActions trip={trip} state={state} showUnclaim={false} />
    </li>
  )
}
