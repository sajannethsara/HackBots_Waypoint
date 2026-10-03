"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Box, CircleCheck, Clock, Info, Lock, Play, RefreshCw, Snowflake, TriangleAlert, Truck, UserRound, Weight } from "lucide-react"
import { toast } from "sonner"
import { formatWindow, minToHHMM, type LoaderCapacityBreach, type LoaderStop, type LoaderTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge, TONE } from "@/components/shared/badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/hooks/use-session"
import { ApiError } from "@/lib/api"
import { fmtNum } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CapacityBreachModal } from "./capacity-breach-modal"
import { cargoSpec, claimState, destination, loadingOrder, statusPill, stowedLoad, type ClaimState } from "./model"
import { confirmFailure, useClaimTrip, useConfirmStop, useLoaderTrip } from "./queries"
import { ReportIssueDialog } from "./report-issue-dialog"

export function VehicleLoadPage({ tripId }: { tripId: string }) {
  const { data: me } = useMe()
  const { data: trip, isLoading, error, refetch, isFetching } = useLoaderTrip(tripId)

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }
  if (error || !trip) {
    const missing = error instanceof ApiError && error.status === 404
    return (
      <Empty className="min-h-[60vh] border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Truck />
          </EmptyMedia>
          <EmptyTitle>{missing ? "Vehicle not found" : "Could not load this vehicle"}</EmptyTitle>
          <EmptyDescription>{missing ? "This trip is not on your depot's plan." : error?.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" render={<Link href="/loader/queue" />}>
            <ArrowLeft /> Back to Loading Queue
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return <LoadList trip={trip} state={claimState(trip, me?.id)} depotName={me?.depot?.name} onRefresh={() => refetch()} refreshing={isFetching} />
}

function LoadList({ trip, state, depotName, onRefresh, refreshing }: { trip: LoaderTrip; state: ClaimState; depotName?: string; onRefresh: () => void; refreshing: boolean }) {
  const confirm = useConfirmStop(trip.id)
  const claim = useClaimTrip()
  const [breach, setBreach] = useState<{ breach: LoaderCapacityBreach; stop: LoaderStop } | null>(null)
  const [inactive, setInactive] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const pill = statusPill(trip, state)
  const load = stowedLoad(trip)
  const order = loadingOrder(trip.stops)
  const next = order.find((s) => s.loadStatus !== "STOWED")
  const canLoad = state === "mine" && !inactive

  const onConfirm = (stop: LoaderStop) =>
    confirm.mutate(stop.id, {
      onError: (err) => {
        const f = confirmFailure(err)
        if (f.kind === "breach") setBreach({ breach: f.breach, stop })
        else if (f.kind === "inactive") setInactive(f.message)
        else toast.error(f.message)
      },
    })

  const onClaim = () =>
    claim.mutate(trip.id, {
      onError: (err) => toast.error(err instanceof ApiError && err.status === 409 ? `${trip.vehicle.id} was just claimed by another loader` : err.message),
    })

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button variant="outline" size="sm" render={<Link href="/loader/queue" />}>
          <ArrowLeft /> Back to Loading Queue
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{trip.vehicle.id}</span>
      </div>

      <Card className="flex-row flex-wrap items-center gap-4 px-4 py-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", TONE.green)}>
          <Truck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Load list — {trip.vehicle.id}</h1>
            <BrandBadge brand={trip.brand} />
            <TagBadge>{trip.ref}</TagBadge>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            {depotName && <span>{depotName}</span>}
            <span>Trip {trip.tripNo}</span>
            <span>{destination(trip)}</span>
            <span>{cargoSpec(trip)}</span>
            <span className="flex items-center gap-1">
              <UserRound className="size-3.5" /> {trip.driver ? `Driver: ${trip.driver.name}` : "No driver assigned"}
            </span>
            <span className="flex items-center gap-1 font-medium text-primary">
              <Clock className="size-3.5" /> Departure {minToHHMM(trip.plannedDepartMin)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TagBadge tone={pill.tone}>{state === "mine" ? "In progress · reverse loading sequence" : pill.label}</TagBadge>
          <Button variant="outline" size="icon-sm" onClick={onRefresh} aria-label="Refresh" disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
      </Card>

      {inactive && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>This vehicle is no longer active for you</AlertTitle>
          <AlertDescription>
            <p>
              {inactive}. It may have been unclaimed in another tab, claimed by someone else or already loaded. Nothing was changed on this screen.
            </p>
            <Button variant="outline" size="sm" className="mt-2" render={<Link href="/loader/queue" />}>
              <ArrowLeft /> Back to Loading Queue
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!inactive && state !== "mine" && <ReadOnlyNotice trip={trip} state={state} onClaim={onClaim} claiming={claim.isPending} />}

      <Card className="gap-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Capacity icon={Weight} title="Gross payload weight" unit="kg" digits={0} loaded={load.weightKg} cap={trip.vehicle.weightCapKg} planned={trip.loadWeightKg} />
          <Capacity icon={Box} title="Volumetric stowage" unit="m³" digits={1} loaded={load.volumeM3} cap={trip.vehicle.volumeCapM3} planned={trip.loadVolumeM3} />
        </div>
        <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm ring-1 ring-inset", TONE.blue)}>
          <Info className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Last in, first out:</span>{" "}
            {order.length > 1
              ? `load stop ${order[0].seq} first at the bulkhead; stop ${order[order.length - 1].seq} goes in last at the tailgate.`
              : "a single stop: load it at the tailgate."}
          </p>
          <span className="text-xs font-medium">
            {load.stowed} stowed · {trip.stops.length - load.stowed} to load
          </span>
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase">Loading sequence (bulkhead to tailgate)</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {trip.stops.length} {trip.stops.length === 1 ? "stop" : "stops"} · reverse delivery order
            </span>
            <Button variant="outline" size="sm" onClick={() => setReporting(true)}>
              <TriangleAlert /> Report an issue
            </Button>
          </div>
        </div>
        <ol className="grid gap-2 p-3">
          {order.map((s, i) => (
            <StopRow
              key={s.id}
              stop={s}
              position={i + 1}
              total={order.length}
              active={canLoad && s.id === next?.id}
              canLoad={canLoad}
              pending={confirm.isPending && confirm.variables === s.id}
              onConfirm={() => onConfirm(s)}
            />
          ))}
        </ol>
      </Card>

      <CapacityBreachModal breach={breach?.breach ?? null} stop={breach?.stop ?? null} vehicleId={trip.vehicle.id} onOpenChange={(o) => !o && setBreach(null)} />
      <ReportIssueDialog trip={trip} open={reporting} onOpenChange={setReporting} />
    </div>
  )
}

function ReadOnlyNotice({ trip, state, onClaim, claiming }: { trip: LoaderTrip; state: ClaimState; onClaim: () => void; claiming: boolean }) {
  if (state === "unclaimed")
    return (
      <Alert>
        <Info />
        <AlertTitle>Not claimed yet</AlertTitle>
        <AlertDescription>
          <p>Start loading to claim {trip.vehicle.id}. Other loaders will see it as locked while you work.</p>
          <Button size="sm" className="mt-2" onClick={onClaim} disabled={claiming}>
            <Play /> {claiming ? "Claiming…" : "Start loading"}
          </Button>
        </AlertDescription>
      </Alert>
    )
  if (state === "locked")
    return (
      <Alert>
        <Lock />
        <AlertTitle>Being loaded by {trip.claimedBy?.name ?? "another loader"}</AlertTitle>
        <AlertDescription>You can follow progress here, but only the loader holding the vehicle can confirm stops.</AlertDescription>
      </Alert>
    )
  return (
    <Alert>
      <CircleCheck />
      <AlertTitle>{statusPill(trip, state).label}</AlertTitle>
      <AlertDescription>Loading for this vehicle is finished. This view is read-only.</AlertDescription>
    </Alert>
  )
}

function Capacity({ icon: Icon, title, unit, digits, loaded, cap, planned }: { icon: typeof Weight; title: string; unit: string; digits: number; loaded: number; cap: number; planned: number }) {
  const pct = cap ? (loaded / cap) * 100 : 0
  const tone = pct > 100 ? "red" : pct >= 90 ? "amber" : "green"
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex size-8 items-center justify-center rounded-lg ring-1 ring-inset", TONE[tone])}>
            <Icon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">
              Planned load {fmtNum(planned, digits)} {unit}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm">
            <span className="text-base font-bold tabular-nums">{fmtNum(loaded, digits)}</span>
            <span className="text-muted-foreground">
              {" "}
              / {fmtNum(cap, digits)} {unit} max
            </span>
          </p>
          <p className={cn("text-xs font-medium", pct > 100 ? "text-destructive" : "text-primary")}>
            {pct > 100 ? `${fmtNum(loaded - cap, digits)} ${unit} over` : `${fmtNum(cap - loaded, digits)} ${unit} margin`}
          </p>
        </div>
      </div>
      <Progress value={Math.min(pct, 100)} className="h-2" />
      <p className="text-xs text-muted-foreground">{fmtNum(pct, 1)}% of capacity stowed (live from confirmed stops)</p>
    </div>
  )
}

function StopRow({
  stop,
  position,
  total,
  active,
  canLoad,
  pending,
  onConfirm,
}: {
  stop: LoaderStop
  position: number
  total: number
  active: boolean
  canLoad: boolean
  pending: boolean
  onConfirm: () => void
}) {
  const stowed = stop.loadStatus === "STOWED"
  const place = position === 1 ? "Bulkhead" : position === total ? "Tailgate" : position <= total / 2 ? "Front" : "Rear"
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5",
        active && "border-primary ring-1 ring-primary",
        stowed && "bg-muted/40",
      )}
    >
      <span className={cn("grid w-20 shrink-0 justify-items-center rounded-md px-2 py-1", active ? "bg-primary text-primary-foreground" : "bg-muted")}>
        <span className="text-xs font-semibold">SEQ #{position}</span>
        <span className={cn("text-[10px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{place}</span>
      </span>
      <div className="w-28 shrink-0">
        <p className="text-sm font-semibold">{stop.order.ref}</p>
        <p className={cn("text-xs", active ? "font-medium text-primary" : "text-muted-foreground")}>{active ? "Load next" : `Delivery stop ${stop.seq}`}</p>
      </div>
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-medium">{stop.outlet.name}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {stop.order.temp === "CHILLED" && <Snowflake className="size-3 text-sky-600 dark:text-sky-400" />}
          {stop.order.temp === "CHILLED" ? "Chilled" : "Ambient"} · {stop.order.lines.length} {stop.order.lines.length === 1 ? "line" : "lines"}
        </p>
      </div>
      <span className="flex w-28 items-center gap-1 text-sm text-muted-foreground tabular-nums">
        <Clock className="size-3.5" /> {formatWindow(stop.outlet.windowOpenMin, stop.outlet.windowCloseMin)}
      </span>
      <div className="w-32 text-right">
        <p className="text-sm font-semibold tabular-nums">{fmtNum(stop.order.weightKg)} kg</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {fmtNum(stop.order.volumeM3, 1)} m³ · {stop.order.units} units
        </p>
      </div>
      <label
        className={cn(
          "flex h-8 w-40 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium",
          stowed ? cn("ring-1 ring-inset", TONE.green, "border-transparent") : canLoad ? "cursor-pointer hover:bg-muted" : "text-muted-foreground",
        )}
      >
        <Checkbox checked={stowed} disabled={stowed || !canLoad || pending} onCheckedChange={(c) => c && onConfirm()} aria-label={`Confirm ${stop.order.ref} stowed`} />
        {stowed ? "Confirmed loaded" : pending ? "Confirming…" : "Confirm stowed"}
      </label>
    </li>
  )
}
