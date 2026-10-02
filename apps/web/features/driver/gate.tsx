"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, CircleDashed, Download, MapPin, Route, Smartphone, TriangleAlert, WifiOff } from "lucide-react"
import type { DriverBundle } from "@waypoint/shared"
import { Wordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { fetchBundle, fetchMe, OfflineError, SessionError } from "./lib/driver-api"
import { kvGet, kvSet } from "./lib/idb"
import { preloadAll } from "./lib/lazy"
import { currentTrip } from "./lib/model"
import { cacheLoadedAssets, registerServiceWorker, warmMapTiles, type SwState } from "./lib/offline"

/**
 * Before the driver reaches any feature, the phone downloads what it needs to work with no signal:
 * the app code, today's trips and the map around the route. After a first successful run the gate
 * stays out of the way (and keeps refreshing in the background) until the next sign-in or 12 hours.
 */

type Status = "idle" | "running" | "ok" | "warn" | "error"
interface StepState {
  status: Status
  detail?: string
}

const STAMP_KEY = "ready"
const UID_KEY = "wp_driver_uid"
const FRESH_MS = 12 * 60 * 60 * 1000

export interface Booted {
  userId: string
  name: string
  bundle: DriverBundle
}

export function Gate({ mapboxToken, children }: { mapboxToken?: string; children: (b: Booted) => React.ReactNode }) {
  const router = useRouter()
  const [booted, setBooted] = useState<Booted | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [steps, setSteps] = useState<Record<"app" | "trip" | "map" | "gps", StepState>>({
    app: { status: "idle" },
    trip: { status: "idle" },
    map: { status: "idle" },
    gps: { status: "idle" },
  })
  const [progress, setProgress] = useState(0)
  const [name, setName] = useState("")
  const [offline, setOffline] = useState(false)
  const [bootObj, setBootObj] = useState<Booted | null>(null)
  const [gpsAsk, setGpsAsk] = useState(false)
  const started = useRef(false)

  const set = useCallback((k: keyof typeof steps, s: StepState) => setSteps((p) => ({ ...p, [k]: s })), [])

  const run = useCallback(async () => {
    setFatal(null)
    // ── Who is this phone for? ──
    let userId = localStorage.getItem(UID_KEY)
    let who = localStorage.getItem(`${UID_KEY}_name`) ?? ""
    let online = navigator.onLine
    if (online) {
      try {
        const me = await fetchMe()
        if (me.role !== "DRIVER") return router.replace("/login")
        userId = me.id
        who = me.name
        localStorage.setItem(UID_KEY, me.id)
        localStorage.setItem(`${UID_KEY}_name`, me.name)
      } catch (e) {
        if (e instanceof SessionError) return router.replace("/login?next=/driver")
        online = false
      }
    }
    setOffline(!online)
    if (!userId) {
      setFatal("Connect to the internet once to sign in. After that Waypoint works without signal.")
      return
    }
    setName(who)

    // Fresh install on this phone recently? Open straight away and refresh in the background.
    const [stamp, saved] = await Promise.all([kvGet<{ at: number }>(userId, STAMP_KEY), kvGet<DriverBundle>(userId, "bundle")])
    const fresh = stamp && Date.now() - stamp.at < FRESH_MS && saved
    if (fresh && saved) {
      const b = { userId, name: who, bundle: saved }
      setBooted(b)
      void (async () => {
        await registerServiceWorker()
        await preloadAll().catch(() => {})
        await cacheLoadedAssets()
      })()
      return
    }

    // ── 1. App files ──
    set("app", { status: "running" })
    const sw: SwState = await registerServiceWorker()
    if (sw === "ready" && !navigator.serviceWorker.controller && !sessionStorage.getItem("wp_sw_reload")) {
      sessionStorage.setItem("wp_sw_reload", "1")
      return location.reload()
    }
    try {
      await preloadAll()
      const cached = await cacheLoadedAssets()
      set("app", {
        status: sw === "ready" ? "ok" : "warn",
        detail: sw === "ready" ? (cached ? "Saved to this phone" : "Ready") : sw === "unsupported" ? "Offline mode needs a secure (HTTPS) connection" : "Offline mode unavailable on this browser",
      })
    } catch {
      set("app", online ? { status: "error", detail: "Could not load the app files" } : { status: "error", detail: "Open the app once with a connection" })
      if (!online) return setFatal("This phone has not saved Waypoint yet. Connect to the internet and open the app once.")
    }
    setProgress(30)

    // ── 2. Today's trip ──
    set("trip", { status: "running" })
    let bundle: DriverBundle | undefined
    if (online) {
      try {
        bundle = await fetchBundle()
        await kvSet(userId, "bundle", bundle)
      } catch (e) {
        if (e instanceof SessionError) return router.replace("/login?next=/driver")
        if (!(e instanceof OfflineError)) console.error(e)
      }
    }
    bundle ??= saved
    if (!bundle) {
      set("trip", { status: "error", detail: "No saved trip on this phone" })
      return setFatal("Could not download today's trip. Check your connection and try again.")
    }
    const trip = currentTrip(bundle)
    set("trip", {
      status: bundle === saved && online ? "warn" : "ok",
      detail: !trip ? "No trip assigned today" : `${trip.ref} · ${trip.stops.length} stops saved`,
    })
    setProgress(60)

    // ── 3. Map ──
    if (!trip) set("map", { status: "ok", detail: "Nothing to download" })
    else if (!mapboxToken) set("map", { status: "warn", detail: "Using the route diagram (no map key)" })
    else if (!online) set("map", { status: "warn", detail: "Needs a connection" })
    else {
      set("map", { status: "running", detail: "Downloading map along your route…" })
      const n = await warmMapTiles(mapboxToken, trip, (d, t) => {
        setProgress(60 + Math.round((d / t) * 30))
        set("map", { status: "running", detail: `Downloading map along your route… ${d}/${t}` })
      })
      set("map", n ? { status: "ok", detail: "Route map saved" } : { status: "warn", detail: "Map will load when you have signal" })
    }
    setProgress(92)

    // ── 4. Location ──
    if (bundle.config.demo) set("gps", { status: "ok", detail: "Simulated (demo mode)" })
    else if (!window.isSecureContext || !("geolocation" in navigator)) set("gps", { status: "warn", detail: "Needs a secure (HTTPS) connection" })
    else {
      const state = await navigator.permissions?.query({ name: "geolocation" }).then((p) => p.state).catch(() => "prompt" as const)
      if (state === "granted") set("gps", { status: "ok", detail: "Location allowed" })
      else if (state === "denied") set("gps", { status: "warn", detail: "Blocked: enable location in browser settings" })
      else {
        set("gps", { status: "warn", detail: "Allow location so dispatch can see your progress" })
        setGpsAsk(true)
      }
    }
    setProgress(100)
    await kvSet(userId, STAMP_KEY, { at: Date.now() })
    setBootObj({ userId, name: who, bundle })
  }, [mapboxToken, router, set])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  // Continue automatically when nothing needs the driver's attention.
  const allGood = bootObj && Object.values(steps).every((s) => s.status === "ok")
  useEffect(() => {
    if (allGood && bootObj) {
      const t = setTimeout(() => setBooted(bootObj), 700)
      return () => clearTimeout(t)
    }
  }, [allGood, bootObj])

  if (booted) return <>{children(booted)}</>

  const allowLocation = () => {
    navigator.geolocation.getCurrentPosition(
      () => {
        set("gps", { status: "ok", detail: "Location allowed" })
        setGpsAsk(false)
      },
      () => {
        set("gps", { status: "warn", detail: "Blocked: enable location in browser settings" })
        setGpsAsk(false)
      },
      { timeout: 15_000 },
    )
  }

  const rows: { key: keyof typeof steps; icon: typeof Download; title: string }[] = [
    { key: "app", icon: Smartphone, title: "App on this phone" },
    { key: "trip", icon: Route, title: "Today's trip and stops" },
    { key: "map", icon: MapPin, title: "Map along your route" },
    { key: "gps", icon: MapPin, title: "Location sharing" },
  ]

  return (
    <main className="flex min-h-svh flex-col bg-muted/30 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6">
        <div className="grid justify-items-center gap-2 text-center">
          <Wordmark />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">{name ? `Getting ready, ${name.split(" ")[0]}` : "Getting ready"}</h1>
          <p className="text-sm text-muted-foreground">
            Saving the app, your route and the map to this phone so it keeps working when the signal drops.
          </p>
        </div>

        {offline && !fatal && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <WifiOff className="size-3.5 shrink-0" /> You are offline. Using what is already saved on this phone.
          </div>
        )}

        <div className="grid gap-1 rounded-xl border bg-card p-1.5">
          {rows.map((r) => (
            <StepRow key={r.key} icon={r.icon} title={r.title} state={steps[r.key]} />
          ))}
        </div>

        <Progress value={progress} />

        {fatal ? (
          <div className="grid gap-3">
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {fatal}
            </p>
            <Button
              className="h-11"
              onClick={() => {
                started.current = true
                void run()
              }}
            >
              Try again
            </Button>
          </div>
        ) : bootObj ? (
          <div className="grid gap-2">
            {gpsAsk && (
              <Button variant="outline" className="h-11" onClick={allowLocation}>
                <MapPin data-icon="inline-start" /> Allow location
              </Button>
            )}
            <Button className="h-12 text-base" onClick={() => setBooted(bootObj)}>
              {Object.values(steps).some((s) => s.status === "warn") ? "Continue anyway" : "Open Waypoint"}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  )
}

function StepRow({ icon: Icon, title, state }: { icon: typeof Download; title: string; state: StepState }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          state.status === "ok" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
          state.status === "warn" && "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
          state.status === "error" && "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
          (state.status === "idle" || state.status === "running") && "bg-muted text-muted-foreground",
        )}
      >
        {state.status === "running" ? <Spinner /> : state.status === "ok" ? <Check className="size-4" /> : state.status === "warn" || state.status === "error" ? <TriangleAlert className="size-4" /> : <CircleDashed className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {state.detail && <p className="truncate text-xs text-muted-foreground">{state.detail}</p>}
      </div>
      <Icon className="size-4 shrink-0 text-muted-foreground/50" />
    </div>
  )
}
