"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Box,
  CircleCheck,
  ListChecks,
  PackageCheck,
  Undo2,
  Clock,
  Info,
  Lock,
  Play,
  RefreshCw,
  Snowflake,
  TriangleAlert,
  Truck,
  UserRound,
  Weight,
} from "lucide-react"
import { toast } from "sonner"
import {
  formatWindow,
  ISSUE_TYPE_META,
  minToHHMM,
  type LoaderCapacityBreach,
  type LoaderIssue,
  type LoaderStop,
  type LoaderTrip,
} from "@waypoint/shared"
import { BrandBadge, TagBadge, TONE } from "@/components/shared/badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/hooks/use-session"
import { ApiError } from "@/lib/api"
import { fmtNum } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CapacityBreachModal } from "./capacity-breach-modal"
import {
  canUnclaim,
  cargoSpec,
  claimState,
  destination,
  loadingOrder,
  statusPill,
  stopIssues,
  stowedLoad,
  unfinishedStops,
  type ClaimState,
} from "./model"
import {
  blockingStops,
  confirmFailure,
  issuesHref,
  useClaimTrip,
  useMarkLine,
  useCompleteTrip,
  useConfirmStop,
  useLoaderTrip,
  useUnclaimTrip,
} from "./queries"
import { ReportIssueDialog } from "./report-issue-dialog"

export function VehicleLoadPage({ tripId }: { tripId: string }) {
  const { data: me } = useMe()
  const {
    data: trip,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useLoaderTrip(tripId)

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
          <EmptyTitle>
            {missing ? "Vehicle not found" : "Could not load this vehicle"}
          </EmptyTitle>
          <EmptyDescription>
            {missing
              ? "This trip is not on your depot's plan."
              : error?.message}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/loader/queue" />}
          >
            <ArrowLeft /> Back to Loading Queue
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <LoadList
      trip={trip}
      state={claimState(trip, me?.id)}
      depotName={me?.depot?.name}
      onRefresh={() => refetch()}
      refreshing={isFetching}
    />
  )
}

function LoadList({
  trip,
  state,
  depotName,
  onRefresh,
  refreshing,
}: {
  trip: LoaderTrip
  state: ClaimState
  depotName?: string
  onRefresh: () => void
  refreshing: boolean
}) {
  const router = useRouter()
  const confirm = useConfirmStop(trip.id)
  const claim = useClaimTrip()
  const complete = useCompleteTrip()
  const unclaim = useUnclaimTrip()
  const [blocked, setBlocked] = useState<string[]>([])
  const [breach, setBreach] = useState<{
    breach: LoaderCapacityBreach
    stop: LoaderStop
  } | null>(null)
  const [inactive, setInactive] = useState<string | null>(null)
  const [reporting, setReporting] = useState<{
    stopId?: string
    lineId?: string
  } | null>(null)
  const mark = useMarkLine(trip.id)
  const pill = statusPill(trip, state)
  const load = stowedLoad(trip)
  const order = loadingOrder(trip.stops)
  const unfinished = unfinishedStops(trip)
  const heldBack = trip.stops.filter(
    (s) => s.loadStatus !== "STOWED" && stopIssues(trip, s.id).length > 0
  )
  const next = order.find((s) => unfinished.includes(s))
  // Dispatch re-published the day: this trip is from a replaced plan and can only be looked at.
  const replaced = trip.plan.status !== "PUBLISHED"
  const canLoad = state === "mine" && !inactive && !replaced

  const onFinish = () =>
    complete.mutate(trip.id, {
      onSuccess: () => router.push(`/loader/vehicles/${trip.id}/released`),
      onError: (err) => {
        const stops = blockingStops(err)
        if (stops) setBlocked(stops.map((b) => b.stopId))
        const f = confirmFailure(err)
        if (!stops && f.kind === "inactive") setInactive(f.message)
        else toast.error(err.message)
      },
    })

  const onConfirm = (stop: LoaderStop) =>
    confirm.mutate(stop.id, {
      onError: (err) => {
        const f = confirmFailure(err)
        if (f.kind === "breach") setBreach({ breach: f.breach, stop })
        else if (f.kind === "inactive") setInactive(f.message)
        else toast.error(f.message)
      },
    })

  const onUnclaim = () =>
    unclaim.mutate(trip.id, {
      onSuccess: () => {
        toast.success(`${trip.vehicle.id} unclaimed and back in the queue`)
        router.push("/loader/queue")
      },
      onError: (err) => toast.error(err.message),
    })

  const onMark = (stop: LoaderStop, lineId: string, loaded: boolean) =>
    mark.mutate(
      { stopId: stop.id, lineId, loaded },
      {
        onSuccess: (r) => {
          if (r.breach) setBreach({ breach: r.breach, stop })
          else if (r.stop.loadStatus === "STOWED")
            toast.success(`${stop.order.ref}: every item loaded, order stowed`)
        },
        onError: (err) => {
          const f = confirmFailure(err)
          if (f.kind === "inactive") setInactive(f.message)
          else toast.error(err.message)
        },
      }
    )

  const onClaim = () =>
    claim.mutate(trip.id, {
      onError: (err) =>
        toast.error(
          err instanceof ApiError && err.status === 409
            ? `${trip.vehicle.id} was just claimed by another loader`
            : err.message
        ),
    })

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/loader/queue" />}
        >
          <ArrowLeft /> Back to Loading Queue
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{trip.vehicle.id}</span>
      </div>

      <Card className="flex-row flex-wrap items-center gap-4 px-4 py-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
            TONE.green
          )}
        >
          <Truck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">
              Load list — {trip.vehicle.id}
            </h1>
            <BrandBadge brand={trip.brand} />
            <TagBadge>{trip.ref}</TagBadge>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            {depotName && <span>{depotName}</span>}
            <span>Trip {trip.tripNo}</span>
            <span>{destination(trip)}</span>
            <span>{cargoSpec(trip)}</span>
            <span className="flex items-center gap-1">
              <UserRound className="size-3.5" />{" "}
              {trip.driver
                ? `Driver: ${trip.driver.name}`
                : "No driver assigned"}
            </span>
            <span className="flex items-center gap-1 font-medium text-primary">
              <Clock className="size-3.5" /> Departure{" "}
              {minToHHMM(trip.plannedDepartMin)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TagBadge tone={pill.tone}>
            {state === "mine"
              ? "In progress · reverse loading sequence"
              : pill.label}
          </TagBadge>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onRefresh}
            aria-label="Refresh"
            disabled={refreshing}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
      </Card>

      {replaced && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Dispatch replaced today&apos;s plan</AlertTitle>
          <AlertDescription>
            <p>
              This trip belongs to plan version {trip.plan.version}, which is no
              longer current, so nothing more can be loaded on it here. Check
              the queue for this vehicle&apos;s trip in the new plan, and tell
              dispatch about anything already on the truck.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              nativeButton={false}
              render={<Link href="/loader/queue" />}
            >
              <ArrowLeft /> Back to Loading Queue
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {inactive && !replaced && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>This vehicle is no longer active for you</AlertTitle>
          <AlertDescription>
            <p>
              {inactive}. It may have been unclaimed in another tab, claimed by
              someone else or already loaded. Nothing was changed on this
              screen.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              nativeButton={false}
              render={<Link href="/loader/queue" />}
            >
              <ArrowLeft /> Back to Loading Queue
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!inactive && !replaced && state !== "mine" && (
        <ReadOnlyNotice
          trip={trip}
          state={state}
          onClaim={onClaim}
          claiming={claim.isPending}
        />
      )}

      <Card className="gap-3 p-4">
        <div className="@container grid gap-3 @2xl:grid-cols-2">
          <Capacity
            icon={Weight}
            title="Gross payload weight"
            unit="kg"
            digits={0}
            loaded={load.weightKg}
            cap={trip.vehicle.weightCapKg}
            planned={trip.loadWeightKg}
          />
          <Capacity
            icon={Box}
            title="Volumetric stowage"
            unit="m³"
            digits={1}
            loaded={load.volumeM3}
            cap={trip.vehicle.volumeCapM3}
            planned={trip.loadVolumeM3}
          />
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm ring-1 ring-inset",
            TONE.blue
          )}
        >
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
          <h2 className="text-xs font-semibold tracking-wider uppercase">
            Loading sequence (bulkhead to tailgate)
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {trip.stops.length} {trip.stops.length === 1 ? "stop" : "stops"} ·
              reverse delivery order
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReporting({})}
            >
              <TriangleAlert /> Report an issue
            </Button>
          </div>
        </div>
        {/* No inner scroller: the page scrolls normally (wheel/touch anywhere); the finish bar is sticky. */}
        <ol className="grid gap-2 p-3">
          {order.map((s, i) => (
            <StopRow
              key={s.id}
              stop={s}
              position={i + 1}
              total={order.length}
              active={canLoad && s.id === next?.id}
              tripId={trip.id}
              canLoad={canLoad}
              pending={confirm.isPending && confirm.variables === s.id}
              onConfirm={() => onConfirm(s)}
              onReport={() => setReporting({ stopId: s.id })}
              onReportLine={(lineId) => setReporting({ stopId: s.id, lineId })}
              onMarkLine={(lineId, loaded) => onMark(s, lineId, loaded)}
              markingLine={
                mark.isPending && mark.variables?.stopId === s.id
                  ? mark.variables.lineId
                  : null
              }
              issues={stopIssues(trip, s.id)}
              blocked={blocked.includes(s.id) && unfinished.includes(s)}
            />
          ))}
        </ol>
      </Card>

      {canLoad && (
        // Sticky so finishing is always in reach, however long the loading sequence is.
        // Compact on phones (one short line + full-width buttons) so it never covers the stops it sits over.
        <Card className="@container/finish sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 flex-row flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 shadow-lg ring-1 ring-primary/20 @2xl/finish:px-4 @2xl/finish:py-3">
          <span
            className={cn(
              "hidden size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset @xl/finish:flex",
              unfinished.length ? TONE.gray : TONE.green
            )}
          >
            <PackageCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm font-semibold">
              Finish loading{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                · {load.stowed}/{trip.stops.length} stowed
                {heldBack.length > 0 && ` · ${heldBack.length} held`}
                {unfinished.length > 0 && ` · ${unfinished.length} to go`}
              </span>
            </p>
            <p className="hidden text-sm text-muted-foreground @2xl/finish:block">
              {load.stowed} of {trip.stops.length} stowed
              {heldBack.length > 0 &&
                ` · ${heldBack.length} held back with an open issue (${heldBack.map((s) => s.order.ref).join(", ")})`}
              {unfinished.length > 0
                ? ` · ${unfinished.length} still to load or report: ${unfinished.map((s) => s.order.ref).join(", ")}`
                : " · ready to hand over to the driver"}
            </p>
          </div>
          <div className="flex w-full gap-2 @xl/finish:w-auto">
            {canUnclaim(trip) && (
              <Button
                variant="ghost"
                onClick={onUnclaim}
                disabled={unclaim.isPending || complete.isPending}
              >
                <Undo2 /> {unclaim.isPending ? "Unclaiming…" : "Unclaim"}
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={onFinish}
              disabled={unfinished.length > 0 || complete.isPending}
            >
              {complete.isPending ? (
                "Finishing…"
              ) : (
                <>
                  <span className="@md/finish:hidden">
                    Finish &amp; release
                  </span>
                  <span className="hidden @md/finish:inline">
                    Finish loading &amp; release
                  </span>
                </>
              )}{" "}
              <ArrowRight />
            </Button>
          </div>
        </Card>
      )}

      <CapacityBreachModal
        breach={breach?.breach ?? null}
        stop={breach?.stop ?? null}
        tripId={trip.id}
        vehicleId={trip.vehicle.id}
        onOpenChange={(o) => !o && setBreach(null)}
      />
      <ReportIssueDialog
        key={`${reporting?.stopId ?? "trip"}:${reporting?.lineId ?? ""}`}
        trip={trip}
        stopId={reporting?.stopId}
        lineId={reporting?.lineId}
        open={!!reporting}
        onOpenChange={(o) => !o && setReporting(null)}
      />
    </div>
  )
}

function ReadOnlyNotice({
  trip,
  state,
  onClaim,
  claiming,
}: {
  trip: LoaderTrip
  state: ClaimState
  onClaim: () => void
  claiming: boolean
}) {
  if (state === "unclaimed")
    return (
      <Alert>
        <Info />
        <AlertTitle>Not claimed yet</AlertTitle>
        <AlertDescription>
          <p>
            Start loading to claim {trip.vehicle.id}. Other loaders will see it
            as locked while you work.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={onClaim}
            disabled={claiming}
          >
            <Play /> {claiming ? "Claiming…" : "Start loading"}
          </Button>
        </AlertDescription>
      </Alert>
    )
  if (state === "locked")
    return (
      <Alert>
        <Lock />
        <AlertTitle>
          Being loaded by {trip.claimedBy?.name ?? "another loader"}
        </AlertTitle>
        <AlertDescription>
          You can follow progress here, but only the loader holding the vehicle
          can confirm stops.
        </AlertDescription>
      </Alert>
    )
  return (
    <Alert>
      <CircleCheck />
      <AlertTitle>{statusPill(trip, state).label}</AlertTitle>
      <AlertDescription>
        <p>Loading for this vehicle is finished. This view is read-only.</p>
        {trip.status === "LOADED" && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            nativeButton={false}
            render={<Link href={`/loader/vehicles/${trip.id}/released`} />}
          >
            View release receipt <ArrowRight />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function Capacity({
  icon: Icon,
  title,
  unit,
  digits,
  loaded,
  cap,
  planned,
}: {
  icon: typeof Weight
  title: string
  unit: string
  digits: number
  loaded: number
  cap: number
  planned: number
}) {
  const pct = cap ? (loaded / cap) * 100 : 0
  const tone = pct > 100 ? "red" : pct >= 90 ? "amber" : "green"
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg ring-1 ring-inset",
              TONE[tone]
            )}
          >
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
            <span className="text-base font-bold tabular-nums">
              {fmtNum(loaded, digits)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              / {fmtNum(cap, digits)} {unit} max
            </span>
          </p>
          <p
            className={cn(
              "text-xs font-medium",
              pct > 100 ? "text-destructive" : "text-primary"
            )}
          >
            {pct > 100
              ? `${fmtNum(loaded - cap, digits)} ${unit} over`
              : `${fmtNum(cap - loaded, digits)} ${unit} margin`}
          </p>
        </div>
      </div>
      <Progress value={Math.min(pct, 100)} className="h-2" />
      <p className="text-xs text-muted-foreground">
        {fmtNum(pct, 1)}% of capacity stowed (live from confirmed stops)
      </p>
    </div>
  )
}

function StopRow({
  stop,
  position,
  total,
  active,
  tripId,
  canLoad,
  pending,
  onConfirm,
  onReport,
  onReportLine,
  onMarkLine,
  markingLine,
  issues,
  blocked,
}: {
  stop: LoaderStop
  position: number
  total: number
  active: boolean
  tripId: string
  canLoad: boolean
  pending: boolean
  onConfirm: () => void
  onReport: () => void
  /** Report a problem with one item (missing, damaged) with it pre-selected. */
  onReportLine: (lineId: string) => void
  /** Tick or untick one item as fully loaded; ticking the last one stows the order. */
  onMarkLine: (lineId: string, loaded: boolean) => void
  /** The item whose tick is being saved, if any. */
  markingLine: string | null
  issues: LoaderIssue[]
  /** The API refused to finish the trip because of this stop. */
  blocked: boolean
}) {
  const stowed = stop.loadStatus === "STOWED"
  const held = !stowed && issues.length > 0
  const place =
    position === 1
      ? "Bulkhead"
      : position === total
        ? "Tailgate"
        : position <= total / 2
          ? "Front"
          : "Rear"
  return (
    <li
      className={cn(
        "@container/stop overflow-hidden rounded-lg border",
        active && "border-primary ring-1 ring-primary",
        blocked && "border-destructive ring-1 ring-destructive",
        stowed && "bg-muted/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        <span
          className={cn(
            "grid w-20 shrink-0 justify-items-center rounded-md px-2 py-1",
            active ? "bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          <span className="text-xs font-semibold">SEQ #{position}</span>
          <span
            className={cn(
              "text-[10px]",
              active ? "text-primary-foreground/80" : "text-muted-foreground"
            )}
          >
            {place}
          </span>
        </span>
        <div className="w-28 shrink-0">
          <p className="text-sm font-semibold">{stop.order.ref}</p>
          <p
            className={cn(
              "text-xs",
              active
                ? "font-medium text-primary"
                : held || blocked
                  ? "font-medium text-destructive"
                  : "text-muted-foreground"
            )}
          >
            {blocked
              ? "Load or report this"
              : held
                ? "Held back"
                : active
                  ? "Load next"
                  : `Delivery stop ${stop.seq}`}
          </p>
        </div>
        <div className="min-w-40 flex-1">
          <p className="truncate text-sm font-medium">{stop.outlet.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {stop.order.temp === "CHILLED" && (
              <Snowflake className="size-3 text-sky-600 dark:text-sky-400" />
            )}
            {stop.order.temp === "CHILLED" ? "Chilled" : "Ambient"} · window
            <Clock className="ml-0.5 size-3" />{" "}
            {formatWindow(
              stop.outlet.windowOpenMin,
              stop.outlet.windowCloseMin
            )}
          </p>
        </div>
        <div className="w-full @2xl/stop:w-36 @2xl/stop:text-right">
          <p className="text-sm font-semibold tabular-nums">
            {stop.order.units} units · {fmtNum(stop.order.weightKg)} kg
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {fmtNum(stop.order.volumeM3, 2)} m³ · {stop.order.lines.length}{" "}
            {stop.order.lines.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t bg-red-50/60 px-3 py-1.5 text-xs dark:bg-red-500/5">
          <TriangleAlert className="size-3.5 text-destructive" />
          {issues.map((i) => (
            <Link
              key={i.id}
              href={issuesHref([i.id], tripId)}
              className="hover:opacity-80"
            >
              <TagBadge tone="red" title={i.description}>
                {i.ref} · {ISSUE_TYPE_META[i.type].label}
              </TagBadge>
            </Link>
          ))}
          <span className="text-muted-foreground">
            {held
              ? "Reported to dispatch: this stop can stay off the truck."
              : "Reported to dispatch."}
          </span>
        </div>
      )}

      {/* Wide stop cards get a table; narrow ones (phones, portrait tablets) get stacked rows with full-width controls. */}
      <div className="hidden overflow-x-auto border-t @2xl/stop:block">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-muted/50 text-[10px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Item</th>
              <th className="px-3 py-1.5 text-left font-medium">Category</th>
              <th className="px-3 py-1.5 text-right font-medium">Quantity</th>
              <th className="px-3 py-1.5 text-right font-medium">Weight</th>
              <th className="hidden px-3 py-1.5 text-right font-medium @4xl/stop:table-cell">
                Volume
              </th>
              <th className="px-3 py-1.5 text-right font-medium">Loaded?</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stop.order.lines.map((l) => {
              const item = lineState(l, issues, stowed)
              return (
                <tr
                  key={l.id}
                  className={cn(
                    item.done && "bg-emerald-50/40 dark:bg-emerald-500/5"
                  )}
                >
                  <td className="px-3 py-1.5">
                    <p className="font-medium">{l.description}</p>
                    <LineBadges line={l} item={item} tripId={tripId} />
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {categoryLabel(l.category)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {l.quantity} units
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtNum(l.weightKg, 1)} kg
                  </td>
                  <td className="hidden px-3 py-1.5 text-right text-muted-foreground tabular-nums @4xl/stop:table-cell">
                    {fmtNum(l.volumeM3, 2)} m³
                  </td>
                  <td className="px-3 py-1.5">
                    <LineControls
                      line={l}
                      item={item}
                      canLoad={canLoad}
                      saving={markingLine === l.id}
                      onMark={onMarkLine}
                      onReport={onReportLine}
                      className="justify-end"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y border-t @2xl/stop:hidden">
        {stop.order.lines.map((l) => {
          const item = lineState(l, issues, stowed)
          return (
            <li
              key={l.id}
              className={cn(
                "grid gap-2 px-3 py-2.5",
                item.done && "bg-emerald-50/40 dark:bg-emerald-500/5"
              )}
            >
              <div>
                <p className="text-sm font-medium">{l.description}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {categoryLabel(l.category)} · {l.quantity} units ·{" "}
                  {fmtNum(l.weightKg, 1)} kg · {fmtNum(l.volumeM3, 2)} m³
                </p>
                <LineBadges line={l} item={item} tripId={tripId} />
              </div>
              <LineControls
                line={l}
                item={item}
                canLoad={canLoad}
                saving={markingLine === l.id}
                onMark={onMarkLine}
                onReport={onReportLine}
                stretch
              />
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2 @max-md/stop:[&>*]:flex-1">
        <Button
          variant="link"
          size="sm"
          className="mr-auto text-muted-foreground"
          nativeButton={false}
          render={<Link href={`/loader/vehicles/${tripId}/stops/${stop.id}`} />}
        >
          <ListChecks /> {canLoad && !stowed ? "Count units" : "View counts"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onReport}>
          <TriangleAlert /> Report issue
        </Button>
        <label
          className={cn(
            "flex h-8 w-36 items-center justify-start gap-2 rounded-md border px-3 text-sm leading-none font-medium whitespace-nowrap pointer-coarse:h-11",
            stowed
              ? cn("ring-1 ring-inset", TONE.green, "border-transparent")
              : canLoad
                ? "cursor-pointer hover:bg-muted"
                : "text-muted-foreground"
          )}
        >
          <Checkbox
            checked={stowed}
            disabled={stowed || !canLoad || pending}
            onCheckedChange={(c) => c && onConfirm()}
            aria-label={`Confirm ${stop.order.ref} stowed`}
          />
          {stowed ? "Confirmed" : pending ? "Confirming…" : "Confirm"}
        </label>
      </div>
    </li>
  )
}

type Line = LoaderStop["order"]["lines"][number]
type LineState = ReturnType<typeof lineState>

const categoryLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase()

/** One item's loading state: fully ticked, partly counted (from the checklist), and its open issues. */
function lineState(l: Line, issues: LoaderIssue[], stowed: boolean) {
  const full =
    !!l.count && l.count.loadedQty === l.quantity && l.count.damagedQty === 0
  return {
    full,
    done: full || stowed,
    stowed,
    partial: !!l.count && !full,
    issues: issues.filter((i) => i.orderLineId === l.id),
  }
}

/** Partial count and issue chips under an item's name. */
function LineBadges({
  line,
  item,
  tripId,
}: {
  line: Line
  item: LineState
  tripId: string
}) {
  if (!item.partial && item.issues.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {item.partial && line.count && (
        <TagBadge tone="amber">
          {line.count.loadedQty}/{line.quantity} loaded
          {line.count.damagedQty ? ` · ${line.count.damagedQty} damaged` : ""}
        </TagBadge>
      )}
      {item.issues.map((i) => (
        <Link
          key={i.id}
          href={issuesHref([i.id], tripId)}
          className="hover:opacity-80"
        >
          <TagBadge tone="red" title={i.description}>
            {i.ref} · {ISSUE_TYPE_META[i.type].label}
          </TagBadge>
        </Link>
      ))}
    </div>
  )
}

/** Report + the item's own "Mark loaded" box. `stretch` makes them full width for phones. */
function LineControls({
  line,
  item,
  canLoad,
  saving,
  onMark,
  onReport,
  stretch,
  className,
}: {
  line: Line
  item: LineState
  canLoad: boolean
  saving: boolean
  onMark: (lineId: string, loaded: boolean) => void
  onReport: (lineId: string) => void
  stretch?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        stretch && "grid grid-cols-[auto_1fr] gap-2",
        className
      )}
    >
      <Button
        variant={stretch ? "outline" : "ghost"}
        size="sm"
        onClick={() => onReport(line.id)}
        aria-label={`Report a problem with ${line.description}`}
      >
        <TriangleAlert /> Report
      </Button>
      <label
        className={cn(
          "flex h-8 items-center justify-start gap-2 rounded-md border px-3 text-sm leading-none font-medium whitespace-nowrap pointer-coarse:h-11",
          stretch ? "w-full" : "w-36",
          item.done
            ? cn("border-transparent ring-1 ring-inset", TONE.green)
            : canLoad
              ? "cursor-pointer hover:bg-muted"
              : "text-muted-foreground"
        )}
      >
        <Checkbox
          checked={item.done}
          disabled={!canLoad || item.stowed || saving}
          onCheckedChange={(c) => onMark(line.id, !!c)}
          aria-label={`${line.description} loaded`}
        />
        {saving
          ? "Saving…"
          : item.done
            ? "Loaded"
            : canLoad
              ? "Load"
              : "Pending"}
      </label>
    </div>
  )
}
