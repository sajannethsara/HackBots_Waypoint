"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowRight, Clock, Lock, MapPin, Package, Play, Search, Snowflake, TriangleAlert, Undo2, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { minToHHMM, type LoaderQueueFilter, type LoaderTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge, TONE } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMe } from "@/hooks/use-session"
import { ApiError } from "@/lib/api"
import { fmtKg, fmtM3 } from "@/lib/format"
import { cn } from "@/lib/utils"
import { cargoSpec, claimState, destination, isFlagged, statusPill, stowedLoad, type ClaimState } from "./model"
import { useClaimTrip, useLoaderQueue, useUnclaimTrip } from "./queries"

type Tab = "all" | "mine" | "unclaimed" | "locked" | "flagged"
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "My vehicles" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "locked", label: "Locked" },
  { id: "flagged", label: "Flagged" },
]
/** Tabs with their own server filter; All and Locked are read from the full list. */
const SERVER_FILTER: Record<Tab, LoaderQueueFilter> = { all: "all", mine: "mine", unclaimed: "unclaimed", locked: "all", flagged: "flagged" }

export function LoaderQueuePage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "all") as Tab
  const [q, setQ] = useState("")
  const { data: me } = useMe()

  const all = useLoaderQueue("all")
  const filtered = useLoaderQueue(SERVER_FILTER[tab])
  const counts = useMemo(() => {
    const trips = all.data ?? []
    const state = (t: LoaderTrip) => claimState(t, me?.id)
    return {
      all: trips.length,
      mine: trips.filter((t) => t.claimedBy?.id === me?.id).length,
      unclaimed: trips.filter((t) => state(t) === "unclaimed").length,
      locked: trips.filter((t) => state(t) === "locked").length,
      flagged: trips.filter(isFlagged).length,
    } satisfies Record<Tab, number>
  }, [all.data, me?.id])

  const trips = useMemo(() => {
    let list = filtered.data ?? []
    if (tab === "locked") list = list.filter((t) => claimState(t, me?.id) === "locked")
    const needle = q.trim().toLowerCase()
    if (needle) list = list.filter((t) => [t.vehicle.id, t.ref, destination(t), ...t.stops.map((s) => s.outlet.name)].some((v) => v.toLowerCase().includes(needle)))
    return list
  }, [filtered.data, tab, q, me?.id])

  const setTab = (t: Tab) => router.replace(t === "all" ? pathname : `${pathname}?tab=${t}`, { scroll: false })

  return (
    <div className="grid gap-4">
      <PageHeader title="Loading Queue" description="Vehicles on today's published plan at your depot, ready for loading and dock staging." />

      <Card className="flex-row flex-wrap items-center gap-3 px-3 py-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className={cn("gap-1.5 px-2.5", t.id === "flagged" && counts.flagged > 0 && "text-destructive")}>
                {t.label}
                <span className={cn("text-xs tabular-nums", t.id === "flagged" && counts.flagged > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {all.data ? counts[t.id] : "·"}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vehicle ID or destination…" className="h-8 pl-8" />
        </div>
      </Card>

      {filtered.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : filtered.isError ? (
        <QueueEmpty icon={TriangleAlert} title="Could not load the queue" description={filtered.error.message} />
      ) : trips.length === 0 ? (
        <QueueEmpty
          icon={Package}
          title={q ? "No vehicles match your search" : EMPTY[tab].title}
          description={q ? "Try a vehicle ID, trip ref or outlet name." : EMPTY[tab].description}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {trips.map((t) => (
            <TripCard key={t.id} trip={t} state={claimState(t, me?.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

const EMPTY: Record<Tab, { title: string; description: string }> = {
  all: { title: "No vehicles to load today", description: "Trips appear here once dispatch publishes today's plan for your depot." },
  mine: { title: "You have no vehicles claimed", description: "Start loading an unclaimed vehicle to see it here." },
  unclaimed: { title: "Every vehicle is claimed", description: "Nothing is waiting for a loader right now." },
  locked: { title: "No vehicles locked by other loaders", description: "Vehicles another loader is working on show here." },
  flagged: { title: "No flagged vehicles", description: "Vehicles with an open loading issue show here." },
}

function QueueEmpty({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Empty className="min-h-[40vh] border bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function TripCard({ trip, state }: { trip: LoaderTrip; state: ClaimState }) {
  const router = useRouter()
  const claim = useClaimTrip()
  const unclaim = useUnclaimTrip()
  const pill = statusPill(trip, state)
  const flagged = isFlagged(trip)
  const load = stowedLoad(trip)
  const open = () => router.push(`/loader/vehicles/${trip.id}`)

  const onClaim = () =>
    claim.mutate(trip.id, {
      onSuccess: open,
      onError: (err) =>
        toast.error(err instanceof ApiError && err.status === 409 ? `${trip.vehicle.id} was just claimed by another loader` : err.message, {
          description: err instanceof ApiError && err.status === 409 ? "The queue has been refreshed." : undefined,
        }),
    })
  const onUnclaim = () =>
    unclaim.mutate(trip.id, {
      onSuccess: () => toast.success(`${trip.vehicle.id} unclaimed and back in the queue`),
      onError: (err) => toast.error(err.message),
    })

  return (
    <Card className={cn("gap-0 p-0", state === "locked" && "bg-muted/40")}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="text-base font-semibold tracking-tight">{trip.vehicle.id}</h3>
        <BrandBadge brand={trip.brand} />
        <TagBadge>Trip {trip.tripNo}</TagBadge>
        <span className="ml-auto">
          <TagBadge tone={pill.tone}>
            {state === "locked" && !flagged && <Lock className="size-3" />}
            {flagged && <TriangleAlert className="size-3" />}
            {pill.label}
          </TagBadge>
        </span>
      </div>

      <div className="grid gap-2 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Tile icon={trip.vehicle.temp === "REEFER" ? Snowflake : Package} tone={trip.vehicle.temp === "REEFER" ? "blue" : "gray"} label="Cargo spec" value={cargoSpec(trip)} />
          <Tile icon={MapPin} tone={flagged ? "red" : "green"} label="Destination" value={destination(trip)} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" /> Departure
            <span className={cn("font-semibold tabular-nums", flagged ? "text-destructive" : state === "mine" ? "text-primary" : "text-foreground")}>
              {minToHHMM(trip.plannedDepartMin)}
            </span>
          </span>
          <span className="text-muted-foreground">
            {trip.stops.length} {trip.stops.length === 1 ? "order" : "orders"} ({fmtKg(trip.loadWeightKg)} / {fmtM3(trip.loadVolumeM3)})
          </span>
        </div>
        {flagged && (
          <p className="flex items-start gap-1.5 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">
              {trip.issues[0].ref}: {trip.issues[0].description}
              {trip.issues.length > 1 && ` (+${trip.issues.length - 1} more)`}
            </span>
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {state === "mine" && `${load.stowed} of ${trip.stops.length} stops stowed`}
          {state === "unclaimed" && "Ready for loading"}
          {state === "locked" && `Loading by ${trip.claimedBy?.name ?? "another loader"}`}
          {state === "done" && pill.label}
        </p>
        <div className="flex items-center gap-2">
          {flagged && (
            <Button variant="destructive" size="sm" render={<Link href="/loader/inbox?view=issues" />}>
              <TriangleAlert /> View issue
            </Button>
          )}
          {state === "unclaimed" && (
            <Button variant="outline" size="sm" onClick={onClaim} disabled={claim.isPending}>
              <Play /> {claim.isPending ? "Claiming…" : "Start loading"}
            </Button>
          )}
          {state === "mine" && (
            <>
              <Button variant="ghost" size="sm" onClick={onUnclaim} disabled={unclaim.isPending}>
                <Undo2 /> {unclaim.isPending ? "Unclaiming…" : "Unclaim"}
              </Button>
              <Button size="sm" onClick={open}>
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
            <Button variant="outline" size="sm" render={<Link href={`/loader/vehicles/${trip.id}/released`} />}>
              Receipt <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function Tile({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: keyof typeof TONE; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", TONE[tone])}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
