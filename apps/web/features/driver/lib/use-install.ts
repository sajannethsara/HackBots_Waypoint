"use client"

import { useEffect, useState } from "react"

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type Platform = "ios" | "android" | "other"

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** "Add to home screen" for browsers that offer it (Chrome/Edge/Android). iOS users use Share → Add to Home Screen. */
export function useInstall() {
  const [evt, setEvt] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [checked, setChecked] = useState(false)
  const [platform, setPlatform] = useState<Platform>("other")

  useEffect(() => {
    setInstalled(isStandalone())
    const ua = navigator.userAgent
    setPlatform(/iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "other")
    setChecked(true)

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
    /** False until the first client-side check has run (avoids a flash of the install step). */
    checked,
    installed,
    platform,
    canInstall: !!evt,
    install: async () => {
      if (!evt) return
      await evt.prompt()
      await evt.userChoice
      setEvt(null)
    },
  }
}
