"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowRight, CircleCheck, Package, PackageX, ShieldCheck, Truck, Weight } from "lucide-react"
import { minToHHMM, type LoaderTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge, type Tone } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMe } from "@/hooks/use-session"
import { fmtNum, fmtTime } from "@/lib/format"
import { destination, stowedLoad } from "./model"
import { useLoaderQueue } from "./queries"

/** What happened to a vehicle after the loader handed it over. */
const HANDOVER: Record<string, { label: string; tone: Tone }> = {
  LOADED: { label: "Released · awaiting departure", tone: "blue" },
  DEPARTED: { label: "Departed with driver", tone: "green" },
  COMPLETED: { label: "Trip completed", tone: "gray" },
  CANCELLED: { label: "Cancelled after loading", tone: "red" },
}

/** Figma 8: read-only ledger of the vehicles this loader finished today, newest release first. */
export function LoadedVehiclesPage() {
  const { data: me } = useMe()
  const { data: trips, isLoading, isError, error } = useLoaderQueue("loaded")

  const view = useMemo(() => {
    const rows = [...(trips ?? [])].sort((a, b) => (b.loadedAt ?? "").localeCompare(a.loadedAt ?? ""))
    const loads = rows.map((t) => ({ trip: t, load: stowedLoad(t), heldBack: t.stops.filter((s) => s.loadStatus !== "STOWED").length }))
    return {
      rows: loads,
      orders: loads.reduce((n, r) => n + r.load.stowed, 0),
      kg: loads.reduce((n, r) => n + r.load.weightKg, 0),
      heldBack: loads.reduce((n, r) => n + r.heldBack, 0),
    }
  }, [trips])

  return (
    <div className="@container grid gap-4">
      <PageHeader
        title="My Loaded Vehicles Today"
        description={`Read-only log of vehicles loaded by ${me?.name ?? "you"}${me?.depot ? ` at ${me.depot.name}` : ""}.`}
        actions={
          <TagBadge tone="green">
            <ShieldCheck className="size-3" /> Read-only audit trail
          </TagBadge>
        }
      />

      <div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-4">
        <StatCard icon={Truck} tone="green" label="Vehicles released" value={isLoading ? "…" : view.rows.length} />
        <StatCard icon={Package} tone="blue" label="Orders stowed" value={isLoading ? "…" : view.orders} />
        <StatCard icon={Weight} tone="green" label="Payload handled" value={isLoading ? "…" : `${fmtNum(view.kg)} kg`} />
        <StatCard icon={PackageX} tone={view.heldBack ? "amber" : "gray"} label="Orders held back" value={isLoading ? "…" : view.heldBack} hint="Reported to dispatch for re-planning" />
      </div>

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-base font-semibold">Handover ledger</h2>
          <span className="text-xs text-muted-foreground">Signed off by you; custody passes to the driver at release</span>
        </div>

        {isLoading ? (
          <div className="grid gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-4 text-sm text-destructive">{error.message}</p>
        ) : view.rows.length === 0 ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheck />
              </EmptyMedia>
              <EmptyTitle>No vehicles released yet today</EmptyTitle>
              <EmptyDescription>Vehicles appear here once you finish loading them and release them to the driver.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/loader/queue" />}>
                Go to the Loading Queue <ArrowRight />
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="hidden overflow-x-auto @4xl:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Vehicle</TableHead>
                    <TableHead>Trip</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Released</TableHead>
                    <TableHead>Load</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead className="pr-4">Handover</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.map(({ trip, load, heldBack }) => (
                    <TableRow key={trip.id}>
                      <TableCell className="pl-4">
                        <span className="flex items-center gap-2">
                          <BrandBadge brand={trip.brand} />
                          <Link href={`/loader/vehicles/${trip.id}/released`} className="font-semibold hover:underline">
                            {trip.vehicle.id}
                          </Link>
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        Trip {trip.tripNo} · {trip.ref}
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{destination(trip)}</TableCell>
                      <TableCell className="tabular-nums">{trip.loadedAt ? fmtTime(trip.loadedAt) : "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {load.stowed}/{trip.stops.length} orders · {fmtNum(load.weightKg)} kg
                        {heldBack > 0 && <span className="text-amber-700 dark:text-amber-300"> · {heldBack} held</span>}
                      </TableCell>
                      <TableCell>
                        <Issues trip={trip} />
                      </TableCell>
                      <TableCell className="pr-4">
                        <Handover trip={trip} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y @4xl:hidden">
              {view.rows.map(({ trip, load, heldBack }) => (
                <li key={trip.id} className="grid gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/loader/vehicles/${trip.id}/released`} className="text-base font-semibold hover:underline">
                      {trip.vehicle.id}
                    </Link>
                    <BrandBadge brand={trip.brand} />
                    <span className="ml-auto">
                      <Handover trip={trip} />
                    </span>
                  </div>
                  <p className="text-sm">{destination(trip)}</p>
                  <p className="text-sm text-muted-foreground">
                    Trip {trip.tripNo} · departs {minToHHMM(trip.plannedDepartMin)} · released {trip.loadedAt ? fmtTime(trip.loadedAt) : "—"} · {load.stowed}/
                    {trip.stops.length} orders, {fmtNum(load.weightKg)} kg{heldBack > 0 && ` · ${heldBack} held back`}
                  </p>
                  <Issues trip={trip} />
                </li>
              ))}
            </ul>
          </>
        )}

        {view.rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t bg-muted/30 px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-primary">
              <CircleCheck className="size-4" /> Today:
            </span>
            <span>{view.rows.length} vehicles released</span>
            <span>{view.orders} orders stowed</span>
            <span>{fmtNum(view.kg)} kg handled</span>
            <span className="ml-auto text-xs text-muted-foreground">Loader custody ends at release.</span>
          </div>
        )}
      </Card>
    </div>
  )
}

function Issues({ trip }: { trip: LoaderTrip }) {
  return trip.issues.length ? <TagBadge tone="amber">{trip.issues.length} open</TagBadge> : <TagBadge tone="green">0 open</TagBadge>
}

function Handover({ trip }: { trip: LoaderTrip }) {
  const h = HANDOVER[trip.status] ?? { label: trip.status, tone: "gray" as Tone }
  return <TagBadge tone={h.tone}>{h.label}</TagBadge>
}
