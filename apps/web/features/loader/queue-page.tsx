"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { Clock, Lock, MapPin, Package, Search, Snowflake, TriangleAlert, type LucideIcon } from "lucide-react"
import { minToHHMM, type LoaderQueueFilter, type LoaderTrip } from "@waypoint/shared"
import { BrandBadge, TagBadge, TONE } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMe } from "@/hooks/use-session"
import { fmtKg, fmtM3 } from "@/lib/format"
import { cn } from "@/lib/utils"
import { cargoSpec, claimState, destination, isFlagged, statusPill, stowedLoad, type ClaimState } from "./model"
import { useQueueTabPref } from "./prefs"
import { TOUCH_MENU } from "./touch"
import { useLoaderQueue } from "./queries"
import { TripActions } from "./trip-actions"

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
  // The URL wins (links and the sidebar name a tab); otherwise the tab chosen in Settings.
  const [defaultTab] = useQueueTabPref()
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? defaultTab) as Tab
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

  const setTab = (t: Tab) => router.replace(t === defaultTab ? pathname : `${pathname}?tab=${t}`, { scroll: false })

  return (
    // Two columns only when the content area (not the screen) has room: a landscape tablet with the sidebar open gets one.
    <div className="@container grid gap-4">
      <PageHeader title="Loading Queue" description="Vehicles on today's published plan at your depot, ready for loading and dock staging." />

      <Card className="flex-row flex-wrap items-center gap-3 px-3 py-2">
        {/* Narrow screens: one dropdown instead of five tabs that would overflow. */}
        <Select value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <SelectTrigger className="w-full @2xl:hidden" aria-label="Show vehicles">
            <SelectValue>
              {(v: Tab) => `Show: ${TABS.find((t) => t.id === v)?.label ?? ""}${all.data ? ` (${counts[v]})` : ""}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className={TOUCH_MENU}>
            {TABS.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
                <span className={cn("ml-auto text-xs tabular-nums", t.id === "flagged" && counts.flagged > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {all.data ? counts[t.id] : "·"}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="hidden @2xl:flex">
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
        <div className="relative ml-auto w-full @2xl:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vehicle ID or destination…" className="h-8 pl-8" />
        </div>
      </Card>

      {filtered.isLoading ? (
        <div className="grid gap-4 @4xl:grid-cols-2">
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
        <div className="grid gap-4 @4xl:grid-cols-2">
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
  const pill = statusPill(trip, state)
  const flagged = isFlagged(trip)
  const load = stowedLoad(trip)

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
        <TripActions trip={trip} state={state} />
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
