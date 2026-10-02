"use client"

import "mapbox-gl/dist/mapbox-gl.css"
import mapboxgl from "mapbox-gl"
import { LocateFixed, Minus, Plus, Route as RouteIcon, WifiOff } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useRef, useState } from "react"
import type { DriverStop, DriverTrip, LatLng } from "@waypoint/shared"
import { cn } from "@/lib/utils"
import { useDriver } from "../lib/driver-provider"
import { allRoutePoints, isDone, legPoints } from "../lib/model"
import { routeAhead } from "../lib/navigation"
import { useNavigation } from "../lib/navigation-provider"
import { MAP_STYLE } from "../lib/offline"
import { useNav } from "../nav"
import { NextStopCard } from "../next-stop-card"
import { NavBanner, NavPanel } from "./nav-hud"

const ROUTE = { ahead: "wp-ahead", done: "wp-done" } as const
const GREEN = "#16a34a"

type Line = GeoJSON.Feature<GeoJSON.LineString>
const line = (pts: LatLng[]): Line => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) } })

/** Done legs (depot → … → last completed stop) vs the rest of the route. */
function splitRoute(trip: DriverTrip) {
  const doneCount = trip.stops.filter(isDone).length
  const done: LatLng[] = []
  const ahead: LatLng[] = []
  for (let i = 0; i <= trip.stops.length; i++) (i < doneCount ? done : ahead).push(...legPoints(trip, i))
  return { done, ahead }
}

export default function MapScreen({ token, active }: { token?: string; active: boolean }) {
  const { trip, next, gps, running } = useDriver()
  const nav = useNavigation()
  const { resolvedTheme } = useTheme()
  const [failed, setFailed] = useState(!token)
  const [follow, setFollow] = useState(false)
  const navOn = !!nav.target

  useEffect(() => gps.watch(active), [gps, active])

  if (!trip) return <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">No trip to show on the map.</div>

  return (
    <div className="relative h-full overflow-hidden bg-muted">
      {!failed && token ? (
        <LiveMap token={token} trip={trip} next={next} active={active} dark={resolvedTheme === "dark"} follow={navOn ? nav.follow : follow} onFollow={navOn ? nav.setFollow : setFollow} onFail={() => setFailed(true)} />
      ) : (
        <Schematic trip={trip} next={next} me={gps.position} navPoints={nav.route && gps.position && nav.guidance ? routeAhead(nav.route, gps.position, nav.guidance.index) : null} />
      )}

      {navOn && <NavBanner />}

      {failed && !navOn && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <WifiOff className="size-3" /> Route diagram · map needs signal
        </div>
      )}

      {navOn && <NavPanel />}

      {!navOn && running && next && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
          <div className="pointer-events-auto">
            <NextStopCard stop={next} index={trip.stops.indexOf(next)} total={trip.stops.length} compact />
          </div>
        </div>
      )}
    </div>
  )
}

function LiveMap({ token, trip, next, active, dark, follow, onFollow, onFail }: { token: string; trip: DriverTrip; next: DriverStop | null; active: boolean; dark: boolean; follow: boolean; onFollow: (f: boolean) => void; onFail: () => void }) {
  const { gps } = useDriver()
  const nav = useNavigation()
  const navOn = !!nav.target
  const { openStop } = useNav()
  const onFollowRef = useRef(onFollow)
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [map, setMap] = useState<mapboxgl.Map | null>(null)
  const me = useRef<mapboxgl.Marker | null>(null)
  const meEl = useRef<HTMLDivElement | null>(null)
  const stopMarkers = useRef<mapboxgl.Marker[]>([])
  const fitted = useRef<string | null>(null)
  const styleName: "light" | "dark" = dark ? "dark" : "light"
  const initialStyle = useRef(styleName)
  const openRef = useRef(openStop)
  useEffect(() => {
    openRef.current = openStop
    onFollowRef.current = onFollow
  })

  // ── Create the map once ──
  useEffect(() => {
    if (!box.current) return
    if (!mapboxgl.supported()) {
      onFail()
      return
    }
    mapboxgl.accessToken = token
    const m = new mapboxgl.Map({
      container: box.current,
      style: MAP_STYLE[initialStyle.current],
      center: [trip.depot.position.lng, trip.depot.position.lat],
      zoom: 10,
      attributionControl: false,
      logoPosition: "bottom-left",
      dragRotate: false,
      touchPitch: false,
    })
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "top-left")
    m.touchZoomRotate.disableRotation()
    let loaded = false
    m.on("style.load", () => {
      loaded = true
      addLayers(m)
      mapRef.current = m
      setMap(m)
    })
    m.on("error", (e) => {
      // A failed style means no tiles (offline, nothing cached): fall back to the diagram.
      const status = (e as unknown as { error?: { status?: number } }).error?.status
      if (!loaded && (status === undefined || status >= 400 || status === 0)) onFail()
    })
    m.on("dragstart", () => onFollowRef.current(false))
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      m.remove()
      mapRef.current = null
      setMap(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── Light / dark ──
  const styleApplied = useRef(styleName)
  useEffect(() => {
    if (!map || styleApplied.current === styleName) return
    styleApplied.current = styleName
    map.setStyle(MAP_STYLE[styleName])
    map.once("style.load", () => addLayers(map))
  }, [map, styleName])

  // Becoming visible again (the map stays mounted behind the other tabs).
  useEffect(() => {
    if (active && map) setTimeout(() => map.resize(), 50)
  }, [active, map])

  // ── Route ──
  useEffect(() => {
    if (!map) return
    const apply = () => {
      const { done, ahead } = splitRoute(trip)
      ;(map.getSource(ROUTE.ahead) as mapboxgl.GeoJSONSource | undefined)?.setData(ahead.length > 1 ? line(ahead) : { type: "FeatureCollection", features: [] })
      ;(map.getSource(ROUTE.done) as mapboxgl.GeoJSONSource | undefined)?.setData(done.length > 1 ? line(done) : { type: "FeatureCollection", features: [] })
    }
    apply()
    map.on("style.load", apply)
    return () => void map.off("style.load", apply)
  }, [map, trip, styleName])

  // ── Stop + depot markers ──
  useEffect(() => {
    if (!map) return
    stopMarkers.current.forEach((m) => m.remove())
    stopMarkers.current = []
    const depot = document.createElement("div")
    depot.className = "grid size-8 place-items-center rounded-lg border bg-white text-[11px] font-bold text-emerald-700 shadow"
    depot.textContent = "DC"
    stopMarkers.current.push(new mapboxgl.Marker({ element: depot }).setLngLat([trip.depot.position.lng, trip.depot.position.lat]).addTo(map))
    trip.stops.forEach((s, i) => {
      const done = isDone(s)
      const isNext = next?.id === s.id
      const el = document.createElement("button")
      el.type = "button"
      el.setAttribute("aria-label", `Stop ${i + 1}: ${s.outlet.name}`)
      el.className = [
        "grid place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md",
        isNext ? "size-9 bg-emerald-600 ring-4 ring-emerald-500/30" : "size-7",
        !isNext && done ? (s.status === "DELIVERED" ? "bg-emerald-600/80" : s.status === "PARTIAL" ? "bg-amber-500" : "bg-red-500") : "",
        !isNext && !done ? "bg-slate-500" : "",
      ].join(" ")
      el.textContent = done ? "✓" : String(i + 1)
      el.onclick = () => openRef.current(s.id)
      stopMarkers.current.push(new mapboxgl.Marker({ element: el }).setLngLat([s.outlet.position.lng, s.outlet.position.lat]).addTo(map))
    })
  }, [map, trip, next])

  // ── Me ──
  useEffect(() => {
    if (!map || !gps.position) return
    const { lat, lng, heading } = gps.position
    if (!me.current) {
      const el = document.createElement("div")
      el.className = "relative grid size-9 place-items-center"
      el.innerHTML =
        '<span data-dot style="display:contents"><span class="absolute inset-1.5 animate-ping rounded-full bg-sky-500/40"></span><span class="relative size-4 rounded-full border-2 border-white bg-sky-600 shadow-md"></span></span>' +
        '<svg data-arrow style="display:none" class="size-9 drop-shadow-md" viewBox="0 0 24 24"><path d="M12 2 4.5 21l7.5-4.5L19.5 21z" fill="#2563eb" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      meEl.current = el
      me.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
    } else me.current.setLngLat([lng, lat])
    if (heading != null && meEl.current) meEl.current.style.setProperty("--h", `${heading}deg`)
    if (follow && !navOn) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14.5), duration: 800 })
    // In navigation the marker is an arrow pointing the way the vehicle is heading.
    const arrow = meEl.current?.querySelector<SVGElement>("[data-arrow]")
    const dot = meEl.current?.querySelector<HTMLElement>("[data-dot]")
    if (arrow && dot) {
      arrow.style.display = navOn ? "block" : "none"
      dot.style.display = navOn ? "none" : "contents"
      arrow.style.transform = `rotate(${(heading ?? 0) - map.getBearing()}deg)`
    }
  }, [map, gps.position, follow, navOn])

  // ── Navigation: route line, camera that follows the vehicle ──
  const navRoute = nav.route
  const navIndex = nav.guidance?.index ?? 0
  const posLat = gps.position?.lat
  const posLng = gps.position?.lng
  useEffect(() => {
    if (!map) return
    const apply = () => {
      const pts = navRoute && posLat != null && posLng != null ? routeAhead(navRoute, { lat: posLat, lng: posLng }, navIndex) : []
      ;(map.getSource("wp-nav") as mapboxgl.GeoJSONSource | undefined)?.setData(pts.length > 1 ? line(pts) : { type: "FeatureCollection", features: [] })
      for (const id of ["wp-ahead-casing", "wp-ahead-line", "wp-done-line"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", navOn ? "none" : "visible")
    }
    apply()
    map.on("style.load", apply)
    return () => void map.off("style.load", apply)
  }, [map, navRoute, navIndex, posLat, posLng, navOn])

  const heading = gps.position && (gps.position.speedKmh ?? 0) > 3 && gps.position.heading != null ? gps.position.heading : (nav.guidance?.routeBearing ?? gps.position?.heading ?? 0)
  const followNav = navOn && nav.follow
  useEffect(() => {
    if (!map || !followNav || posLat == null || posLng == null) return
    map.easeTo({ center: [posLng, posLat], zoom: 16.3, pitch: 55, bearing: heading, duration: 900, padding: { top: 230, bottom: 150, left: 0, right: 0 }, essential: true })
  }, [map, followNav, posLat, posLng, heading])
  const wasNav = useRef(false)
  useEffect(() => {
    if (map && wasNav.current && !navOn) map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 700 })
    wasNav.current = navOn
  }, [map, navOn])

  // ── Frame the route once per trip ──
  const fit = () => {
    if (!map) return
    const b = new mapboxgl.LngLatBounds()
    allRoutePoints(trip).forEach((p) => b.extend([p.lng, p.lat]))
    if (gps.position) b.extend([gps.position.lng, gps.position.lat])
    map.fitBounds(b, { padding: { top: 56, left: 36, right: 36, bottom: 290 }, duration: 900, maxZoom: 15 })
  }
  useEffect(() => {
    if (!map || fitted.current === trip.id) return
    const t = setTimeout(() => {
      fitted.current = trip.id
      map.resize()
      fit()
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trip.id])

  return (
    <>
      <div className="absolute inset-0">
        <div ref={box} className="size-full" />
      </div>
      <div className="absolute top-3 right-3 z-10 flex flex-col overflow-hidden rounded-xl border bg-background/95 shadow-md backdrop-blur">
        <MapBtn label={follow ? "Stop following" : "Follow me"} on={follow} onClick={() => {
          onFollow(!follow)
          if (!follow && gps.position && map) map.easeTo({ center: [gps.position.lng, gps.position.lat], zoom: 15, duration: 700 })
        }}>
          <LocateFixed className="size-5" />
        </MapBtn>
        <MapBtn label="Show whole route" onClick={() => { onFollow(false); fit() }}>
          <RouteIcon className="size-5" />
        </MapBtn>
        <MapBtn label="Zoom in" onClick={() => map?.zoomIn({ duration: 250 })}>
          <Plus className="size-5" />
        </MapBtn>
        <MapBtn label="Zoom out" onClick={() => map?.zoomOut({ duration: 250 })}>
          <Minus className="size-5" />
        </MapBtn>
      </div>
    </>
  )
}

function addLayers(m: mapboxgl.Map) {
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }
  for (const id of [ROUTE.done, ROUTE.ahead]) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty })
  if (!m.getLayer("wp-ahead-casing"))
    m.addLayer({ id: "wp-ahead-casing", type: "line", source: ROUTE.ahead, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } })
  if (!m.getLayer("wp-ahead-line"))
    m.addLayer({ id: "wp-ahead-line", type: "line", source: ROUTE.ahead, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": GREEN, "line-width": 5 } })
  if (!m.getLayer("wp-done-line"))
    m.addLayer({ id: "wp-done-line", type: "line", source: ROUTE.done, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#94a3b8", "line-width": 4, "line-opacity": 0.9 } })
  if (!m.getSource("wp-nav")) m.addSource("wp-nav", { type: "geojson", data: empty })
  if (!m.getLayer("wp-nav-casing"))
    m.addLayer({ id: "wp-nav-casing", type: "line", source: "wp-nav", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 13 } })
  if (!m.getLayer("wp-nav-line"))
    m.addLayer({ id: "wp-nav-line", type: "line", source: "wp-nav", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2563eb", "line-width": 8 } })
}

function MapBtn({ label, onClick, children, on }: { label: string; onClick: () => void; children: React.ReactNode; on?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn("grid size-11 place-items-center border-b last:border-b-0 active:bg-muted", on && "bg-primary/10 text-primary")}>
      {children}
    </button>
  )
}

/** No map tiles (offline, nothing cached): the same route as a simple diagram. */
function Schematic({ trip, next, me, navPoints }: { trip: DriverTrip; next: DriverStop | null; me: { lat: number; lng: number } | null; navPoints: LatLng[] | null }) {
  const { openStop } = useNav()
  const W = 360
  const H = 520
  const g = useMemo(() => {
    const pts = [...allRoutePoints(trip), ...(me ? [me] : []), ...(navPoints ?? [])]
    const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length
    const k = Math.cos((lat0 * Math.PI) / 180)
    const xs = pts.map((p) => p.lng * k)
    const ys = pts.map((p) => p.lat)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const pad = 36
    const scale = Math.min((W - pad * 2) / Math.max(maxX - minX, 1e-6), (H - pad * 2 - 140) / Math.max(maxY - minY, 1e-6))
    const ox = (W - (maxX - minX) * scale) / 2
    const oy = (H - 140 - (maxY - minY) * scale) / 2 + 10
    const xy = (p: LatLng) => ({ x: ox + (p.lng * k - minX) * scale, y: oy + (maxY - p.lat) * scale })
    return { xy }
  }, [trip, me, navPoints])

  const { done, ahead } = splitRoute(trip)
  const path = (pts: LatLng[]) => pts.map((p, i) => `${i ? "L" : "M"}${g.xy(p).x.toFixed(1)},${g.xy(p).y.toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full bg-muted/60" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Route diagram">
      {navPoints && navPoints.length > 1 && <path d={path(navPoints)} fill="none" stroke="#2563eb" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />}
      {done.length > 1 && <path d={path(done)} fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinejoin="round" />}
      {ahead.length > 1 && <path d={path(ahead)} fill="none" stroke={GREEN} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
      <g>
        <rect x={g.xy(trip.depot.position).x - 12} y={g.xy(trip.depot.position).y - 10} width="24" height="20" rx="5" fill="#fff" stroke="#cbd5e1" />
        <text x={g.xy(trip.depot.position).x} y={g.xy(trip.depot.position).y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#047857">DC</text>
      </g>
      {trip.stops.map((s, i) => {
        const p = g.xy(s.outlet.position)
        const d = isDone(s)
        const isNext = next?.id === s.id
        return (
          <g key={s.id} onClick={() => openStop(s.id)} className="cursor-pointer">
            <circle cx={p.x} cy={p.y} r={isNext ? 14 : 11} fill={d ? (s.status === "DELIVERED" ? "#059669" : s.status === "PARTIAL" ? "#f59e0b" : "#ef4444") : isNext ? "#16a34a" : "#64748b"} stroke="#fff" strokeWidth="2" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{d ? "✓" : i + 1}</text>
          </g>
        )
      })}
      {me && (
        <g>
          <circle cx={g.xy(me).x} cy={g.xy(me).y} r="9" fill="#0ea5e9" opacity=".25" />
          <circle cx={g.xy(me).x} cy={g.xy(me).y} r="5" fill="#0284c7" stroke="#fff" strokeWidth="2" />
        </g>
      )}
    </svg>
  )
}
