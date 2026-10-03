"use client"

import "mapbox-gl/dist/mapbox-gl.css"
import mapboxgl from "mapbox-gl"
import { Box, Maximize2, MapPin, Minus, Navigation2, Package, Plus, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { StoreLiveView } from "@waypoint/shared"
import { DepotDot } from "@/features/dispatcher/live/map/markers"
import { TRIP_COLOR } from "@/features/dispatcher/live/status"
import { cn } from "@/lib/utils"

type LL = { lat: number; lng: number }
const ROUTE = "wp-store-route"
const color = (v: StoreLiveView) => (v.delayMin >= 15 ? "#ef4444" : (TRIP_COLOR[v.vehicle.status as keyof typeof TRIP_COLOR] ?? "#16a34a"))

/**
 * The store's live map: the vehicle, this outlet and the road still to drive. Same Mapbox look as the dispatcher's
 * map, but drawn from the store's own redacted view, so nothing about other outlets is on it.
 */
export default function StoreLiveMap({ view, token, theme }: { view: StoreLiveView; token: string; theme: "light" | "dark" }) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<mapboxgl.Map | null>(null)
  const [tilted, setTilted] = useState(false)
  const [bearing, setBearing] = useState(0)
  const first = useRef(true)

  useEffect(() => {
    if (!container.current) return
    mapboxgl.accessToken = token
    const m = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      config: { basemap: { theme: "monochrome", lightPreset: theme === "dark" ? "night" : "day", showPointOfInterestLabels: false, showTransitLabels: false, show3dObjects: true } },
      center: [view.destination.position.lng, view.destination.position.lat],
      zoom: 12,
      attributionControl: false,
      antialias: true,
    })
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    m.on("style.load", () => {
      m.addSource(ROUTE, { type: "geojson", data: line([]) })
      m.addLayer({ id: `${ROUTE}-line`, type: "line", source: ROUTE, slot: "top", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4.5, "line-opacity": 0.9, "line-emissive-strength": 1 } })
      setMap(m)
    })
    m.on("rotate", () => setBearing(m.getBearing()))
    m.on("pitchend", () => setTilted(m.getPitch() > 5))
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(container.current)
    return () => {
      ro.disconnect()
      m.remove()
      setMap(null)
    }
    // The map is created once; theme and data changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    map?.setConfigProperty("basemap", "lightPreset", theme === "dark" ? "night" : "day")
  }, [map, theme])

  // Road ahead.
  useEffect(() => {
    ;(map?.getSource(ROUTE) as mapboxgl.GeoJSONSource | undefined)?.setData(line(view.route, color(view)))
  }, [map, view.route, view.delayMin, view.vehicle.status])

  // Frame everything that matters once, and again whenever the vehicle leaves the depot.
  const framed = useRef("")
  const frame = (duration = 1200) => {
    if (!map) return
    const b = new mapboxgl.LngLatBounds()
    b.extend([view.destination.position.lng, view.destination.position.lat])
    if (view.vehicle.departed) b.extend([view.vehicle.position.lng, view.vehicle.position.lat])
    else b.extend([view.depot.position.lng, view.depot.position.lat])
    for (const p of view.route) b.extend([p.lng, p.lat])
    map.fitBounds(b, { padding: 70, maxZoom: 15, duration, pitch: 0, bearing: 0, essential: true })
  }
  useEffect(() => {
    const key = `${view.orderId}|${view.vehicle.departed}`
    if (!map || framed.current === key) return
    framed.current = key
    frame(first.current ? 0 : 1200)
    first.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, view.orderId, view.vehicle.departed])

  return (
    <div className="relative size-full">
      <div ref={container} className="size-full" />
      {map && (
        <>
          <Marker map={map} position={view.depot.position} z={5}>
            <DepotDot name={view.depot.name} />
          </Marker>
          <Marker map={map} position={view.destination.position} z={20}>
            <YouPin name={view.destination.name} arrived={view.stage === "ARRIVED" || view.stage === "DELIVERED" || view.stage === "RECEIVED"} />
          </Marker>
          {view.vehicle.departed && (
            <Marker map={map} position={view.vehicle.position} z={30} animate>
              <Truck view={view} rotate={view.vehicle.heading - bearing} />
            </Marker>
          )}
        </>
      )}
      <div className="absolute right-3 bottom-10 flex flex-col overflow-hidden rounded-lg border bg-background/90 shadow-lg backdrop-blur-md">
        <MapButton label="Zoom in" onClick={() => map?.zoomIn({ duration: 300 })}>
          <Plus className="size-4" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => map?.zoomOut({ duration: 300 })}>
          <Minus className="size-4" />
        </MapButton>
        <MapButton label={tilted ? "Flat view" : "3D view"} onClick={() => map?.easeTo({ pitch: tilted ? 0 : 52, bearing: tilted ? 0 : -14, duration: 900 })}>
          {tilted ? <Square className="size-3.5" /> : <Box className="size-3.5" />}
        </MapButton>
        <MapButton label="Fit to delivery" onClick={() => frame()}>
          <Maximize2 className="size-3.5" />
        </MapButton>
      </div>
    </div>
  )
}

function line(pts: LL[], c = "#16a34a"): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features: pts.length > 1 ? [{ type: "Feature", properties: { color: c }, geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) } }] : [],
  }
}

/** This outlet: the destination everyone is heading for. */
export function YouPin({ name, arrived }: { name: string; arrived: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn("wp-glow flex size-8 items-center justify-center rounded-full border-2 border-white text-white", arrived ? "bg-emerald-600" : "bg-sky-600")} style={{ ["--glow" as string]: arrived ? "#16a34a" : "#0284c7" }}>
        <MapPin className="size-4" />
      </span>
      <span className="rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow-sm ring-1 ring-border">{arrived ? "Arrived at " : "You · "}{name}</span>
    </div>
  )
}

/** The vehicle: status colour, radar ping while moving, arrow along the road. */
export function Truck({ view, rotate }: { view: StoreLiveView; rotate: number }) {
  const c = color(view)
  const moving = view.vehicle.status === "ON_ROUTE" || view.vehicle.status === "DELAYED"
  return (
    <div className="relative flex flex-col items-center gap-1">
      {moving && <span className="wp-ping absolute top-0 size-8 rounded-full" style={{ background: c }} />}
      <span className="wp-glow relative flex size-8 items-center justify-center rounded-full border-2 border-white text-white" style={{ background: c, ["--glow" as string]: c }}>
        {moving ? <Navigation2 className="size-4 fill-white transition-transform duration-700" style={{ transform: `rotate(${rotate}deg)` }} /> : <Package className="size-4" />}
      </span>
      <span className="rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow-sm ring-1 ring-border">{view.vehicle.id}</span>
    </div>
  )
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="flex size-8 items-center justify-center border-b text-foreground/80 transition-colors last:border-b-0 hover:bg-muted hover:text-foreground">
      {children}
    </button>
  )
}

/** React content as a Mapbox marker; with `animate`, moves glide over ~1.9 s (as on the dispatcher map). */
function Marker({ map, position, children, z = 1, animate }: { map: mapboxgl.Map; position: LL; children: React.ReactNode; z?: number; animate?: boolean }) {
  const [el] = useState(() => document.createElement("div"))
  const marker = useRef<mapboxgl.Marker | null>(null)
  const current = useRef<LL>(position)

  useEffect(() => {
    const mk = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([position.lng, position.lat]).addTo(map)
    marker.current = mk
    return () => {
      mk.remove()
      marker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el])

  useEffect(() => {
    const mk = marker.current
    if (!mk) return
    const from = current.current
    const to = position
    if (!animate || (from.lat === to.lat && from.lng === to.lng)) {
      mk.setLngLat([to.lng, to.lat])
      current.current = to
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const f = Math.min(1, (now - start) / 1900)
      const p = { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f }
      current.current = p
      mk.setLngLat([p.lng, p.lat])
      if (f < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [position.lat, position.lng, position, animate])

  useEffect(() => {
    const node = marker.current?.getElement()
    if (node) node.style.zIndex = String(z)
  }, [z])

  return createPortal(<div className="cursor-default">{children}</div>, el)
}
