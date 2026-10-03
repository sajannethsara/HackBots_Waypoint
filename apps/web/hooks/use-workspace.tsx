"use client"

import { createContext, useContext, useState, useSyncExternalStore } from "react"
import { useAppContext } from "./use-session"

/**
 * The dispatcher's working scope: which depot and which operating day.
 * Defaults to the seeded operating date and the user's own depot.
 */
interface Workspace {
  depotId: string
  date: string
  setDepotId: (id: string) => void
  setDate: (date: string) => void
  ready: boolean
}

const Ctx = createContext<Workspace | null>(null)

const DEPOT_KEY = "wp.depot"
// Kept in memory too, so the switcher still works when storage is blocked (private windows).
let memoryDepot: string | null = null
const listeners = new Set<() => void>()
function subscribeDepot(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAppContext()
  // The remembered depot lives in localStorage, which the server cannot see: read it as an external
  // store so the first client render matches the server HTML and the choice applies right after hydration.
  const storedDepot = useSyncExternalStore(subscribeDepot, () => readStored(DEPOT_KEY), () => null)
  const [dateChoice, setDate] = useState<string | null>(null)
  const depotId = storedDepot ?? data?.defaultDepotId ?? ""
  const date = dateChoice ?? data?.operatingDate ?? ""

  const set = (id: string) => {
    memoryDepot = id
    try {
      localStorage.setItem(DEPOT_KEY, id)
    } catch {}
    listeners.forEach((l) => l())
  }

  return (
    <Ctx.Provider value={{ depotId, date, setDepotId: set, setDate, ready: Boolean(depotId && date) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return ctx
}

function readStored(key: string) {
  try {
    return localStorage.getItem(key) ?? memoryDepot
  } catch {
    return memoryDepot
  }
}
