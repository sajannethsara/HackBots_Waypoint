"use client"

import { useMemo } from "react"
import type { StoreLiveView } from "@waypoint/shared"
import { minToHHMM } from "@/lib/format"

const W = 1000
const H = 520
const PAD = 90

type LL = { lat: number; lng: number }

/**
 * Used when no Mapbox token is configured: the same three things on a plain canvas (depot, vehicle, this outlet)
 * with the road ahead as a line. It is a diagram, not a street map, and says so.
 */
export default function StoreLiveSchematic({ view }: { view: StoreLiveView }) {
  const pts = useMemo<LL[]>(() => [view.depot.position, view.destination.position, ...(view.vehicle.departed ? [view.vehicle.position] : []), ...view.route], [view])
  const project = useMemo(() => {
    const lat0 = (pts.reduce((s, p) => s + p.lat, 0) / pts.length) * (Math.PI / 180)
    const xs = pts.map((p) => p.lng * Math.cos(lat0))
    const ys = pts.map((p) => -p.lat)
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const scale = Math.min((W - PAD * 2) / Math.max(maxX - minX, 1e-6), (H - PAD * 2) / Math.max(maxY - minY, 1e-6))
    const offX = (W - (maxX - minX) * scale) / 2
    const offY = (H - (maxY - minY) * scale) / 2
    return (p: LL) => ({ x: offX + (p.lng * Math.cos(lat0) - minX) * scale, y: offY + (-p.lat - minY) * scale })
  }, [pts])

  const depot = project(view.depot.position)
  const you = project(view.destination.position)
  const truck = project(view.vehicle.position)
  const road = view.route.map((p) => project(p)).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")
  const arrived = view.stage === "ARRIVED" || view.stage === "DELIVERED" || view.stage === "RECEIVED"

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="size-full select-none" role="img" aria-label="Delivery position diagram">
      <defs>
        <pattern id="store-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" className="stroke-border" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#store-grid)" />
      {!view.vehicle.departed && <line x1={depot.x} y1={depot.y} x2={you.x} y2={you.y} className="stroke-muted-foreground/40" strokeWidth="2" strokeDasharray="6 6" />}
      {road && <polyline points={road} fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />}

      <g transform={`translate(${depot.x} ${depot.y})`}>
        <rect x="-14" y="-14" width="28" height="28" rx="8" className="fill-foreground" />
        <text y="32" textAnchor="middle" className="fill-foreground text-[15px] font-semibold">{view.depot.name}</text>
      </g>
      <g transform={`translate(${you.x} ${you.y})`}>
        <circle r="15" fill={arrived ? "#16a34a" : "#0284c7"} stroke="white" strokeWidth="3" />
        <text y="34" textAnchor="middle" className="fill-foreground text-[15px] font-semibold">{arrived ? "Arrived" : "You"} · {view.destination.name}</text>
      </g>
      {view.vehicle.departed && (
        <g transform={`translate(${truck.x} ${truck.y})`}>
          <circle r="22" fill="#16a34a" opacity="0.25" />
          <circle r="14" fill="#16a34a" stroke="white" strokeWidth="3" />
          <text y="-24" textAnchor="middle" className="fill-foreground text-[14px] font-semibold">{view.vehicle.id}</text>
        </g>
      )}
      <text x={W - 14} y={H - 14} textAnchor="end" className="fill-muted-foreground text-[13px]">
        Diagram only · add a Mapbox token for street maps · arriving ~{minToHHMM(view.etaMin)}
      </text>
    </svg>
  )
}
