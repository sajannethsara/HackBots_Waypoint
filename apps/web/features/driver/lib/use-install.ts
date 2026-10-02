"use client"

import { useEffect, useState } from "react"

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/** "Add to home screen" for browsers that offer it (Chrome/Edge/Android). iOS users use Share → Add to Home Screen. */
export function useInstall() {
  const [evt, setEvt] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches)

  useEffect(() => {
    const before = (e: Event) => {
      e.preventDefault()
      setEvt(e as InstallEvent)
    }
    const done = () => {
      setInstalled(true)
      setEvt(null)
    }
    window.addEventListener("beforeinstallprompt", before)
    window.addEventListener("appinstalled", done)
    return () => {
      window.removeEventListener("beforeinstallprompt", before)
      window.removeEventListener("appinstalled", done)
    }
  }, [])

  return {
    installed,
    canInstall: !!evt,
    install: async () => {
      if (!evt) return
      await evt.prompt()
      await evt.userChoice
      setEvt(null)
    },
  }
}
