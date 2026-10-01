import type { LatLng, LiveSnapshot, LiveTrip } from "@waypoint/shared"

export interface LiveMapProps {
  snapshot: LiveSnapshot
  /** Trips after the page's filters. */
  trips: LiveTrip[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  theme: "light" | "dark"
}

/** Split a trip's route at the vehicle: travelled part and the part still ahead. */
export function splitPath(t: LiveTrip): { done: LatLng[]; ahead: LatLng[] } {
  const i = Math.min(t.pathIndex, t.path.length - 1)
  if (t.status === "SCHEDULED" || t.status === "LOADING") return { done: [], ahead: t.path }
  if (t.status === "COMPLETED") return { done: t.path, ahead: [] }
  return { done: [...t.path.slice(0, i + 1), t.position], ahead: [t.position, ...t.path.slice(i + 1)] }
}
