"use client"

import { useState } from "react"
import { CircleCheck, Flag, Gauge, PackageX, Play, Route as RouteIcon, TriangleAlert, Timer, Warehouse } from "lucide-react"
import { BRAND_LABEL } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { postClaim } from "../lib/driver-api"
import { useDriver } from "../lib/driver-provider"
import { distanceM, doneStops, fmtDistance, greeting, nextStop, tripOutcome, upcomingStops } from "../lib/model"
import { Confirm, useNav } from "../nav"
import { NextStopCard } from "../next-stop-card"
import { cn } from "@/lib/utils"
import { fmt, Mini, NavigateButton, SectionTitle, StopRow } from "../ui"

export function HomeScreen() {
  const { bundle, trip, nowMin, running, startTrip, completeTrip, gps, config, refresh } = useDriver()
  const { openStop, openIssue } = useNav()
  const [confirmStart, setConfirmStart] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [manual, setManual] = useState(false)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const finishedToday = bundle.trips.filter((t) => t.status === "COMPLETED")

  if (!trip) {
    return (
      <div className="grid gap-3 p-4">
        {finishedToday.map((t) => (
          <CompletedCard key={t.id} trip={t} />
        ))}
        <Empty className="rounded-2xl border bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RouteIcon />
            </EmptyMedia>
            <EmptyTitle>{finishedToday.length ? "All trips done" : "No trip today"}</EmptyTitle>
            <EmptyDescription>{finishedToday.length ? "Nice work. Everything is recorded." : "Dispatch has not assigned a trip to you yet. Pull to refresh from the Me tab."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const next = nextStop(trip)
  const nextIndex = next ? trip.stops.indexOf(next) : -1
  const up = upcomingStops(trip).filter((s) => s !== next)
  const done = doneStops(trip)
  const listed = running ? up : upcomingStops(trip)
  const pct = trip.stops.length ? Math.round((done.length / trip.stops.length) * 100) : 0
  const loaded = trip.status === "LOADED" || trip.status === "DEPARTED"
  // The trip is claimed at the depot: the phone must be there (or the driver confirms when GPS is unavailable).
  const departRadius = Math.max(250, config.arriveRadiusM * 2)
  const depotDist = gps.position ? distanceM(gps.position, trip.depot.position) : null
  const atDepot = depotDist != null && depotDist <= departRadius
  const gpsBlocked = !config.demo && (gps.permission === "denied" || gps.permission === "unsupported" || (!gps.position && !!gps.lastError))
  const canClaim = atDepot || (gpsBlocked && manual)
  // Depot gate: claim first, then dispatch (with the loader's claim) lets the trip out.
  const setClaim = async (on: boolean) => {
    setClaimBusy(true)
    setClaimError(null)
    try {
      await postClaim(trip.id, on)
      await refresh()
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Could not reach dispatch. Try again.")
    } finally {
      setClaimBusy(false)
    }
  }

  return (
    <div className="grid gap-3 p-4">
      {finishedToday.map((t) => (
        <CompletedCard key={t.id} trip={t} compact />
      ))}

      <section className="grid gap-3 rounded-2xl border bg-card p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{greeting(nowMin)}, {bundle.driver.name.split(" ")[0]}</p>
            <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              {trip.ref} <BrandBadge brand={trip.brand} />
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{trip.vehicle.label}</p>
            <p className="text-xs font-medium">{trip.vehicle.id}</p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {done.length} of {trip.stops.length} stops
            </span>
            <span className="text-muted-foreground tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
        {!running && (
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Depart" value={fmt(trip.plannedDepartMin)} icon={Timer} />
            <Mini label="Distance" value={`${trip.plannedKm} km`} icon={Gauge} />
            <Mini label="Duration" value={`${Math.floor(trip.plannedDurationMin / 60)}h ${trip.plannedDurationMin % 60}m`} icon={RouteIcon} />
          </div>
        )}
      </section>

      {!running && (
        <section className="grid gap-3 rounded-2xl border bg-card p-3.5">
          <div className="flex items-center gap-2">
            <Warehouse className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">{trip.depot.name}</p>
            {loaded ? (
              <TagBadge tone="green">
                <CircleCheck className="size-3" /> Loaded
              </TagBadge>
            ) : (
              <TagBadge tone="amber">{trip.status === "LOADING" ? "Loading now" : "Not loaded yet"}</TagBadge>
            )}
          </div>

          <div className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
            {atDepot ? (
              <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
                <CircleCheck className="size-4" /> You are at the depot. Claim your trip.
              </p>
            ) : (
              <>
                <p className="font-medium">Go to the depot to claim this trip</p>
                <p className="text-xs text-muted-foreground">
                  {depotDist != null ? `${fmtDistance(depotDist)} away. You can claim it within ${departRadius} m of the depot.` : gpsBlocked ? "Your location is not available." : "Finding your location…"}
                </p>
              </>
            )}
          </div>

          {!loaded && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" /> The loader has not released this trip. Check the load before you go.
            </p>
          )}

          <div className="grid gap-1.5 rounded-xl border px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className={cn("font-medium", trip.claimedAt && "text-emerald-700 dark:text-emerald-300")}>
                {trip.claimedAt ? (trip.released ? "Dispatch released the trip. You can start." : "Claimed. Waiting for dispatch to start the trip.") : "Claim this trip so dispatch knows you are ready."}
              </p>
              {trip.claimedAt ? (
                !trip.released && (
                  <Button variant="ghost" size="sm" disabled={claimBusy} onClick={() => setClaim(false)}>
                    Undo
                  </Button>
                )
              ) : (
                <Button size="sm" disabled={!canClaim || claimBusy} onClick={() => setClaim(true)}>
                  Claim
                </Button>
              )}
            </div>
            {claimError && <p className="text-xs text-destructive">{claimError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NavigateButton depot className={cn(atDepot && "opacity-70")}>
              To the depot
            </NavigateButton>
            <Button className="h-12 text-[15px]" disabled={!canClaim || !trip.released} onClick={() => setConfirmStart(true)}>
              <Play data-icon="inline-start" /> Start trip
            </Button>
          </div>

          {gpsBlocked && !manual && !atDepot && (
            <Button variant="ghost" className="h-10 text-muted-foreground" onClick={() => setManual(true)}>
              Can&apos;t get my location: I&apos;m at the depot
            </Button>
          )}
        </section>
      )}

      {running && next && <NextStopCard stop={next} index={nextIndex} total={trip.stops.length} />}

      {running && !next && (
        <section className="grid gap-3 rounded-2xl border bg-card p-3.5">
          <div className="flex items-center gap-2">
            <Flag className="size-4 text-primary" />
            <p className="text-sm font-semibold">All stops done. Head back to {trip.depot.name}.</p>
          </div>
          <Button className="h-12 text-[15px]" onClick={() => setConfirmEnd(true)}>
            Complete trip
          </Button>
        </section>
      )}

      {listed.length > 0 && (
        <>
          <SectionTitle>{running ? "Then" : `Stops · ${trip.stops.length}`}</SectionTitle>
          <div className="grid gap-2">
            {listed.map((s) => (
              <StopRow key={s.id} stop={s} index={trip.stops.indexOf(s)} from={gps.position} onClick={() => openStop(s.id)} />
            ))}
          </div>
        </>
      )}
      
      {done.length > 0 && (
        <>
          <SectionTitle>Done · {done.length}</SectionTitle>
          <div className="grid gap-2">
            {done.map((s) => (
              <StopRow key={s.id} stop={s} index={trip.stops.indexOf(s)} onClick={() => openStop(s.id)} />
            ))}
          </div>
        </>
      )}

      {running && (
        <Button variant="outline" className="h-11" onClick={() => openIssue(next?.id)}>
          <PackageX data-icon="inline-start" /> Report a problem
        </Button>
      )}

      <Confirm
        open={confirmStart}
        onOpenChange={setConfirmStart}
        title={`Start ${trip.ref}?`}
        description={
          <>
            Dispatch will see you on the road.{" "}
            {config.demo
              ? "Demo mode: your position is simulated along the route."
              : `Your location is shared every ${Math.round(config.pingSeconds / 60)} min while the trip runs. Keep this app open${gps.permission === "denied" ? " and allow location in your browser settings" : ""}.`}
          </>
        }
        confirmLabel="Start trip"
        onConfirm={startTrip}
      />
      <Confirm
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="Complete trip?"
        description={`You are back at ${trip.depot.name} and every stop is recorded.`}
        confirmLabel="Complete trip"
        onConfirm={completeTrip}
      />
    </div>
  )
}

function CompletedCard({ trip, compact }: { trip: ReturnType<typeof useDriver>["bundle"]["trips"][number]; compact?: boolean }) {
  const o = tripOutcome(trip)
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
      <span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
        <CircleCheck className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {trip.ref} complete <span className="font-normal text-muted-foreground">· {BRAND_LABEL[trip.brand]}</span>
        </p>
        {!compact && <p className="text-xs text-muted-foreground">Everything is recorded and shared with dispatch and the stores.</p>}
        <p className="text-xs text-muted-foreground">
          {o.delivered} delivered{o.partial ? ` · ${o.partial} partial` : ""}{o.refused ? ` · ${o.refused} refused` : ""}
        </p>
      </div>
    </div>
  )
}
