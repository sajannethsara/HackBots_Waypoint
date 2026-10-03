"use client"

import { CircleCheck, CircleX, Clock, CloudCheck, CloudUpload, MapPin, Navigation, RefreshCw, Snowflake, TriangleAlert, WifiOff } from "lucide-react"
import { minToHHMM, type DriverStop, type DriverStopStatus, type LatLng } from "@waypoint/shared"
import { TagBadge, type Tone } from "@/components/shared/badges"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { distanceM, fmtDistance, stopTiming } from "./lib/model"
import { useNavigation } from "./lib/navigation-provider"
import { useNav } from "./nav"

export const fmt = (m: number | null | undefined) => minToHHMM(m)

const STOP_TONE: Record<DriverStopStatus, { tone: Tone; label: string }> = {
  PENDING: { tone: "gray", label: "Pending" },
  ARRIVED: { tone: "violet", label: "At outlet" },
  DELIVERED: { tone: "green", label: "Delivered" },
  PARTIAL: { tone: "amber", label: "Partial" },
  REFUSED: { tone: "red", label: "Refused" },
  SKIPPED: { tone: "gray", label: "Skipped" },
}

export function StopStatusChip({ status }: { status: DriverStopStatus }) {
  const m = STOP_TONE[status]
  return <TagBadge tone={m.tone}>{m.label}</TagBadge>
}

export function ChilledChip() {
  return (
    <TagBadge tone="blue">
      <Snowflake className="size-3" /> Chilled
    </TagBadge>
  )
}

export function TimingChip({ stop, nowMin, from }: { stop: DriverStop; nowMin: number; from?: LatLng | null }) {
  const t = stopTiming(stop, nowMin, from)
  return (
    <TagBadge tone={t.tone === "ok" ? "green" : t.tone === "warn" ? "amber" : "red"}>
      {t.tone === "ok" ? <CircleCheck className="size-3" /> : <Clock className="size-3" />} {t.label}
    </TagBadge>
  )
}

export function StopNumber({ n, status, active }: { n: number; status: DriverStopStatus; active?: boolean }) {
  const done = status === "DELIVERED" || status === "PARTIAL" || status === "REFUSED" || status === "SKIPPED"
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ring-1 ring-inset",
        done && status === "DELIVERED" && "bg-emerald-600 text-white ring-emerald-600",
        done && status === "PARTIAL" && "bg-amber-500 text-white ring-amber-500",
        done && (status === "REFUSED" || status === "SKIPPED") && "bg-red-500 text-white ring-red-500",
        !done && active && "bg-primary text-primary-foreground ring-primary",
        !done && !active && "bg-muted text-muted-foreground ring-border",
      )}
    >
      {done ? (status === "REFUSED" || status === "SKIPPED" ? <CircleX className="size-4" /> : <CircleCheck className="size-4" />) : n}
    </span>
  )
}

/** One stop in a list: number, outlet, window, status. */
export function StopRow({ stop, index, active, onClick, from }: { stop: DriverStop; index: number; active?: boolean; onClick: () => void; from?: LatLng | null }) {
  const done = stop.status === "DELIVERED" || stop.status === "PARTIAL" || stop.status === "REFUSED" || stop.status === "SKIPPED"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors active:bg-muted",
        active && "border-primary/40 ring-1 ring-primary/20",
        done && "opacity-75",
      )}
    >
      <StopNumber n={index + 1} status={stop.status} active={active} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{stop.outlet.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {done && stop.completedAt
            ? `Done ${clock(stop.completedAt)}`
            : `${fmt(stop.windowOpenMin)}–${fmt(stop.windowCloseMin)} · ${stop.units} items`}
          {!done && from ? ` · ${fmtDistance(distanceM(from, stop.outlet.position))}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {stop.chilled && !done && <Snowflake className="size-3.5 text-sky-600 dark:text-sky-400" aria-label="Chilled" />}
        {done && <StopStatusChip status={stop.status} />}
      </div>
    </button>
  )
}

/** Starts turn-by-turn navigation inside the app (map tab), to a stop or to the depot. */
export function NavigateButton({ stop, depot, className, children }: { stop?: DriverStop; depot?: boolean; className?: string; children?: React.ReactNode }) {
  const nav = useNavigation()
  const { overlay, close } = useNav()
  return (
    <button
      type="button"
      onClick={() => {
        if (overlay) close()
        if (depot) nav.startDepot()
        else if (stop) nav.startStop(stop)
      }}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-background px-4 text-[15px] font-medium transition-colors active:bg-muted dark:bg-input/30",
        className,
      )}
    >
      <Navigation className="size-4" /> {children ?? "Navigate"}
    </button>
  )
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0.5 pt-1">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {aside}
    </div>
  )
}

export function Mini({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: typeof MapPin }) {
  return (
    <div className="grid gap-0.5 rounded-lg bg-muted/60 px-2.5 py-2">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {Icon && <Icon className="size-3" />} {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export type LinkState = { kind: "online" | "offline" | "syncing" | "attention" | "expired" | "waiting"; label: string }

export function linkState(o: { online: boolean; syncing: boolean; pending: number; failed: number; expired: boolean }): LinkState {
  if (o.expired) return { kind: "expired", label: "Sign in to sync" }
  if (o.failed) return { kind: "attention", label: `${o.failed} need attention` }
  if (!o.online) return { kind: "offline", label: o.pending ? `Offline · ${o.pending} saved` : "Offline" }
  if (o.syncing) return { kind: "syncing", label: "Syncing…" }
  if (o.pending) return { kind: "waiting", label: `${o.pending} waiting` }
  return { kind: "online", label: "All synced" }
}

/** Sync state as a single icon (header). `SyncChip` below adds the words. */
export function SyncIcon({ state, onClick }: { state: LinkState; onClick?: () => void }) {
  const color: Record<LinkState["kind"], string> = {
    online: "text-emerald-600 dark:text-emerald-400",
    syncing: "text-sky-600 dark:text-sky-400",
    waiting: "text-amber-600 dark:text-amber-400",
    offline: "text-amber-600 dark:text-amber-400",
    attention: "text-red-600 dark:text-red-400",
    expired: "text-red-600 dark:text-red-400",
  }
  const Icon = { online: CloudCheck, syncing: RefreshCw, waiting: CloudUpload, offline: WifiOff, attention: TriangleAlert, expired: TriangleAlert }[state.kind]
  return (
    <button type="button" onClick={onClick} title={state.label} aria-label={state.label} className={cn("grid size-9 place-items-center rounded-full active:bg-muted", color[state.kind])}>
      <Icon className={cn("size-5", state.kind === "syncing" && "animate-spin")} />
    </button>
  )
}

export function SyncChip({ state, onClick }: { state: LinkState; onClick?: () => void }) {
  const tone: Record<LinkState["kind"], string> = {
    online: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
    syncing: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300",
    waiting: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
    offline: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
    attention: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300",
    expired: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300",
  }
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset", tone[state.kind])}>
      {state.kind === "syncing" ? <Spinner className="size-3" /> : state.kind === "offline" ? <WifiOff className="size-3" /> : state.kind === "attention" || state.kind === "expired" ? <TriangleAlert className="size-3" /> : <span className={cn("size-1.5 rounded-full", state.kind === "online" ? "bg-emerald-500" : "bg-amber-500")} />}
      {state.label}
    </button>
  )
}

/** Device clock time as HH:MM (24 h), matching the planned times shown elsewhere. */
export const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—")
