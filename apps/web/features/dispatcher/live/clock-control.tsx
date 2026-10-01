"use client"

import { Pause, Play, RotateCcw } from "lucide-react"
import type { LiveClock } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { minToHHMM } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useClockControl, type LinkState } from "./use-live"

const SPEEDS = [1, 10, 30, 60]

const LINK: Record<LinkState, { label: string; dot: string; hint: string }> = {
  live: { label: "Live", dot: "bg-emerald-500", hint: "Receiving pushed updates over WebSocket" },
  connecting: { label: "Connecting", dot: "bg-amber-500", hint: "Opening the live connection" },
  offline: { label: "Offline", dot: "bg-red-500", hint: "Connection lost — retrying. Showing the last known positions." },
  paused: { label: "Paused", dot: "bg-muted-foreground", hint: "Tab hidden — live updates pause to save resources" },
}

/** Replay clock for the operating day + live connection state. */
export function ClockControl({ clock, link }: { clock?: LiveClock; link: LinkState }) {
  const control = useClockControl()
  const l = LINK[link]
  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-card p-1 pl-2.5 shadow-xs">
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
      <Button
        size="icon-sm"
        variant={clock?.running ? "secondary" : "default"}
        aria-label={clock?.running ? "Pause" : "Play"}
        disabled={control.isPending}
        onClick={() => control.mutate({ action: clock?.running ? "pause" : "play" })}
      >
        {clock?.running ? <Pause /> : <Play />}
      </Button>
      <div className="flex items-center rounded-md bg-muted p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => control.mutate({ action: "speed", value: s })}
            className={cn(
              "h-6 rounded px-1.5 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground",
              clock?.speed === s && "bg-background font-medium text-foreground shadow-xs",
            )}
          >
            {s}×
          </button>
        ))}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="Restart day" onClick={() => control.mutate({ action: "reset" })} />
          }
        >
          <RotateCcw />
        </TooltipTrigger>
        <TooltipContent>Restart the day from 03:15</TooltipContent>
      </Tooltip>
    </div>
  )
}
