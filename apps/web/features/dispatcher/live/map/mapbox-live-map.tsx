"use client"

import "mapbox-gl/dist/mapbox-gl.css"
import mapboxgl from "mapbox-gl"
import { Box, Maximize2, Minus, Plus, Square } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { LatLng } from "@waypoint/shared"
import { cn } from "@/lib/utils"
import { TRIP_COLOR, isMoving } from "../status"
import { DepotDot, StopDot, VehicleDot } from "./markers"
import { splitRoute, tripPoints, type LiveMapProps } from "./types"

/**
 * Live map on Mapbox GL: Standard style in monochrome, day/night lighting that follows the
 * app theme, route lines (solid travelled, faded ahead), and a tilted
 * fly-in when a single trip is in focus.
 */

const SRC = { all: "wp-routes-all", done: "wp-routes-done", ahead: "wp-routes-ahead" } as const
const FOCUS_PITCH = 52
const FOCUS_BEARING = -14

type Line = GeoJSON.Feature<GeoJSON.LineString, { id: string; color: string }>
const asLine = (id: string, color: string, pts: LatLng[]): Line => ({
  type: "Feature",
  properties: { id, color },
  geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) },
})
const collection = (features: Line[]): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({ type: "FeatureCollection", features })

export default function MapboxLiveMap({ token, ...props }: LiveMapProps & { token: string }) {
  const { snapshot, trips, routes, selectedId, onSelect, theme, rightInset = 0, highlightStopId } = props
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [map, setMap] = useState<mapboxgl.Map | null>(null)
  const [tilted, setTilted] = useState(false)
  const [bearing, setBearing] = useState(0)

  const visible = useMemo(() => (selectedId ? trips.filter((t) => t.id === selectedId) : trips), [trips, selectedId])
  const focused = visible.length === 1

  // Keep the latest onSelect without re-binding map events.
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // ── Create the map once ──
  useEffect(() => {
    if (!container.current) return
    mapboxgl.accessToken = token
    const m = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      config: {
        basemap: {
          theme: "monochrome",
          lightPreset: theme === "dark" ? "night" : "day",
          showPointOfInterestLabels: false,
          showTransitLabels: false,
          show3dObjects: true,
        },
      },
      center: [snapshot.depot.position.lng, snapshot.depot.position.lat],
      zoom: 8.5,
      attributionControl: false,
      logoPosition: "bottom-right",
      antialias: true,
    })
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    m.on("style.load", () => {
      addRouteLayers(m)
      mapRef.current = m
      setMap(m)
    })
    m.on("rotate", () => setBearing(m.getBearing()))
    m.on("pitchend", () => setTilted(m.getPitch() > 5))

    // Click a route to focus that trip; click empty map to go back to everything.
    m.on("click", (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ["wp-route-hit"] })[0]
      onSelectRef.current(hit ? String(hit.properties?.id) : null)
    })
    m.on("mouseenter", "wp-route-hit", () => (m.getCanvas().style.cursor = "pointer"))
    m.on("mouseleave", "wp-route-hit", () => (m.getCanvas().style.cursor = ""))

    const ro = new ResizeObserver(() => m.resize())
    ro.observe(container.current)
    return () => {
      ro.disconnect()
      m.remove()
      mapRef.current = null
      setMap(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── Day / night with the app theme (smooth lighting change, no reload) ──
  useEffect(() => {
    map?.setConfigProperty("basemap", "lightPreset", theme === "dark" ? "night" : "day")
  }, [map, theme])

  // ── Route geometry ──
  useEffect(() => {
    if (!map) return
    const all: Line[] = []
    const done: Line[] = []
    const ahead: Line[] = []
    for (const t of visible) {
      const color = TRIP_COLOR[t.status]
      const split = splitRoute(t, routes?.[t.id])
      all.push(asLine(t.id, color, [...split.done, ...split.ahead]))
      if (split.done.length > 1) done.push(asLine(t.id, color, split.done))
      if (split.ahead.length > 1) ahead.push(asLine(t.id, color, split.ahead))
    }
    ;(map.getSource(SRC.all) as mapboxgl.GeoJSONSource | undefined)?.setData(collection(all))
    ;(map.getSource(SRC.done) as mapboxgl.GeoJSONSource | undefined)?.setData(collection(done))
    ;(map.getSource(SRC.ahead) as mapboxgl.GeoJSONSource | undefined)?.setData(collection(ahead))
    map.setPaintProperty("wp-route-done", "line-width", focused ? 5 : 3)
    map.setPaintProperty("wp-route-ahead", "line-width", focused ? 3.5 : 2.5)
    map.setLayoutProperty("wp-route-arrows", "visibility", focused ? "visible" : "none")
  }, [map, visible, routes, focused])

  // ── Camera: frame whatever is in view when the focus changes (not on every live tick) ──
  const framedFor = useRef<string | null>(null)
  const frame = () => {
    if (!map) return
    const b = new mapboxgl.LngLatBounds()
    b.extend([snapshot.depot.position.lng, snapshot.depot.position.lat])
    for (const t of visible) for (const p of tripPoints(t, routes?.[t.id])) b.extend([p.lng, p.lat])
    map.fitBounds(b, {
      padding: { top: 72, left: 40, bottom: 40, right: 40 + (selectedId ? rightInset : 0) },
      pitch: 0,
      bearing: 0,
      duration: 1800,
      essential: true,
      maxZoom: 15,
    })
  }
  useEffect(() => {
    const key = `${snapshot.planId}|${selectedId ?? "all"}|${Object.keys(routes ?? {}).length > 0}`
    if (!map || framedFor.current === key) return
    framedFor.current = key
    frame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, snapshot.planId, selectedId, routes])

  return (
    <div className="relative size-full">
      <div ref={container} className="size-full" />

      {map && (
        <>
          <MbMarker map={map} position={snapshot.depot.position} zIndex={5}>
            <DepotDot name={snapshot.depot.name} />
          </MbMarker>
          {visible.flatMap((t) =>
            t.stops.map((s) => (
              <MbMarker key={s.id} map={map} position={s.position} zIndex={s.id === highlightStopId ? 30 : focused ? 15 : 10}>
                <StopDot stop={s} numbered={focused} highlight={s.id === highlightStopId} />
              </MbMarker>
            )),
          )}
          {visible
            .filter((t) => isMoving(t.status))
            .map((t) => (
              <MbMarker key={t.id} map={map} position={t.position} zIndex={t.id === selectedId ? 40 : 20} animate onClick={() => onSelect(t.id)}>
                <VehicleDot trip={{ ...t, heading: t.heading - bearing }} selected={t.id === selectedId} showLabel={focused || t.status === "DELAYED"} />
              </MbMarker>
            ))}
        </>
      )}

      <div
        className="absolute bottom-10 flex flex-col overflow-hidden rounded-lg border bg-background/90 shadow-lg backdrop-blur-md transition-[right] duration-300"
        style={{ right: 12 + (selectedId ? rightInset : 0) }}
      >
        <MapButton label="Zoom in" onClick={() => map?.zoomIn({ duration: 300 })}>
          <Plus className="size-4" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => map?.zoomOut({ duration: 300 })}>
          <Minus className="size-4" />
        </MapButton>
        <MapButton
          label={tilted ? "Flat view" : "3D view"}
          onClick={() => map?.easeTo({ pitch: tilted ? 0 : FOCUS_PITCH, bearing: tilted ? 0 : FOCUS_BEARING, duration: 900 })}
        >
          {tilted ? <Square className="size-3.5" /> : <Box className="size-3.5" />}
        </MapButton>
        <MapButton label={focused ? "Fit trip" : "Fit all trips"} onClick={() => frame()}>
          <Maximize2 className="size-3.5" />
        </MapButton>
      </div>
    </div>
  )
}

function addRouteLayers(m: mapboxgl.Map) {
  const empty = collection([])
  for (const id of Object.values(SRC)) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty })
  const color: mapboxgl.ExpressionSpecification = ["get", "color"]
  // Above roads and buildings in the Standard style.
  const slot = { slot: "top" } as const
  m.addLayer({ id: "wp-route-ahead", type: "line", source: SRC.ahead, ...slot, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 3, "line-opacity": 0.4, "line-emissive-strength": 1 } })
  m.addLayer({ id: "wp-route-done", type: "line", source: SRC.done, ...slot, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 3, "line-opacity": 0.95, "line-emissive-strength": 1 } })
  m.addLayer({
    id: "wp-route-arrows",
    type: "symbol",
    source: SRC.done,
    ...slot,
    layout: { "symbol-placement": "line", "symbol-spacing": 90, "text-field": "›", "text-size": 22, "text-keep-upright": false, "text-allow-overlap": true, visibility: "none" },
    paint: { "text-color": "#ffffff", "text-opacity": 0.9, "text-emissive-strength": 1 },
  })
  m.addLayer({ id: "wp-route-hit", type: "line", source: SRC.all, ...slot, paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 } })
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center border-b text-foreground/80 transition-colors last:border-b-0 hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

/**
 * React content as a Mapbox marker. With `animate`, position changes glide over ~1.9 s
 * (frame by frame, so panning and zooming stay perfectly in sync).
 */
function MbMarker({
  map,
  position,
  children,
  zIndex = 1,
  animate,
  onClick,
}: {
  map: mapboxgl.Map
  position: LatLng
  children: React.ReactNode
  zIndex?: number
  animate?: boolean
  onClick?: () => void
}) {
  const [el] = useState(() => document.createElement("div"))
  const marker = useRef<mapboxgl.Marker | null>(null)
  const current = useRef<LatLng>(position)

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
    if (!node) return
    node.style.zIndex = String(zIndex)
    node.onclick = onClick
      ? (e) => {
          e.stopPropagation()
          onClick()
        }
      : null
  }, [zIndex, onClick])

  return createPortal(<div className={cn("cursor-default", onClick && "cursor-pointer")}>{children}</div>, el)
}
