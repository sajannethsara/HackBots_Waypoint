"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export type Tab = "trip" | "map" | "issues" | "alerts" | "me"
export type Overlay = { kind: "stop"; stopId: string } | { kind: "issue"; stopId?: string } | { kind: "chat"; issueId: string } | { kind: "dispatch" } | null

interface Nav {
  tab: Tab
  setTab: (t: Tab) => void
  /** Tabs opened at least once; their screens stay mounted afterwards. */
  seen: ReadonlySet<Tab>
  overlay: Overlay
  openStop: (stopId: string) => void
  openIssue: (stopId?: string) => void
  /** An issue's group chat. */
  openChat: (issueId: string) => void
  /** The direct line to the dispatch desk. */
  openDispatch: () => void
  close: () => void
}

const NavCtx = createContext<Nav | null>(null)
export const useNav = () => {
  const c = useContext(NavCtx)
  if (!c) throw new Error("useNav outside NavProvider")
  return c
}

/** Tab + full-screen overlay state. Overlays take a history entry so the phone's back button closes them. */
export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<Tab>("trip")
  const [seen, setSeen] = useState<ReadonlySet<Tab>>(new Set<Tab>(["trip"]))
  const [overlay, setOverlay] = useState<Overlay>(null)
  const open = useRef(false)

  useEffect(() => {
    const onPop = () => {
      open.current = false
      setOverlay(null)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const show = useCallback((o: Overlay) => {
    if (!open.current) {
      window.history.pushState(window.history.state, "")
      open.current = true
    }
    setOverlay(o)
  }, [])
  const close = useCallback(() => {
    if (open.current) window.history.back()
    else setOverlay(null)
  }, [])

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    setSeen((s) => (s.has(t) ? s : new Set(s).add(t)))
  }, [])

  const value: Nav = {
    tab,
    setTab,
    seen,
    overlay,
    openStop: (stopId) => show({ kind: "stop", stopId }),
    openIssue: (stopId) => show({ kind: "issue", stopId }),
    openChat: (issueId) => show({ kind: "chat", issueId }),
    openDispatch: () => show({ kind: "dispatch" }),
    close,
  }
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>
}

export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="h-11"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
