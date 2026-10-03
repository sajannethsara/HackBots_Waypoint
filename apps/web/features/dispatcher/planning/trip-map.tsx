"use client"

import "mapbox-gl/dist/mapbox-gl.css"
import mapboxgl from "mapbox-gl"
import { useQuery } from "@tanstack/react-query"
import { Maximize2, Minus, Plus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { fmtNum } from "@/lib/format"

/**
 * Route preview for the trip as currently arranged on the canvas (saved or not).
 * Same look as the live map: Mapbox Standard in monochrome, day/night following the theme.
 * Road geometry comes from Mapbox Directions; without it the legs are straight lines.
 */

export interface MapStop {
  orderId: string
  outletId: string
  orderRef: string
  lat: number | null | undefined
  lng: number | null | undefined
  atRisk: boolean
}

interface Pt {
  lat: number
  lng: number
}

const SRC = "wp-plan-route"
const MAX_COORDS = 25

export default function TripMap({
  token,
  depot,
  stops,
  color,
  theme,
}: {
  token: string
  depot: { name: string; lat: number | null; lng: number | null }
  stops: MapStop[]
  color: string
  theme: "light" | "dark"
}) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<mapboxgl.Map | null>(null)

  const depotPt = useMemo<Pt | null>(() => (depot.lat != null && depot.lng != null ? { lat: depot.lat, lng: depot.lng } : null), [depot.lat, depot.lng])
  const located = useMemo(() => stops.filter((s): s is MapStop & Pt => s.lat != null && s.lng != null), [stops])
  const points = useMemo(() => [...(depotPt ? [depotPt] : []), ...located], [depotPt, located])
  const straight = useMemo(() => points.map((p) => [p.lng, p.lat] as [number, number]), [points])

  const coordKey = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";")
  const road = useQuery({
    queryKey: ["plan-route", coordKey],
    enabled: points.length >= 2 && points.length <= MAX_COORDS,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordKey}?geometries=geojson&overview=full&access_token=${token}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("directions failed")
      const json = (await res.json()) as { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] }
      const r = json.routes?.[0]
      if (!r) throw new Error("no route")
      return { coords: r.geometry.coordinates, km: r.distance / 1000, min: r.duration / 60 }
    },
  })
  const line = road.data?.coords ?? straight

  // Create the map once.
  useEffect(() => {
    if (!container.current) return
    mapboxgl.accessToken = token
    const m = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      config: { basemap: { theme: "monochrome", lightPreset: theme === "dark" ? "night" : "day", showPointOfInterestLabels: false, showTransitLabels: false } },
      center: [depot.lng ?? 80.2, depot.lat ?? 7.2],
      zoom: 8,
      attributionControl: false,
    })
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    m.on("style.load", () => {
      m.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } })
      m.addLayer({ id: `${SRC}-casing`, type: "line", source: SRC, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.85 } })
      m.addLayer({ id: SRC, type: "line", source: SRC, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 4.5 } })
      setMap(m)
    })
    return () => {
      m.remove()
      setMap(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    map?.setConfigProperty("basemap", "lightPreset", theme === "dark" ? "night" : "day")
  }, [map, theme])

  // Route line + framing.
  useEffect(() => {
    if (!map) return
    ;(map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: line.length >= 2 ? line : [] },
    })
    map.setPaintProperty(SRC, "line-color", color)
    if (!points.length) return
    const b = new mapboxgl.LngLatBounds()
    for (const c of line.length ? line : straight) b.extend(c)
    for (const p of points) b.extend([p.lng, p.lat])
    map.fitBounds(b, { padding: { top: 70, bottom: 50, left: 60, right: 60 }, maxZoom: 13, duration: 700 })
  }, [map, line, color, points, straight])

  // Numbered stop markers, rebuilt when the order changes.
  useEffect(() => {
    if (!map) return
    const markers: mapboxgl.Marker[] = []
    const mk = (el: HTMLElement, p: Pt) => markers.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map))
    if (depotPt) {
      const el = document.createElement("div")
      el.title = depot.name
      el.style.cssText = "width:22px;height:22px;border-radius:6px;background:#111;color:#fff;display:grid;place-items:center;font:600 11px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"
      el.textContent = "D"
      mk(el, depotPt)
    }
    located.forEach((s, i) => {
      const el = document.createElement("div")
      el.title = `${s.outletId} · ${s.orderRef}`
      el.style.cssText = `width:24px;height:24px;border-radius:999px;background:${color};color:#fff;display:grid;place-items:center;font:600 12px system-ui;border:2px solid ${s.atRisk ? "#f59e0b" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.35)`
      el.textContent = String(stops.indexOf(s) + 1 || i + 1)
      mk(el, s)
    })
    return () => markers.forEach((m) => m.remove())
  }, [map, located, stops, depotPt, depot.name, color])

  const missing = stops.length - located.length
  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <div ref={container} className="size-full" />
      </div>
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-md bg-background/90 px-2 py-1 font-medium shadow-sm ring-1 ring-border">
          {stops.length} stop{stops.length === 1 ? "" : "s"}
          {road.data && ` · ${fmtNum(road.data.km, 1)} km driving`}
        </span>
        <span className="rounded-md bg-background/90 px-2 py-1 text-muted-foreground shadow-sm ring-1 ring-border">
          {road.isError || points.length > MAX_COORDS ? "Approximate (straight) routes" : road.data ? "Road routes · Mapbox Directions" : "Loading road route…"}
        </span>
        {missing > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700 shadow-sm ring-1 ring-amber-600/20">{missing} without coordinates</span>}
      </div>
      {!stops.length && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="rounded-lg bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm ring-1 ring-border">Add stops to this trip to see its route.</p>
        </div>
      )}
      <div className="absolute top-3 right-3 grid gap-1">
        <Button variant="outline" size="icon-sm" className="bg-background" onClick={() => map?.zoomIn()} aria-label="Zoom in">
          <Plus />
        </Button>
        <Button variant="outline" size="icon-sm" className="bg-background" onClick={() => map?.zoomOut()} aria-label="Zoom out">
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="bg-background"
          aria-label="Fit route"
          onClick={() => {
            if (!map || !points.length) return
            const b = new mapboxgl.LngLatBounds()
            for (const c of line.length ? line : straight) b.extend(c)
            for (const p of points) b.extend([p.lng, p.lat])
            map.fitBounds(b, { padding: 60, maxZoom: 13 })
          }}
        >
          <Maximize2 />
        </Button>
      </div>
    </div>
  )
}
