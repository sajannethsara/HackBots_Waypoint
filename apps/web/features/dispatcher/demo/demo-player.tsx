"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FlaskConical, Pause, Play, Power, RotateCcw, ScrollText } from "lucide-react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import type { DemoFeedItem, DemoState } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkspace } from "@/hooks/use-workspace"
import { api, ApiError, qs } from "@/lib/api"
import { minToHHMM } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useClockControl } from "../live/use-live"

const SPEEDS = [1, 10, 30, 60]
const DOT: Record<DemoFeedItem["tone"], string> = { info: "bg-sky-500", good: "bg-emerald-500", warn: "bg-amber-500", alert: "bg-red-500" }

export function useDemo() {
  const { depotId, date, ready } = useWorkspace()
  return useQuery({
    queryKey: ["demo", depotId, date],
    queryFn: () => api<DemoState>(`/demo${qs({ depotId, date })}`),
    enabled: ready,
    refetchInterval: (q) => (q.state.data?.on ? 2_000 : 15_000),
  })
}

/** Everything a demo switch or restart can change, refreshed together. */
function useRefreshAll() {
  const qc = useQueryClient()
  return () => {
    for (const k of ["demo", "live", "plan", "exceptions", "issues", "orders", "trips"]) void qc.invalidateQueries({ queryKey: [k] })
  }
}

/** Demo switch + replay controls for the header. In real mode only the switch shows. */
export function DemoPlayer() {
  const { data: demo } = useDemo()
  const refresh = useRefreshAll()
  const clockControl = useClockControl()
  const toggle = useMutation({
    mutationFn: (on: boolean) => api("/demo", { method: "POST", json: { on } }),
    onSuccess: (_, on) => {
      refresh()
      toast(on ? "Demo day is ready" : "Real mode", { description: on ? "Publish a plan, then press play to start the day." : "Demo effects were removed. Live data comes from drivers." })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not switch demo mode"),
  })
  const restart = useMutation({
    mutationFn: () => api("/demo/restart", { method: "POST" }),
    onSuccess: refresh,
  })

  // The storyline also surfaces as toasts, but only for events that happen while the page is open.
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!demo) return
    if (!seen.current) {
      seen.current = new Set(demo.feed.map((f) => f.id))
      return
    }
    for (const f of [...demo.feed].reverse()) {
      if (seen.current.has(f.id)) continue
      seen.current.add(f.id)
      const fn = f.tone === "alert" ? toast.error : f.tone === "warn" ? toast.warning : f.tone === "good" ? toast.success : toast
      fn(`${minToHHMM(Math.floor(f.minute))} · ${f.title}`, { description: f.body, position: "bottom-right", duration: 8000 })
    }
  }, [demo])

  if (!demo) return null

  if (!demo.on)
    return (
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(true)} />}>
          <FlaskConical data-icon="inline-start" /> Demo
        </TooltipTrigger>
        <TooltipContent>Replay a dispatcher&apos;s day after the plan is published</TooltipContent>
      </Tooltip>
    )

  const { clock } = demo
  const idle = !demo.hasPlan
  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-card p-1 pl-2.5 shadow-xs">
      <Tooltip>
        <TooltipTrigger render={<span className="flex items-center gap-1.5 pr-1 text-xs font-medium text-violet-600 dark:text-violet-400" />}>
          <FlaskConical className="size-3.5" /> Demo
        </TooltipTrigger>
        <TooltipContent>The system is running a scripted day. Switch off for real mode.</TooltipContent>
      </Tooltip>
      <span className="h-5 w-px bg-border" />
      <span className="px-1.5 font-mono text-sm font-semibold tabular-nums">{minToHHMM(Math.floor(clock.minute))}</span>
      {idle ? (
        <span className="px-1.5 text-xs text-muted-foreground">Publish a plan to start the day</span>
      ) : (
        <>
          <Button
            size="icon-sm"
            variant={clock.running ? "secondary" : "default"}
            aria-label={clock.running ? "Pause" : "Play"}
            disabled={clockControl.isPending}
            onClick={() => clockControl.mutate({ action: clock.running ? "pause" : "play" }, { onSuccess: refresh })}
          >
            {clock.running ? <Pause /> : <Play />}
          </Button>
          <div className="flex items-center rounded-md bg-muted p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => clockControl.mutate({ action: "speed", value: s }, { onSuccess: refresh })}
                className={cn("h-6 rounded px-1.5 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground", clock.speed === s && "bg-background font-medium text-foreground shadow-xs")}
              >
                {s}×
              </button>
            ))}
          </div>
        </>
      )}
      <Tooltip>
        <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Restart day" disabled={restart.isPending} onClick={() => restart.mutate()} />}>
          <RotateCcw />
        </TooltipTrigger>
        <TooltipContent>Restart the day from 03:15 (gate, issues and clock reset)</TooltipContent>
      </Tooltip>
      <Popover>
        <PopoverTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Storyline" className="relative" />}>
          <ScrollText />
          {demo.feed.length > 0 && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-violet-500" />}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 gap-0 p-0">
          <p className="border-b px-3 py-2 text-xs font-medium">Today&apos;s storyline</p>
          <ScrollArea className="h-80">
            {demo.feed.length ? (
              <ol className="grid divide-y">
                {demo.feed.map((f) => (
                  <li key={f.id} className="grid grid-cols-[auto_1fr] gap-x-2.5 px-3 py-2">
                    <span className={cn("mt-1.5 size-2 rounded-full", DOT[f.tone])} />
                    <div className="grid gap-0.5">
                      <p className="text-xs font-medium">
                        <span className="mr-1.5 font-mono tabular-nums text-muted-foreground">{minToHHMM(Math.floor(f.minute))}</span>
                        {f.title}
                      </p>
                      <p className="text-[11px] leading-snug text-muted-foreground">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="p-6 text-center text-xs text-muted-foreground">Nothing has happened yet. Press play once the plan is published.</p>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Switch demo off" disabled={toggle.isPending} onClick={() => toggle.mutate(false)} />}>
          <Power />
        </TooltipTrigger>
        <TooltipContent>Switch off: back to real mode</TooltipContent>
      </Tooltip>
    </div>
  )
}
