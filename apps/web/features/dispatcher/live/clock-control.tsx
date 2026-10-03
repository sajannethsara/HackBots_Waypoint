"use client"

import type { LiveClock } from "@waypoint/shared"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { minToHHMM } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { LinkState } from "./use-live"

const LINK: Record<LinkState, { label: string; dot: string; hint: string }> = {
  live: { label: "Live", dot: "bg-emerald-500", hint: "Receiving pushed updates over WebSocket" },
  connecting: { label: "Connecting", dot: "bg-amber-500", hint: "Opening the live connection" },
  offline: { label: "Offline", dot: "bg-red-500", hint: "Connection lost — retrying. Showing the last known positions." },
  paused: { label: "Paused", dot: "bg-muted-foreground", hint: "Tab hidden — live updates pause to save resources" },
}

/** Live connection state and the operating-day clock. Replay controls (demo mode) live in the header. */
export function ClockControl({ clock, link }: { clock?: LiveClock; link: LinkState }) {
  const l = LINK[link]
  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-card p-1 px-2.5 shadow-xs">
      <Tooltip>
        <TooltipTrigger render={<span className="flex items-center gap-1.5 pr-1 text-xs" />}>
          <span className="relative flex size-2">
            {link === "live" && clock?.running && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", l.dot)} />}
            <span className={cn("relative size-2 rounded-full", l.dot)} />
          </span>
          {l.label}
        </TooltipTrigger>
        <TooltipContent>{l.hint}</TooltipContent>
      </Tooltip>
      <span className="h-5 w-px bg-border" />
      <span className="px-1.5 font-mono text-sm font-semibold tabular-nums">{clock ? minToHHMM(Math.floor(clock.minute)) : "--:--"}</span>
    </div>
  )
}
