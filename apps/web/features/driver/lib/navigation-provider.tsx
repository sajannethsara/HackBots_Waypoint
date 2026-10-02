"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { DriverStop, LatLng } from "@waypoint/shared"
import { useNav } from "../nav"
import { useDriver } from "./driver-provider"
import { fetchRoute, guide, plannedRoute, spoken, straightRoute, type Guidance, type NavRoute } from "./navigation"
import { distanceM } from "./model"

export interface NavTarget {
  kind: "depot" | "stop"
  id: string
  label: string
  position: LatLng
  /** Within this many metres the driver has arrived. */
  radiusM: number
  /** Index of the planned leg that leads here (stops), for offline guidance. */
  legIndex: number | null
}

interface Ctx {
  target: NavTarget | null
  route: NavRoute | null
  guidance: Guidance | null
  arrived: boolean
  loading: boolean
  rerouting: boolean
  voice: boolean
  setVoice: (v: boolean) => void
  follow: boolean
  setFollow: (f: boolean) => void
  startDepot: () => void
  startStop: (stop: DriverStop) => void
  stop: () => void
}

const NavigationCtx = createContext<Ctx | null>(null)
export const useNavigation = () => {
  const c = useContext(NavigationCtx)
  if (!c) throw new Error("useNavigation outside NavigationProvider")
  return c
}

const OFF_ROUTE_M = 60
const REROUTE_EVERY_MS = 12_000

/**
 * Turn-by-turn navigation inside the app. Picks the best route available (live Mapbox directions,
 * the planned road leg saved on the phone, or a straight heading), follows the phone's position,
 * re-routes when the driver leaves the route and optionally speaks the instructions.
 */
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const { trip, gps, mapboxToken, online, config, setDemoPath, setDriveIdle } = useDriver()
  const { setTab } = useNav()
  const [target, setTarget] = useState<NavTarget | null>(null)
  const [route, setRoute] = useState<NavRoute | null>(null)
  const [rerouting, setRerouting] = useState(false)
  const [voice, setVoice] = useState(true)
  const [follow, setFollow] = useState(true)
  const lastRoute = useRef(0)
  const offCount = useRef(0)
  const seq = useRef(0)
  const spokenKeys = useRef(new Set<string>())
  const lat = gps.position?.lat
  const lng = gps.position?.lng
  const pos = useMemo(() => (lat != null && lng != null ? { lat, lng } : null), [lat, lng])
  const posRef = useRef(pos)
  useEffect(() => {
    posRef.current = pos
  })

  const compute = useCallback(
    async (t: NavTarget, reason: "start" | "reroute" | "upgrade") => {
      const from = posRef.current
      if (!from) return
      lastRoute.current = Date.now()
      const mine = ++seq.current
      await Promise.resolve()
      if (reason !== "start") setRerouting(true)
      let r: NavRoute | null = null
      if (mapboxToken && navigator.onLine) r = await fetchRoute(from, t.position, mapboxToken)
      if (!r && t.legIndex != null && trip) {
        const planned = plannedRoute(trip, t.legIndex)
        if (planned && guide(planned, from).offRouteM < 300) r = planned
      }
      r ??= straightRoute(from, t.position, t.label)
      if (mine !== seq.current) return // a newer request superseded this one
      offCount.current = 0
      spokenKeys.current.clear()
      setRoute(r)
      setRerouting(false)
    },
    [mapboxToken, trip],
  )

  const begin = useCallback(
    (t: NavTarget) => {
      setTarget(t)
      setRoute(null)
      setFollow(true)
      setTab("map")
      setDriveIdle(true)
    },
    [setTab, setDriveIdle],
  )

  const startDepot = useCallback(() => {
    if (!trip) return
    begin({ kind: "depot", id: `depot:${trip.id}`, label: trip.depot.name, position: trip.depot.position, radiusM: Math.max(250, config.arriveRadiusM * 2), legIndex: null })
  }, [trip, begin, config.arriveRadiusM])

  const startStop = useCallback(
    (stop: DriverStop) => {
      if (!trip) return
      begin({ kind: "stop", id: stop.id, label: stop.outlet.name, position: stop.outlet.position, radiusM: config.arriveRadiusM, legIndex: trip.stops.findIndex((s) => s.id === stop.id) })
    },
    [trip, begin, config.arriveRadiusM],
  )

  const stop = useCallback(() => {
    seq.current++
    setTarget(null)
    setRoute(null)
    setRerouting(false)
    setDriveIdle(false)
    setDemoPath(null)
  }, [setDemoPath, setDriveIdle])

  const loading = !!target && !route

  // First route as soon as there is a target and a position.
  const hasPos = !!pos
  const targetId = target?.id
  useEffect(() => {
    if (target && hasPos && !route) queueMicrotask(() => void compute(target, "start"))
  }, [target, targetId, hasPos, route, compute])

  // A straight-line "route" simply follows the phone; every other route is snapped to.
  const shown = useMemo(() => (route?.source === "straight" && target && pos ? straightRoute(pos, target.position, target.label) : route), [route, target, pos])
  const guidance = useMemo(() => (shown && pos ? guide(shown, pos) : null), [shown, pos])

  // Off the route → find a new way. With only a straight line, try for a real route when signal returns.
  useEffect(() => {
    if (!target || !route || !guidance) return
    if (route.source === "straight") {
      if (online && mapboxToken && Date.now() - lastRoute.current > 30_000) void compute(target, "upgrade")
      return
    }
    offCount.current = guidance.offRouteM > OFF_ROUTE_M ? offCount.current + 1 : 0
    if (offCount.current >= 3 && Date.now() - lastRoute.current > REROUTE_EVERY_MS) void compute(target, "reroute")
  }, [guidance, target, route, online, mapboxToken, compute])

  // Demo mode: the simulated phone drives the route being shown.
  useEffect(() => {
    if (!config.demo) return
    setDemoPath(target && route ? { key: `${target.id}:${route.source}:${route.points.length}:${route.total.toFixed(0)}`, points: route.points } : null)
  }, [config.demo, target, route, setDemoPath])

  // Navigation ends itself once the stop it led to has been reached and recorded.
  const targetStopStatus = target?.kind === "stop" ? trip?.stops.find((s) => s.id === target.id)?.status : undefined
  useEffect(() => {
    if (targetStopStatus && targetStopStatus !== "PENDING") queueMicrotask(stop)
  }, [targetStopStatus, stop])
  useEffect(() => {
    if (target?.kind === "depot" && trip?.status === "DEPARTED") queueMicrotask(stop)
  }, [target?.kind, trip?.status, stop])

  // Voice guidance: once at ~400 m and again at ~100 m before each maneuver.
  useEffect(() => {
    if (!voice || !guidance?.next || typeof speechSynthesis === "undefined") return
    const n = guidance.next
    for (const at of [400, 100]) {
      const key = `${n.at}:${at}`
      if (guidance.distToNext <= at && guidance.distToNext > at - 120 && !spokenKeys.current.has(key)) {
        spokenKeys.current.add(key)
        speechSynthesis.cancel()
        speechSynthesis.speak(new SpeechSynthesisUtterance(spoken(guidance.distToNext, n.text)))
      }
    }
  }, [voice, guidance])

  const arrived = !!(target && pos && distanceM(pos, target.position) <= target.radiusM)

  const value: Ctx = { target, route: shown, guidance, arrived, loading, rerouting, voice, setVoice, follow, setFollow, startDepot, startStop, stop }
  return <NavigationCtx.Provider value={value}>{children}</NavigationCtx.Provider>
}
