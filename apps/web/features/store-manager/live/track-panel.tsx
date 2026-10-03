"use client"

import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { useState } from "react"
import { Map as MapIcon, MapPinOff } from "lucide-react"
import type { StoreLiveView } from "@waypoint/shared"
import { TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { minToHHMM } from "@/lib/format"
import { useStoreLive } from "./use-store-live"

const MapSkeleton = () => <Skeleton className="size-full rounded-none" />
const StoreLiveMap = dynamic(() => import("./store-live-map"), { ssr: false, loading: MapSkeleton })
const StoreLiveSchematic = dynamic(() => import("./store-live-schematic"), { ssr: false, loading: MapSkeleton })

/**
 * "Track live": where the vehicle bringing this order is right now. Shown inside the On the way card and on the
 * order page. The map only mounts while it is open, and polling only runs while it is open.
 */
export function TrackPanel({ orderId, mapboxToken, defaultOpen = true }: { orderId: string; mapboxToken?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  const { data: view, isLoading, isError } = useStoreLive(orderId, open)

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <MapIcon className="size-4" /> Live location
          </h2>
          {open && view && <Freshness view={view} />}
        </div>
        <Button size="xs" variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide map" : "Track live"}
        </Button>
      </div>

      {open && (
        <div className="relative h-[340px] overflow-hidden rounded-lg border bg-muted/30">
          {isLoading ? (
            <Skeleton className="size-full rounded-none" />
          ) : isError || !view ? (
            <div className="grid size-full place-content-center justify-items-center gap-2 p-6 text-center">
              <MapPinOff className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Live tracking isn’t available yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">It starts once dispatch has published today’s plan and your order is on a trip.</p>
            </div>
          ) : (
            <>
              {mapboxToken ? <StoreLiveMap view={view} token={mapboxToken} theme={theme} /> : <StoreLiveSchematic view={view} />}
              <Summary view={view} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Freshness({ view }: { view: StoreLiveView }) {
  const v = view.vehicle
  if (!v.departed) return <TagBadge tone="gray">Not left the depot yet</TagBadge>
  if (v.fromDriver) {
    const stale = (v.lastSeenMin ?? 0) > 10
    return (
      <>
        <TagBadge tone={stale ? "amber" : "green"}>{stale ? "Location is old" : "Live from the driver"}</TagBadge>
        <span className="text-xs text-muted-foreground">{v.lastSeenMin == null ? "no GPS yet" : v.lastSeenMin < 1 ? "just now" : `last seen ${v.lastSeenMin} min ago`}</span>
        {v.simulatedGps && <TagBadge tone="violet">Demo GPS</TagBadge>}
      </>
    )
  }
  return <TagBadge tone="violet">Demo simulation</TagBadge>
}

/** Small readout over the map: the one number a store cares about, and how it compares with plan. */
function Summary({ view }: { view: StoreLiveView }) {
  const arrived = view.stage === "ARRIVED"
  const done = view.stage === "DELIVERED" || view.stage === "RECEIVED"
  const late = view.delayMin >= 5
  return (
    <div className="pointer-events-none absolute top-3 left-3 rounded-lg border bg-background/90 px-3 py-2 text-sm shadow-lg backdrop-blur-md">
      {done ? (
        <p className="font-medium">Delivered</p>
      ) : arrived ? (
        <p className="font-medium">The vehicle is at your outlet</p>
      ) : (
        <>
          <p className="font-medium tabular-nums">
            Arriving about {minToHHMM(view.etaMin)}
            {late && <span className="ml-1.5 text-xs font-normal text-amber-600">{view.delayMin} min late</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {view.stopsBefore === 0 ? "You are the next stop" : `${view.stopsBefore} ${view.stopsBefore === 1 ? "stop" : "stops"} before you`}
          </p>
        </>
      )}
    </div>
  )
}
