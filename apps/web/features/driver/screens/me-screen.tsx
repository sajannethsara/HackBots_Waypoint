"use client"

import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { CloudDownload, LogOut, MapPin, Moon, RefreshCw, Smartphone, Truck, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { TagBadge } from "@/components/shared/badges"
import { cn } from "@/lib/utils"
import { postLogout } from "../lib/driver-api"
import { useDriver } from "../lib/driver-provider"
import type { OutboxItem } from "../lib/idb"
import { useInstall } from "../lib/use-install"
import { cacheStatus, type CacheStatus } from "../lib/offline"
import { Confirm } from "../nav"
import { clock, linkState, SectionTitle, SyncChip } from "../ui"

const EVENT_LABEL: Record<string, string> = {
  TRIP_DEPARTED: "Trip started",
  ARRIVED: "Arrived",
  DELIVERED: "Delivered",
  PARTIAL: "Partly delivered",
  REFUSED: "Not delivered",
  TRIP_COMPLETED: "Trip completed",
}

const time = clock

export function MeScreen() {
  const d = useDriver()
  const router = useRouter()
  const qc = useQueryClient()
  const { resolvedTheme, setTheme } = useTheme()
  const [cache, setCache] = useState<CacheStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const pwa = useInstall()
  const state = linkState({ online: d.online, syncing: d.syncing, pending: d.pending, failed: d.failed.length, expired: d.sessionExpired })
  const waiting = d.outbox.filter((i) => !i.failed && i.kind !== "location")
  const pings = d.outbox.filter((i) => i.kind === "location" && !i.failed).length

  useEffect(() => {
    void cacheStatus().then(setCache)
  }, [d.bundleAt])

  const describe = (i: OutboxItem) => {
    if (i.kind === "location") return "Location ping"
    if (i.kind === "issue") return `Problem report · ${(i.payload as { type: string }).type.replace(/_/g, " ").toLowerCase()}`
    const ev = i.payload as { type: string; stopId?: string }
    const stop = d.bundle.trips.flatMap((t) => t.stops).find((s) => s.id === ev.stopId)
    return `${EVENT_LABEL[ev.type] ?? ev.type}${stop ? ` · ${stop.outlet.name}` : ""}`
  }

  const signOut = async () => {
    await postLogout().catch(() => {})
    localStorage.removeItem("wp_driver_uid")
    qc.clear()
    router.replace("/login")
  }

  return (
    <div className="grid gap-3 p-4">
      <section className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{d.bundle.driver.name.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{d.bundle.driver.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Truck className="size-3" /> {d.trip?.vehicle.id ?? d.bundle.trips[0]?.vehicle.id ?? "No vehicle"} · {d.bundle.date}
          </p>
        </div>
        {d.config.demo && <TagBadge tone="violet">Demo mode</TagBadge>}
      </section>

      <SectionTitle>Sync</SectionTitle>
      <section className="grid gap-3 rounded-2xl border bg-card p-3.5">
        <div className="flex items-center justify-between">
          <SyncChip state={state} />
          <span className="text-xs text-muted-foreground">Last synced {time(d.lastSyncAt)}</span>
        </div>
        {d.sessionExpired && (
          <div className="grid gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Your session ended. Your records are safe on this phone. Sign in again and they upload.
            </p>
            <Button size="lg" variant="destructive" onClick={() => router.replace("/login?next=/driver")}>
              Sign in
            </Button>
          </div>
        )}
        {waiting.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {waiting.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span className="min-w-0 flex-1 truncate">{describe(i)}</span>
                <span className="text-xs text-muted-foreground">{time(i.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {d.failed.map((i) => (
          <div key={i.id} className="grid gap-2 rounded-xl border border-red-500/30 bg-red-50 p-3 text-sm dark:bg-red-500/10">
            <p className="font-medium text-red-800 dark:text-red-200">{describe(i)}</p>
            <p className="text-xs text-red-700 dark:text-red-300">{i.failed}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => d.retryFailed(i.id)}>
                Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={() => d.discard(i.id)}>
                Dismiss
              </Button>
            </div>
          </div>
        ))}
        {waiting.length === 0 && d.failed.length === 0 && <p className="text-sm text-muted-foreground">Everything you recorded has reached dispatch.{pings ? ` ${pings} location pings queued.` : ""}</p>}
        <Button
          variant="outline"
          className="h-11"
          disabled={busy || d.syncing}
          onClick={async () => {
            setBusy(true)
            await d.syncNow()
            const ok = await d.refresh()
            setBusy(false)
            toast[ok ? "success" : "message"](ok ? "Up to date" : d.online ? "Saved records still waiting" : "No connection. Your records are safe on this phone.")
          }}
        >
          {busy || d.syncing ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Sync now
        </Button>
      </section>

      {pwa.canInstall && (
        <Button className="h-11" onClick={() => void pwa.install()}>
          <Smartphone data-icon="inline-start" /> Install Waypoint on this phone
        </Button>
      )}

      <SectionTitle>Works offline</SectionTitle>
      <section className="grid gap-2.5 rounded-2xl border bg-card p-3.5 text-sm">
        <Row icon={Smartphone} label="App saved on this phone" ok={!!cache?.hasDoc} detail={cache ? (cache.hasDoc ? `${cache.statics} files` : "Not yet") : "Checking…"} />
        <Row icon={CloudDownload} label="Today's trip" ok detail={`Downloaded ${time(d.bundleAt)}`} />
        <Row icon={MapPin} label="Map tiles saved" ok={(cache?.tiles ?? 0) > 0} detail={cache ? `${cache.tiles} tiles` : "Checking…"} />
      </section>

      <SectionTitle>Location</SectionTitle>
      <section className="grid gap-2.5 rounded-2xl border bg-card p-3.5 text-sm">
        <div className="flex items-center justify-between">
          <span>Permission</span>
          <TagBadge tone={d.config.demo || d.gps.permission === "granted" ? "green" : d.gps.permission === "denied" ? "red" : "amber"}>
            {d.config.demo ? "Simulated" : d.gps.permission === "unsupported" ? "Needs HTTPS" : d.gps.permission}
          </TagBadge>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Shared with dispatch</span>
          <span>{d.running ? `every ${d.config.pingSeconds >= 60 ? `${Math.round(d.config.pingSeconds / 60)} min` : `${d.config.pingSeconds} s`}` : "while a trip runs"}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Last ping</span>
          <span>{time(d.gps.lastPingAt)}</span>
        </div>
        {d.gps.lastError && <p className="text-xs text-destructive">{d.gps.lastError}</p>}
        {!d.config.demo && d.gps.permission !== "granted" && d.gps.permission !== "unsupported" && (
          <Button variant="outline" className="h-11" onClick={() => void d.gps.requestPermission()}>
            Allow location
          </Button>
        )}
      </section>

      <section className="flex items-center justify-between rounded-2xl border bg-card p-3.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Moon className="size-4 text-muted-foreground" /> Night mode
        </span>
        <Switch checked={resolvedTheme === "dark"} onCheckedChange={(c) => setTheme(c ? "dark" : "light")} />
      </section>

      <Button variant="outline" className={cn("h-11")} onClick={() => setLeaving(true)}>
        <LogOut data-icon="inline-start" /> Sign out
      </Button>
      <Confirm
        open={leaving}
        onOpenChange={setLeaving}
        title="Sign out?"
        description={waiting.length || d.failed.length ? `${waiting.length + d.failed.length} records are not uploaded yet. They stay on this phone and upload next time you sign in.` : "You will need a connection to sign in again."}
        confirmLabel="Sign out"
        destructive
        onConfirm={signOut}
      />
    </div>
  )
}

function Row({ icon: Icon, label, ok, detail }: { icon: typeof Smartphone; label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <span className={cn("text-xs", ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{detail}</span>
    </div>
  )
}
