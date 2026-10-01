"use client"

import { useMemo } from "react"
import type { LatLng } from "@waypoint/shared"
import { TRIP_COLOR } from "../status"
import { stopColor } from "./markers"
import { splitPath, type LiveMapProps } from "./types"

const W = 1000
const H = 640
const PAD = 48

/**
 * Network schematic used when no Google Maps key is configured: same data and visual
 * language (circles + connected lines), projected onto a plain canvas.
 */
export default function SchematicLiveMap({ snapshot, trips, selectedId, onSelect }: LiveMapProps) {
  const project = useMemo(() => {
    const pts = [snapshot.depot.position, ...snapshot.trips.flatMap((t) => t.stops.map((s) => s.position))]
    const lat0 = (pts.reduce((s, p) => s + p.lat, 0) / pts.length) * (Math.PI / 180)
    const xs = pts.map((p) => p.lng * Math.cos(lat0))
    const ys = pts.map((p) => -p.lat)
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const scale = Math.min((W - PAD * 2) / Math.max(maxX - minX, 1e-6), (H - PAD * 2) / Math.max(maxY - minY, 1e-6))
    const offX = (W - (maxX - minX) * scale) / 2
    const offY = (H - (maxY - minY) * scale) / 2
    return (p: LatLng) => ({ x: offX + (p.lng * Math.cos(lat0) - minX) * scale, y: offY + (-p.lat - minY) * scale })
  }, [snapshot.depot.position, snapshot.trips])

  // District clusters give the schematic its geography: a soft halo + label per district.
  const districts = useMemo(() => {
    const groups = new Map<string, { x: number; y: number }[]>()
    for (const t of snapshot.trips)
      for (const s of t.stops) {
        const arr = groups.get(t.districtId) ?? groups.set(t.districtId, []).get(t.districtId)!
        arr.push(project(s.position))
      }
    return [...groups].map(([name, pts]) => {
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
      const r = Math.max(28, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 14
      return { name, cx, cy, r }
    })
  }, [snapshot.trips, project])

  const line = (pts: LatLng[]) => pts.map((p) => project(p)).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")
  const depot = project(snapshot.depot.position)
  const dim = (id: string) => !!selectedId && id !== selectedId

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="size-full select-none" onClick={() => onSelect(null)} role="img" aria-label="Network map">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" className="stroke-border" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />

      {districts.map((d) => (
        <g key={d.name}>
          <circle cx={d.cx} cy={d.cy} r={d.r} className="fill-muted stroke-border" strokeWidth={1} opacity={0.6} />
          <text x={d.cx + d.r * 0.72} y={d.cy - d.r * 0.72} className="fill-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            {d.name}
          </text>
        </g>
      ))}

      {trips.map((t) => {
        const { done, ahead } = splitPath(t)
        const color = TRIP_COLOR[t.status]
        const o = dim(t.id) ? 0.15 : 1
        const w = t.id === selectedId ? 3.5 : 2.2
        return (
          <g key={t.id} opacity={o}>
            {ahead.length > 1 && <polyline points={line(ahead)} fill="none" stroke={color} strokeWidth={w} strokeDasharray="2 6" strokeLinecap="round" opacity={0.75} />}
            {done.length > 1 && <polyline points={line(done)} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        )
      })}

      {trips.flatMap((t) =>
        t.stops.map((s) => {
          const p = project(s.position)
          const c = stopColor(s)
          const filled = s.status !== "PENDING"
          return (
            <circle
              key={s.id}
              cx={p.x}
              cy={p.y}
              r={5}
              className="fill-background"
              style={filled ? { fill: c } : undefined}
              stroke={c}
              strokeWidth={2.5}
              opacity={dim(t.id) ? 0.3 : 1}
            >
              <title>{`${s.outletId} · ETA ${Math.floor(s.etaMin / 60)}:${String(s.etaMin % 60).padStart(2, "0")}`}</title>
            </circle>
          )
        }),
      )}

      <g transform={`translate(${depot.x} ${depot.y})`}>
        <circle r={13} className="fill-foreground" />
        <circle r={13} fill="none" className="stroke-background" strokeWidth={3} />
        <rect x={-5} y={-4} width={10} height={8} rx={1.5} className="fill-background" />
        <text y={28} textAnchor="middle" className="fill-foreground text-[12px] font-medium">
          {snapshot.depot.name}
        </text>
      </g>

      {trips
        .filter((t) => t.status !== "SCHEDULED" && t.status !== "COMPLETED")
        .map((t) => {
          const p = project(t.position)
          const color = TRIP_COLOR[t.status]
          const sel = t.id === selectedId
          return (
            <g
              key={t.id}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: "transform 1.9s linear", cursor: "pointer" }}
              opacity={dim(t.id) ? 0.3 : 1}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(t.id)
              }}
            >
              {t.status === "DELAYED" && (
                <circle r={16} fill={color} opacity={0.25}>
                  <animate attributeName="r" values="11;20;11" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={sel ? 12 : 10} fill={color} className="stroke-background" strokeWidth={sel ? 4 : 3} />
              {(sel || t.status === "DELAYED") && (
                <text y={-17} textAnchor="middle" className="fill-foreground text-[11px] font-semibold" style={{ paintOrder: "stroke" }} stroke="var(--background)" strokeWidth={3}>
                  {t.vehicleId}
                  {t.delayMin >= 15 ? ` +${t.delayMin}m` : ""}
                </text>
              )}
            </g>
          )
        })}
      <text x={W - 12} y={H - 12} textAnchor="end" className="fill-muted-foreground text-[11px]">
        Schematic view · set GOOGLE_MAPS_API_KEY for street map
      </text>
    </svg>
  )
}
