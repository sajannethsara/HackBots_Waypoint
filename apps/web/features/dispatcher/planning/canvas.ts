import { useCallback, useMemo, useState } from "react"
import type { DeferralReason } from "@waypoint/shared"
import type { Decision, Plan, Trip } from "@/lib/types"

/**
 * The planning canvas keeps a working copy of every trip's stop order next to the saved draft.
 * Dragging only edits the copy; Save sends it to the server, which re-times and validates it.
 */

export type Layout = Record<string, string[]>
export interface LocalDefer {
  reason: DeferralReason
  note?: string
}

export const serverLayout = (trips: Trip[]): Layout =>
  Object.fromEntries(trips.map((t) => [t.id, [...t.stops].sort((a, b) => a.seq - b.seq).map((s) => s.orderId)]))

const same = (a?: string[], b?: string[]) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i])

/** Merge a fresh server layout into local edits: clean trips follow the server, edited trips keep their edits. */
function reconcile(local: Layout, oldServer: Layout, next: Layout): Layout {
  const placedNow = new Map<string, string>()
  for (const [t, ids] of Object.entries(next)) for (const id of ids) placedNow.set(id, t)
  const out: Layout = {}
  for (const [t, ids] of Object.entries(next)) {
    const mine = local[t]
    if (!mine || same(mine, oldServer[t])) out[t] = ids
    else
      out[t] = mine.filter((id) => {
        const now = placedNow.get(id)
        // dropped only if a save moved it to another trip that did not hold it before
        return now === undefined || now === t || (oldServer[now] ?? []).includes(id)
      })
  }
  return out
}

export function useCanvas(plan: Plan) {
  const server = useMemo(() => serverLayout(plan.trips), [plan.trips])
  const sig = JSON.stringify(server)
  const [layout, setLayout] = useState<Layout>(server)
  const [defers, setDefers] = useState<Record<string, LocalDefer>>({})
  const [seen, setSeen] = useState({ sig, server })

  // Server changed (save, assign, create…): fold it into the working copy while rendering.
  if (seen.sig !== sig) {
    setSeen({ sig, server })
    setLayout((l) => reconcile(l, seen.server, server))
    setDefers((d) => Object.fromEntries(Object.entries(d).filter(([id]) => Object.values(server).some((ids) => ids.includes(id)))))
  }

  const decisions = useMemo(() => new Map(plan.decisions.map((d) => [d.orderId, d])), [plan.decisions])

  const placedLocally = useMemo(() => new Set(Object.values(layout).flat()), [layout])
  const placedOnServer = useMemo(() => new Set(Object.values(server).flat()), [server])

  /** Orders not on any trip in the working copy: deferred by the engine, or pulled out in this session. */
  const pool = useMemo(
    () =>
      plan.decisions
        .filter((d) => !placedLocally.has(d.orderId) && (d.decision === "DEFERRED" || placedOnServer.has(d.orderId)))
        .map((d) => ({ decision: d, local: defers[d.orderId] as LocalDefer | undefined })),
    [plan.decisions, placedLocally, placedOnServer, defers],
  )

  const dirtyTrips = useMemo(() => new Set(Object.keys(layout).filter((t) => !same(layout[t], server[t]))), [layout, server])
  const pendingDefers = useMemo(() => Object.keys(defers).filter((id) => !placedLocally.has(id)), [defers, placedLocally])

  const move = useCallback((tripId: string, from: number, to: number) => {
    setLayout((l) => {
      const ids = [...(l[tripId] ?? [])]
      const [x] = ids.splice(from, 1)
      ids.splice(to, 0, x)
      return { ...l, [tripId]: ids }
    })
  }, [])

  const reorder = useCallback((tripId: string, ids: string[]) => setLayout((l) => ({ ...l, [tripId]: ids })), [])

  /** Put an order on a trip (from the pool, or from another trip), at `index` or the end. */
  const place = useCallback((orderId: string, tripId: string, index?: number) => {
    setLayout((l) => {
      const next: Layout = Object.fromEntries(Object.entries(l).map(([t, ids]) => [t, ids.filter((id) => id !== orderId)]))
      const ids = [...(next[tripId] ?? [])]
      ids.splice(index ?? ids.length, 0, orderId)
      next[tripId] = ids
      return next
    })
    setDefers((d) => {
      if (!(orderId in d)) return d
      const rest = { ...d }
      delete rest[orderId]
      return rest
    })
  }, [])

  const remove = useCallback((orderId: string, why: LocalDefer) => {
    setLayout((l) => Object.fromEntries(Object.entries(l).map(([t, ids]) => [t, ids.filter((id) => id !== orderId)])))
    setDefers((d) => ({ ...d, [orderId]: why }))
  }, [])

  /** Throw away edits: one trip back to its saved state, or all of them. */
  const revert = useCallback(
    (tripId?: string) => {
      setLayout((l) => (tripId ? reconcileOne(l, server, tripId) : server))
      setDefers((d) => (tripId ? Object.fromEntries(Object.entries(d).filter(([id]) => !(server[tripId] ?? []).includes(id))) : {}))
    },
    [server],
  )

  return { layout, server, defers, pool, decisions, dirtyTrips, pendingDefers, move, reorder, place, remove, revert }
}

function reconcileOne(l: Layout, server: Layout, tripId: string): Layout {
  const restored = server[tripId] ?? []
  const next: Layout = Object.fromEntries(Object.entries(l).map(([t, ids]) => [t, ids.filter((id) => !restored.includes(id) || t === tripId)]))
  next[tripId] = restored
  return next
}

export type PoolItem = ReturnType<typeof useCanvas>["pool"][number]
export type { Decision }
