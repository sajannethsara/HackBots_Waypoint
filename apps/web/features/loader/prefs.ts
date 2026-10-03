"use client"

import { useSyncExternalStore } from "react"

/**
 * Per-device loader preferences, kept in localStorage (they are conveniences, not data the team shares).
 * Read through useSyncExternalStore so the first render matches the server and every tab stays in sync.
 * Storage can be blocked (private windows): reads fall back to the default, writes are kept in memory.
 */

export const QUEUE_TABS = ["all", "mine", "unclaimed", "locked", "flagged"] as const
export type QueueTab = (typeof QUEUE_TABS)[number]

const QUEUE_TAB_KEY = "wp.loader.queueTab"
const memory = new Map<string, string>()
const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}

function write(key: string, value: string) {
  memory.set(key, value)
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Blocked storage: the in-memory value still applies for this session.
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

/** Which tab the Loading Queue opens on when the URL does not name one. */
export function useQueueTabPref(): [QueueTab, (tab: QueueTab) => void] {
  const stored = useSyncExternalStore(subscribe, () => read(QUEUE_TAB_KEY), () => null)
  const tab = (QUEUE_TABS as readonly string[]).includes(stored ?? "") ? (stored as QueueTab) : "all"
  return [tab, (t) => write(QUEUE_TAB_KEY, t)]
}
