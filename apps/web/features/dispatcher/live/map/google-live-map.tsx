"use client"

import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { LatLng, LiveTrip } from "@waypoint/shared"
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_BACKGROUND } from "../map-styles"
import { TRIP_COLOR } from "../status"
import { DepotDot, StopDot, VehicleDot } from "./markers"
import { splitPath, type LiveMapProps } from "./types"

export default function GoogleLiveMap({ apiKey, ...props }: LiveMapProps & { apiKey: string }) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        // Remount on theme change: classic style arrays apply at creation time.
        key={props.theme}
        defaultCenter={props.snapshot.depot.position}
        defaultZoom={9}
        styles={props.theme === "dark" ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        backgroundColor={MAP_BACKGROUND[props.theme]}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        onClick={() => props.onSelect(null)}
        className="size-full"
      />
      <Layers {...props} />
    </APIProvider>
  )
}

function Layers({ snapshot, trips, selectedId, onSelect }: LiveMapProps) {
  const map = useMap()
  const [moving, setMoving] = useState(false)
  const fitted = useRef<string | null>(null)

  // Fit to the depot and every stop once per plan.
  useEffect(() => {
    if (!map || fitted.current === snapshot.planId) return
    const b = new google.maps.LatLngBounds(snapshot.depot.position)
    for (const t of snapshot.trips) for (const s of t.stops) b.extend(s.position)
    map.fitBounds(b, 48)
    fitted.current = snapshot.planId
  }, [map, snapshot])

  // Pan to the selected vehicle.
  const selected = trips.find((t) => t.id === selectedId)
  useEffect(() => {
    if (map && selected) map.panTo(selected.position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId])

  // Animate vehicles between pushes, but not while the user drags or zooms.
  useEffect(() => {
    if (!map) return
    const a = map.addListener("dragstart", () => setMoving(true))
    const b = map.addListener("zoom_changed", () => setMoving(true))
    const c = map.addListener("idle", () => setMoving(false))
    return () => [a, b, c].forEach((l) => l.remove())
  }, [map])

  const dim = (t: LiveTrip) => !!selectedId && t.id !== selectedId

  return (
    <>
      {trips.map((t) => (
        <Route key={t.id} trip={t} dim={dim(t)} selected={t.id === selectedId} />
      ))}
      <HtmlMarker position={snapshot.depot.position} zIndex={5}>
        <DepotDot name={snapshot.depot.name} />
      </HtmlMarker>
      {trips.flatMap((t) =>
        t.stops.map((s) => (
          <HtmlMarker key={s.id} position={s.position} zIndex={10}>
            <StopDot stop={s} dim={dim(t)} />
          </HtmlMarker>
        )),
      )}
      {trips
        .filter((t) => t.status !== "SCHEDULED" && t.status !== "COMPLETED")
        .map((t) => (
          <HtmlMarker key={t.id} position={t.position} zIndex={t.id === selectedId ? 40 : 20} animate={!moving} onClick={() => onSelect(t.id)}>
            <VehicleDot trip={t} selected={t.id === selectedId} dim={dim(t)} showLabel={t.id === selectedId || t.status === "DELAYED"} />
          </HtmlMarker>
        ))}
    </>
  )
}

/** Travelled part solid, remaining part dotted, in the trip's status colour. */
function Route({ trip, dim, selected }: { trip: LiveTrip; dim: boolean; selected: boolean }) {
  const map = useMap()
  const maps = useMapsLibrary("maps")
  const lines = useRef<{ done: google.maps.Polyline; ahead: google.maps.Polyline } | null>(null)

  useEffect(() => {
    if (!map || !maps) return
    const done = new maps.Polyline({ map, clickable: false, geodesic: true })
    const ahead = new maps.Polyline({ map, clickable: false, geodesic: true, strokeOpacity: 0 })
    lines.current = { done, ahead }
    return () => {
      done.setMap(null)
      ahead.setMap(null)
    }
  }, [map, maps])

  useEffect(() => {
    if (!lines.current) return
    const color = TRIP_COLOR[trip.status]
    const opacity = dim ? 0.15 : 1
    const { done, ahead } = splitPath(trip)
    lines.current.done.setOptions({ path: done, strokeColor: color, strokeOpacity: 0.9 * opacity, strokeWeight: selected ? 4 : 3, zIndex: selected ? 3 : 1 })
    lines.current.ahead.setOptions({
      path: ahead,
      zIndex: selected ? 3 : 1,
      icons: [
        {
          icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7 * opacity, strokeColor: color, scale: selected ? 2.5 : 2 },
          offset: "0",
          repeat: "9px",
        },
      ],
    })
  }, [trip, dim, selected, maps])

  return null
}

/** Renders React content at a lat/lng via an OverlayView, so markers are styled like the rest of the UI. */
function HtmlMarker({
  position,
  children,
  zIndex = 1,
  animate,
  onClick,
}: {
  position: LatLng
  children: React.ReactNode
  zIndex?: number
  animate?: boolean
  onClick?: () => void
}) {
  const map = useMap()
  const maps = useMapsLibrary("maps")
  const [el] = useState(() => {
    const d = document.createElement("div")
    d.style.position = "absolute"
    d.style.transform = "translate(-50%, -50%)"
    return d
  })
  const overlay = useRef<(google.maps.OverlayView & { pos: google.maps.LatLng }) | null>(null)

  useEffect(() => {
    if (!map || !maps) return
    class Overlay extends maps.OverlayView {
      pos = new google.maps.LatLng(position)
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(el)
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(el)
      }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(this.pos)
        if (p) {
          el.style.left = `${p.x}px`
          el.style.top = `${p.y}px`
        }
      }
      onRemove() {
        el.remove()
      }
    }
    const o = new Overlay()
    o.setMap(map)
    overlay.current = o
    return () => o.setMap(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, maps, el])

  useEffect(() => {
    if (!overlay.current) return
    overlay.current.pos = new google.maps.LatLng(position)
    overlay.current.draw()
  }, [position.lat, position.lng, position])

  useEffect(() => {
    el.style.zIndex = String(zIndex)
    el.style.transition = animate ? "left 1.9s linear, top 1.9s linear" : "none"
    el.onclick = onClick
      ? (e) => {
          e.stopPropagation()
          onClick()
        }
      : null
  }, [el, zIndex, animate, onClick])

  return createPortal(children, el)
}
