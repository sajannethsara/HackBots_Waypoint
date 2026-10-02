"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type {
  DriverBundle,
  DriverConfig,
  DriverEventInput,
  DriverChatInput,
  DriverIssueInput,
  LatLng,
  DriverLocationInput,
  DriverStop,
  DriverTrip,
  DriverSyncResult,
} from "@waypoint/shared"
import { fetchBundle, OfflineError, postMedia, postSync, SessionError } from "./driver-api"
import { kvGet, kvSet, mediaAll, mediaDelete, mediaPut, outboxAll, outboxDelete, outboxPut, uid, type MediaItem, type OutboxItem } from "./idb"
import { applyEvent, currentTrip, nextStop, tripStarted } from "./model"
import { useGps } from "./use-gps"

/**
 * Offline-first state for the driver.
 *
 * The phone works from the downloaded bundle. Every action is applied to that bundle at once and
 * queued in the outbox with a client id; the sync engine replays the outbox whenever there is a
 * connection (on reconnect, after each action and on every GPS ping). The server treats replays as
 * no-ops, so nothing is lost or doubled however often the signal drops.
 */

const MAX_PENDING_LOCATIONS = 300
const BUNDLE_KEY = "bundle"
const DEMO_CLOCK_SPEED = 30 // simulated minutes per real minute in demo mode
const localMinutes = () => new Date().getHours() * 60 + new Date().getMinutes()

export type Outcome = "DELIVERED" | "PARTIAL" | "REFUSED"

export interface FinishStopInput {
  stop: DriverStop
  outcome: Outcome
  lines: { orderLineId: string; deliveredQty: number; refusedQty: number; reason?: string }[]
  recipientName: string
  notes?: string
  reason?: string
  signature?: string | null
  photo?: string | null
}

export interface ReportIssueInput {
  type: DriverIssueInput["type"]
  severity: DriverIssueInput["severity"]
  description: string
  stop?: DriverStop | null
  photo?: string | null
}

interface Ctx {
  userId: string
  bundle: DriverBundle
  config: DriverConfig
  trip: DriverTrip | null
  next: DriverStop | null
  running: boolean
  nowMin: number
  online: boolean
  syncing: boolean
  sessionExpired: boolean
  lastSyncAt: string | null
  bundleAt: string
  outbox: OutboxItem[]
  pending: number
  failed: OutboxItem[]
  gps: ReturnType<typeof useGps>
  mapboxToken?: string
  /** Demo mode plumbing: navigation tells the simulated phone which road to follow. */
  setDemoPath: (p: { key: string; points: LatLng[] } | null) => void
  setDriveIdle: (on: boolean) => void
  startTrip: () => void
  arrive: (stop: DriverStop) => void
  finishStop: (input: FinishStopInput) => void
  completeTrip: () => void
  reportIssue: (input: ReportIssueInput) => void
  /** Post to an issue's group chat. Queued like everything else, so it works with no signal. */
  sendChat: (chatId: string, body: string) => DriverChatInput
  /** Chat messages waiting to upload, so the thread can show them as pending. */
  /** The driver read an issue chat: clear its unread count on the phone straight away. */
  markIssueRead: (chatId: string) => void
  syncNow: () => Promise<void>
  refresh: () => Promise<boolean>
  retryFailed: (id: string) => void
  discard: (id: string) => void
}

const DriverCtx = createContext<Ctx | null>(null)
export const useDriver = () => {
  const c = useContext(DriverCtx)
  if (!c) throw new Error("useDriver outside DriverProvider")
  return c
}

const photoMime = (dataUrl: string) => dataUrl.slice(5, dataUrl.indexOf(";"))
const stripPrefix = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1)

export function DriverProvider({ userId, initial, mapboxToken, children }: { userId: string; initial: DriverBundle; mapboxToken?: string; children: React.ReactNode }) {
  const demoPath = useRef<{ key: string; points: LatLng[] } | null>(null)
  const [driveIdle, setDriveIdle] = useState(false)
  const setDemoPath = useCallback((p: { key: string; points: LatLng[] } | null) => {
    demoPath.current = p
  }, [])
  const [bundle, setBundle] = useState(initial)
  const [bundleAt, setBundleAt] = useState(initial.generatedAt)
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const bundleRef = useRef(bundle)
  const outboxRef = useRef(outbox)
  const inflight = useRef(false)
  const deviceId = useRef<string>("")

  const config = bundle.config
  const trip = useMemo(() => currentTrip(bundle), [bundle])
  const next = useMemo(() => nextStop(trip), [trip])
  const running = tripStarted(trip)

  const setB = useCallback(
    (b: DriverBundle) => {
      bundleRef.current = b
      setBundle(b)
      void kvSet(userId, BUNDLE_KEY, b)
    },
    [userId],
  )
  const setOut = useCallback((fn: (o: OutboxItem[]) => OutboxItem[]) => {
    const n = fn(outboxRef.current)
    outboxRef.current = n
    setOutbox(n)
  }, [])

  // Restore the outbox saved on this phone (records from a previous session still need to go out).
  useEffect(() => {
    void outboxAll(userId).then((items) => {
      setOut(() => items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    })
    void kvGet<string>(userId, "deviceId").then((d) => {
      deviceId.current = d ?? uid()
      if (!d) void kvSet(userId, "deviceId", deviceId.current)
    })
  }, [userId, setOut])

  // ── Sync engine ──
  const markOnline = useCallback((ok: boolean) => setOnline(ok && navigator.onLine), [])

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchBundle()
      // Never replace local state while it holds actions the server has not seen yet.
      if (outboxRef.current.some((i) => i.kind === "event" && !i.failed)) return false
      setB(fresh)
      setBundleAt(fresh.generatedAt)
      markOnline(true)
      setSessionExpired(false)
      return true
    } catch (e) {
      if (e instanceof SessionError) setSessionExpired(true)
      else if (e instanceof OfflineError) markOnline(false)
      return false
    }
  }, [setB, markOnline])

  const flush = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    setSyncing(true)
    try {
      // 1. Proof photos and signatures first: events cite them.
      for (const m of await mediaAll(userId)) {
        await postMedia({ id: m.id, kind: m.kind, mimeType: m.mimeType, data: m.data })
        await mediaDelete(userId, m.id)
      }
      // 2. Records, in the order they happened.
      const items = outboxRef.current.filter((i) => !i.failed)
      if (items.length) {
        const locations = items.filter((i) => i.kind === "location").slice(-200)
        const res: DriverSyncResult = await postSync({
          deviceId: deviceId.current,
          events: items.filter((i) => i.kind === "event").map((i) => i.payload as DriverEventInput),
          locations: locations.map((i) => i.payload as DriverLocationInput),
          issues: items.filter((i) => i.kind === "issue").map((i) => i.payload as DriverIssueInput),
          chats: items.filter((i) => i.kind === "chat").map((i) => i.payload as DriverChatInput),
        })
        const accepted = new Set([...res.accepted.events, ...res.accepted.locations, ...res.accepted.issues, ...res.accepted.chats])
        const rejected = new Map(res.rejected.map((r) => [r.id, r.reason]))
        // Pings the batch left out (older than the 200 newest) are stale: drop them with the rest.
        const stale = new Set(items.filter((i) => i.kind === "location").slice(0, -200).map((i) => i.id))
        for (const i of items) {
          if (accepted.has(i.id) || stale.has(i.id)) {
            await outboxDelete(userId, i.id)
          } else if (rejected.has(i.id)) {
            await outboxPut(userId, { ...i, failed: rejected.get(i.id) })
          } else {
            await outboxPut(userId, { ...i, attempts: i.attempts + 1 })
          }
        }
        setOut((o) =>
          o
            .filter((i) => !accepted.has(i.id) && !stale.has(i.id))
            .map((i) => (rejected.has(i.id) ? { ...i, failed: rejected.get(i.id) } : accepted.has(i.id) ? i : { ...i, attempts: i.attempts + 1 })),
        )
        setLastSyncAt(res.serverTime)
      }
      markOnline(true)
      setSessionExpired(false)
      if (!outboxRef.current.some((i) => i.kind === "event" && !i.failed)) void refresh()
    } catch (e) {
      if (e instanceof SessionError) setSessionExpired(true)
      else if (e instanceof OfflineError) markOnline(false)
    } finally {
      inflight.current = false
      setSyncing(false)
    }
  }, [userId, setOut, markOnline, refresh])

  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  const syncNow = useCallback(() => flushRef.current(), [])
  const scheduleFlush = useCallback(() => {
    setTimeout(() => void flushRef.current(), 250)
  }, [])

  // Reconnect → replay. Also retry on a timer while anything is waiting.
  useEffect(() => {
    const up = () => {
      setOnline(true)
      void flushRef.current()
    }
    const down = () => setOnline(false)
    const visible = () => document.visibilityState === "visible" && void flushRef.current()
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    document.addEventListener("visibilitychange", visible)
    const id = setInterval(() => {
      if (outboxRef.current.some((i) => !i.failed)) void flushRef.current()
    }, 20_000)
    // Background refresh of today's plan (re-sequenced stops, new messages) every 4 minutes.
    const refreshId = setInterval(() => void flushRef.current().then(() => refresh()), 4 * 60_000)
    void flushRef.current()
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
      document.removeEventListener("visibilitychange", visible)
      clearInterval(id)
      clearInterval(refreshId)
    }
  }, [refresh])

  // ── Queueing ──
  const enqueue = useCallback(
    (kind: OutboxItem["kind"], payload: { id: string }) => {
      const item: OutboxItem = { id: payload.id, kind, payload, createdAt: new Date().toISOString(), attempts: 0 }
      setOut((o) => {
        const next = [...o, item]
        const locs = next.filter((i) => i.kind === "location" && !i.failed)
        // Keep the newest pings if the phone has been offline for a long time.
        const drop = new Set(locs.slice(0, Math.max(0, locs.length - MAX_PENDING_LOCATIONS)).map((i) => i.id))
        drop.forEach((id) => void outboxDelete(userId, id))
        return next.filter((i) => !drop.has(i.id))
      })
      void outboxPut(userId, item)
    },
    [userId, setOut],
  )
  const enqueueLocation = useCallback((loc: DriverLocationInput) => enqueue("location", loc), [enqueue])

  const gps = useGps({ trip, next, config, running, demoPath, driveIdle, enqueue: enqueueLocation, flush: scheduleFlush })
  const pingNowRef = useRef(gps.pingNow)
  useEffect(() => {
    pingNowRef.current = gps.pingNow
  })

  const commit = useCallback(
    (ev: Omit<DriverEventInput, "id" | "occurredAt">, media: MediaItem[] = []) => {
      const full: DriverEventInput = { ...ev, id: uid(), occurredAt: new Date().toISOString() }
      setB(applyEvent(bundleRef.current, full))
      for (const m of media) void mediaPut(userId, m)
      enqueue("event", full)
      scheduleFlush()
      return full
    },
    [userId, setB, enqueue, scheduleFlush],
  )

  const startTrip = useCallback(() => {
    if (!trip) return
    const p = gps.position
    commit({ type: "TRIP_DEPARTED", tripId: trip.id, location: p ? { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM ?? undefined } : undefined })
  }, [trip, commit, gps.position])

  const arrive = useCallback(
    (stop: DriverStop) => {
      if (!trip) return
      commit({ type: "ARRIVED", tripId: trip.id, stopId: stop.id })
      void pingNowRef.current()
    },
    [trip, commit],
  )

  const finishStop = useCallback(
    (i: FinishStopInput) => {
      if (!trip) return
      const media: MediaItem[] = []
      const podId = uid()
      let signatureId: string | undefined
      let photoId: string | undefined
      if (i.signature) {
        signatureId = uid()
        media.push({ id: signatureId, kind: "SIGNATURE", mimeType: photoMime(i.signature), data: stripPrefix(i.signature) })
      }
      if (i.photo) {
        photoId = uid()
        media.push({ id: photoId, kind: "PHOTO", mimeType: photoMime(i.photo), data: stripPrefix(i.photo) })
      }
      commit(
        {
          type: i.outcome,
          tripId: trip.id,
          stopId: i.stop.id,
          reason: i.reason,
          pod: i.recipientName.trim()
            ? { id: podId, recipientName: i.recipientName.trim(), notes: i.notes?.trim() || undefined, capturedAt: new Date().toISOString(), signatureId, photoId, lines: i.lines }
            : undefined,
        },
        media,
      )
      void pingNowRef.current()
    },
    [trip, commit],
  )

  const completeTrip = useCallback(() => {
    if (!trip) return
    commit({ type: "TRIP_COMPLETED", tripId: trip.id })
  }, [trip, commit])

  const reportIssue = useCallback(
    (i: ReportIssueInput) => {
      const media: MediaItem[] = []
      let photoId: string | undefined
      if (i.photo) {
        photoId = uid()
        media.push({ id: photoId, kind: "PHOTO", mimeType: photoMime(i.photo), data: stripPrefix(i.photo) })
        void mediaPut(userId, media[0])
      }
      const issue: DriverIssueInput = {
        clientId: uid(),
        stage: "DELIVERY",
        type: i.type,
        severity: i.severity,
        description: i.description.trim(),
        tripId: trip?.id,
        stopId: i.stop?.id,
        outletId: i.stop?.outlet.id,
        photoId,
      }
      enqueue("issue", { ...issue, id: issue.clientId })
      scheduleFlush()
    },
    [userId, trip, enqueue, scheduleFlush],
  )

  const sendChat = useCallback(
    (chatId: string, body: string) => {
      const msg: DriverChatInput = { id: uid(), chatId, body: body.trim(), createdAt: new Date().toISOString() }
      enqueue("chat", msg)
      scheduleFlush()
      return msg
    },
    [enqueue, scheduleFlush],
  )

  const markIssueRead = useCallback(
    (chatId: string) => {
      const b = bundleRef.current
      if (!b.issues.some((i) => i.chat?.id === chatId && i.chat.unread > 0)) return
      setB({ ...b, issues: b.issues.map((i) => (i.chat?.id === chatId ? { ...i, chat: { ...i.chat, unread: 0 } } : i)) })
    },
    [setB],
  )

  // A new message in any issue chat (socket nudge): refresh the plan and issue list soon.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const nudge = () => {
      clearTimeout(t)
      t = setTimeout(() => void refresh(), 1_500)
    }
    window.addEventListener("wp:issue-chat", nudge)
    return () => {
      window.removeEventListener("wp:issue-chat", nudge)
      clearTimeout(t)
    }
  }, [refresh])

  const retryFailed = useCallback(
    (id: string) => {
      const item = outboxRef.current.find((i) => i.id === id)
      if (!item) return
      const next = { ...item, failed: undefined, attempts: 0 }
      setOut((o) => o.map((i) => (i.id === id ? next : i)))
      void outboxPut(userId, next)
      scheduleFlush()
    },
    [userId, setOut, scheduleFlush],
  )
  const discard = useCallback(
    (id: string) => {
      setOut((o) => o.filter((i) => i.id !== id))
      void outboxDelete(userId, id)
    },
    [userId, setOut],
  )

  // ── Clock: the phone's time, or an accelerated plan clock in demo mode ──
  const demoAnchor = useRef<{ tripId: string; realMs: number; min: number } | null>(null)
  const [nowMin, setNowMin] = useState(() => (config.demo && trip ? trip.plannedDepartMin - 25 : localMinutes()))
  const tripId = trip?.id
  const departMin = trip?.plannedDepartMin
  useEffect(() => {
    const read = () => {
      if (config.demo && tripId != null && departMin != null) {
        if (demoAnchor.current?.tripId !== tripId) demoAnchor.current = { tripId, realMs: Date.now(), min: departMin - 25 }
        const a = demoAnchor.current
        setNowMin(a.min + ((Date.now() - a.realMs) / 60_000) * DEMO_CLOCK_SPEED)
      } else setNowMin(localMinutes())
    }
    const id = setInterval(read, 5_000)
    const visible = () => document.visibilityState === "visible" && read()
    document.addEventListener("visibilitychange", visible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [config.demo, tripId, departMin])

  const failed = useMemo(() => outbox.filter((i) => i.failed), [outbox])
  const pending = useMemo(() => outbox.filter((i) => !i.failed && i.kind !== "location").length, [outbox])

  const value: Ctx = {
    userId,
    bundle,
    config,
    trip,
    next,
    running,
    nowMin,
    online,
    syncing,
    sessionExpired,
    lastSyncAt,
    bundleAt,
    outbox,
    pending,
    failed,
    gps,
    mapboxToken,
    setDemoPath,
    setDriveIdle,
    startTrip,
    arrive,
    finishStop,
    completeTrip,
    reportIssue,
    sendChat,
    markIssueRead,
    syncNow,
    refresh,
    retryFailed,
    discard,
  }
  return <DriverCtx.Provider value={value}>{children}</DriverCtx.Provider>
}
