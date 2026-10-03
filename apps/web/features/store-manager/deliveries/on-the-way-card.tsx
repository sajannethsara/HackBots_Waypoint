"use client"

import Link from "next/link"
import { Clock, MapPin, MessageSquare, Phone, Truck, Users } from "lucide-react"
import { DELIVERY_STAGE_LABEL, DELIVERY_STAGES, type StoreOnTheWay } from "@waypoint/shared"
import { TagBadge } from "@/components/shared/badges"
import { Stepper } from "@/components/shared/stepper"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useChatSheet } from "@/features/chat/chat-sheet"
import { minToHHMM } from "@/lib/format"
import { TrackPanel } from "../live/track-panel"

const STEPS = DELIVERY_STAGES.map((s) => ({ key: s, label: DELIVERY_STAGE_LABEL[s] }))

const HEADLINE: Record<string, string> = {
  PLANNED: "Scheduled for today",
  LOADED: "Loaded and about to leave",
  ON_THE_WAY: "On the way to you",
  ARRIVED: "The driver is at your door",
  DELIVERED: "Delivered",
  RECEIVED: "Received",
}

/** The delivery the store is waiting for: vehicle, driver, arrival time, how many stops come first, and a tracker. */
export function OnTheWayCard({ d, mapboxToken }: { d: StoreOnTheWay; mapboxToken?: string }) {
  const { open } = useChatSheet()
  const stage = STEPS.findIndex((s) => s.key === d.stage)
  const late = d.delayMin >= 5
  const early = d.delayMin <= -5
  const hasWindow = d.windowCloseMin > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-4" /> {HEADLINE[d.stage]}
            {d.live && (
              <span className="flex items-center gap-1 text-[11px] font-normal text-emerald-600">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            )}
          </CardTitle>
          <Link href={`/store-manager/orders/${d.orderId}`} className="text-sm font-medium hover:underline">
            {d.orderRef}
          </Link>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info icon={Clock} label={d.stage === "PLANNED" || d.stage === "LOADED" ? "Planned arrival" : "Arriving about"}>
            <span className="text-lg font-semibold tabular-nums">{minToHHMM(d.etaMin)}</span>
            {late && <TagBadge tone="amber">{d.delayMin} min late</TagBadge>}
            {early && <TagBadge tone="green">{-d.delayMin} min early</TagBadge>}
            {!late && !early && <TagBadge tone="green">On time</TagBadge>}
          </Info>
          <Info icon={Truck} label="Vehicle">
            <span className="font-medium">{d.vehicleId}</span>
            <span className="text-xs text-muted-foreground">{d.vehicleLabel}</span>
          </Info>
          <Info icon={Users} label="Driver">
            <span className="font-medium">{d.driver?.name ?? "Not assigned"}</span>
            {d.driver?.phone && (
              <a href={`tel:${d.driver.phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Phone className="size-3" /> {d.driver.phone}
              </a>
            )}
          </Info>
          <Info icon={MapPin} label="Stops before you">
            <span className="text-lg font-semibold tabular-nums">{d.stopsBefore}</span>
            {d.totalStops > 0 && <span className="text-xs text-muted-foreground">of {d.totalStops} on this trip</span>}
          </Info>
        </div>

        <Stepper steps={STEPS} current={Math.max(0, stage)} className="px-1" />

        <TrackPanel key={d.orderId} orderId={d.orderId} mapboxToken={mapboxToken} defaultOpen={d.stage === "ON_THE_WAY" || d.stage === "ARRIVED"} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {hasWindow ? `Your receiving window is ${minToHHMM(d.windowOpenMin)}–${minToHHMM(d.windowCloseMin)}. ` : ""}
            {d.units} units · {d.items} items · {d.tripRef}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => open({})}>
              <MessageSquare data-icon="inline-start" /> Message dispatch
            </Button>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/store-manager/orders/${d.orderId}`} />}>
              View order
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Info({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" /> {label}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  )
}
