import type { LiveClock } from "./live"

/** Demo player: a scripted day of dispatcher events that plays once a plan is published. */

export interface DemoFeedItem {
  id: string
  /** Simulated minute of the day the event happened. */
  minute: number
  tone: "info" | "good" | "warn" | "alert"
  title: string
  body: string
}

export interface DemoState {
  on: boolean
  /** A published plan exists for the depot and day, so the day can start. */
  hasPlan: boolean
  planVersion: number | null
  clock: LiveClock
  feed: DemoFeedItem[]
}
