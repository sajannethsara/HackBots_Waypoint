"use client"

import { createContext, useContext, useState } from "react"
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

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAppContext()
  // Explicit choices override the server defaults; nothing is copied into state.
  const [depotChoice, setDepotChoice] = useState<string | null>(() => readStored("wp.depot"))
  const [dateChoice, setDate] = useState<string | null>(null)
  const depotId = depotChoice ?? data?.defaultDepotId ?? ""
  const date = dateChoice ?? data?.operatingDate ?? ""

  const set = (id: string) => {
    setDepotChoice(id)
    try {
      localStorage.setItem("wp.depot", id)
    } catch {}
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
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
