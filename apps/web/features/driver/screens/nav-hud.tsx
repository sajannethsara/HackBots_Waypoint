"use client"

import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, LocateFixed, RotateCw, Undo2, Volume2, VolumeX, WifiOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useDriver } from "../lib/driver-provider"
import { fmtDistance } from "../lib/model"
import { useNavigation } from "../lib/navigation-provider"
import { useNav } from "../nav"
import { fmt } from "../ui"

export function ManeuverIcon({ type, mod, className }: { type: string; mod: string | null; className?: string }) {
  const p = { className, strokeWidth: 2.25 }
  if (type === "arrive") return <Flag {...p} />
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn") return <RotateCw {...p} />
  switch (mod) {
    case "uturn":
      return <Undo2 {...p} />
    case "left":
      return <ArrowLeft {...p} />
    case "right":
      return <ArrowRight {...p} />
    case "sharp left":
      return <CornerUpLeft {...p} />
    case "sharp right":
      return <CornerUpRight {...p} />
    case "slight left":
      return <ArrowUpLeft {...p} />
    case "slight right":
      return <ArrowUpRight {...p} />
    default:
      return <ArrowUp {...p} />
  }
}

/** The next maneuver, large, at the top of the map. */
export function NavBanner() {
  const { target, route, guidance, loading, rerouting } = useNavigation()
  if (!target) return null
  const next = guidance?.next

  return (
    <div className="pointer-events-none absolute top-3 right-[4.25rem] left-3 z-10">
      <div className="pointer-events-auto grid gap-1.5 rounded-2xl bg-primary px-3.5 py-3 text-primary-foreground shadow-lg">
        {next && guidance ? (
          <div className="flex items-center gap-3">
            <ManeuverIcon type={next.type} mod={next.mod} className="size-10 shrink-0" />
            <div className="min-w-0">
              <p className="text-2xl leading-none font-semibold tabular-nums">{next.type === "arrive" && guidance.distToNext < 30 ? "Now" : fmtDistance(guidance.distToNext)}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-snug opacity-95">{next.text}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-sm">
            <Spinner /> {loading ? "Finding the best route…" : "Waiting for your location…"}
          </div>
        )}
        {(rerouting || route?.source === "planned" || route?.source === "straight") && (
          <p className="flex items-center gap-1.5 text-[11px] opacity-90">
            {rerouting ? (
              <>
                <Spinner className="size-3" /> Finding a new route…
              </>
            ) : route?.source === "planned" ? (
              <>
                <WifiOff className="size-3" /> Saved route, no signal needed
              </>
            ) : (
              <>
                <WifiOff className="size-3" /> No road data offline: following a straight line
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

/** Time left, distance, and the controls that matter while driving. */
export function NavPanel() {
  const { nowMin, arrive, trip } = useDriver()
  const { setTab, openStop } = useNav()
  const { target, guidance, arrived, voice, setVoice, follow, setFollow, stop } = useNavigation()
  if (!target) return null

  const min = guidance ? Math.max(1, Math.round(guidance.remainingSec / 60)) : null
  const stopObj = target.kind === "stop" ? trip?.stops.find((s) => s.id === target.id) : undefined

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
      <div className="pointer-events-auto grid gap-3 rounded-2xl border bg-card p-3.5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">{target.kind === "depot" ? "To the depot" : "To the next stop"}</p>
            <p className="truncate text-base font-semibold">{target.label}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {guidance && min != null ? `${min} min · ${fmtDistance(guidance.remainingM)} · arrive ${fmt(nowMin + min)}` : "Calculating…"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!follow && (
              <Button variant="outline" size="icon-lg" className="size-11" onClick={() => setFollow(true)} aria-label="Re-centre">
                <LocateFixed />
              </Button>
            )}
            <Button variant="outline" size="icon-lg" className="size-11" onClick={() => setVoice(!voice)} aria-label={voice ? "Mute voice" : "Turn voice on"}>
              {voice ? <Volume2 /> : <VolumeX />}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="outline" className="h-12 px-4" onClick={stop}>
            <X data-icon="inline-start" /> Exit
          </Button>
          {arrived ? (
            <Button
              className={cn("h-12 text-[15px]", "animate-pulse")}
              onClick={() => {
                if (stopObj) {
                  arrive(stopObj)
                  openStop(stopObj.id)
                } else setTab("trip")
                stop()
              }}
            >
              {target.kind === "depot" ? "I'm at the depot" : "I've arrived"}
            </Button>
          ) : (
            <p className="grid place-items-center text-center text-xs text-muted-foreground">{target.kind === "depot" ? "Claim the trip when you reach the depot" : "Arrival is detected automatically"}</p>
          )}
        </div>
      </div>
    </div>
  )
}
