import { z } from "zod"
import type { Brand } from "./constants"
import { createIssueSchema } from "./issues"
import type { LatLng } from "./live"
import type { IssueSeverity, IssueStatus, IssueType } from "./issues"
import type { Role } from "./constants"

/**
 * Driver app contract. The phone downloads one bundle (today's trips with only what the
 * driver acts on), works from it offline, and replays its outbox through /driver/sync.
 * Every record carries a client UUID, so replays after a reconnect are no-ops.
 */

export type DriverStopStatus = "PENDING" | "ARRIVED" | "DELIVERED" | "PARTIAL" | "REFUSED" | "SKIPPED"
export type DriverTripStatus = "PLANNED" | "LOADING" | "LOADED" | "DEPARTED" | "COMPLETED" | "CANCELLED"

export interface DriverConfig {
  /** Demo mode: the phone simulates GPS along the route so the flow can be shown without driving. */
  demo: boolean
  /** Seconds between location pings (240 in production). */
  pingSeconds: number
  /** Metres within which the next stop counts as reached. */
  arriveRadiusM: number
}

export interface DriverStopLine {
  id: string
  description: string
  category: string
  quantity: number
}

export interface DriverStop {
  id: string
  seq: number
  orderRef: string
  outlet: {
    id: string
    name: string
    district: string
    position: LatLng
    /** Short access note for the driver: dock, parking restriction. */
    access: string | null
  }
  windowOpenMin: number
  windowCloseMin: number
  plannedArrivalMin: number
  etaMin: number | null
  chilled: boolean
  units: number
  /** Order note from the store (e.g. "use back entrance"). */
  note: string | null
  lines: DriverStopLine[]
  status: DriverStopStatus
  arrivedAt: string | null
  completedAt: string | null
}

/** One maneuver of a leg. `at` is where it happens; `d` the metres until the next maneuver. */
export interface DriverNavStep {
  at: [number, number]
  /** Mapbox maneuver type and modifier, e.g. "turn" / "left". */
  type: string
  mod: string | null
  /** Ready-to-read instruction, e.g. "Turn left onto Negombo Road". */
  text: string
  name: string
  d: number
}

export interface DriverIssue {
  id: string
  ref: string
  type: IssueType
  severity: IssueSeverity
  status: IssueStatus
  description: string
  createdAt: string
  /** Whoever raised it: dispatcher, loader, store manager, the driver, or "Live monitoring". */
  reportedBy: { name: string; role: Role | "SYSTEM" }
  outletName: string | null
  tripRef: string | null
  resolution: string | null
  chat: { id: string; unread: number; closed: boolean; lastMessage: string | null } | null
}

export interface DriverTrip {
  id: string
  ref: string
  tripNo: number
  brand: Brand
  status: DriverTripStatus
  plannedDepartMin: number
  plannedKm: number
  plannedDurationMin: number
  depot: { name: string; position: LatLng }
  /** One polyline per leg, [lat, lng] pairs: depot → stop 1 → … → stop n → depot. */
  legs: [number, number][][] | null
  /** Turn-by-turn steps per leg (same order as `legs`), so guidance works with no signal. */
  steps: DriverNavStep[][] | null
  vehicle: { id: string; label: string; chilled: boolean }
  stops: DriverStop[]
  /** When this driver claimed the trip at the depot (null until they do). */
  claimedAt: string | null
  /** Dispatch has let the trip out of the depot; the driver can start the run. */
  released: boolean
  departedAt: string | null
  completedAt: string | null
}

export interface DriverBundle {
  generatedAt: string
  /** Operating date the trips belong to. */
  date: string
  driver: { id: string; name: string; phone: string | null }
  config: DriverConfig
  clock: { minute: number; running: boolean; speed: number }
  trips: DriverTrip[]
  /** Issues on the driver's trips, whoever raised them, newest first. */
  issues: DriverIssue[]
}

// ───────────────────────────── Sync (device → server) ─────────────────────────────

const iso = z.string().datetime({ offset: true })

export const DRIVER_EVENT_TYPES = ["TRIP_DEPARTED", "ARRIVED", "DELIVERED", "PARTIAL", "REFUSED", "TRIP_COMPLETED"] as const
export type DriverEventType = (typeof DRIVER_EVENT_TYPES)[number]

export const podLineSchema = z.object({
  orderLineId: z.string(),
  deliveredQty: z.number().int().min(0),
  refusedQty: z.number().int().min(0).default(0),
  reason: z.string().max(200).optional(),
})

export const podSchema = z.object({
  id: z.string().min(8),
  recipientName: z.string().min(1).max(120),
  notes: z.string().max(500).optional(),
  capturedAt: iso,
  signatureId: z.string().optional(),
  photoId: z.string().optional(),
  lines: z.array(podLineSchema).max(100),
})
export type DriverPod = z.infer<typeof podSchema>

export const driverEventSchema = z.object({
  id: z.string().min(8),
  type: z.enum(DRIVER_EVENT_TYPES),
  tripId: z.string(),
  stopId: z.string().optional(),
  occurredAt: iso,
  /** Why a stop was refused or only partly delivered. */
  reason: z.string().max(300).optional(),
  /** Where the phone was when it happened (arrival and departure checks). */
  location: z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number().optional() }).optional(),
  pod: podSchema.optional(),
})
export type DriverEventInput = z.infer<typeof driverEventSchema>

export const driverLocationSchema = z.object({
  id: z.string().min(8),
  tripId: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).optional(),
  speedKmh: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  simulated: z.boolean().default(false),
  capturedAt: iso,
})
export type DriverLocationInput = z.infer<typeof driverLocationSchema>

export const driverIssueSchema = createIssueSchema.extend({ clientId: z.string().min(8), photoId: z.string().optional() })
export type DriverIssueInput = z.infer<typeof driverIssueSchema>

export const driverChatSchema = z.object({
  /** Client id of the message (idempotent resend). */
  id: z.string().min(8),
  chatId: z.string(),
  body: z.string().trim().min(1).max(2000),
  createdAt: iso,
})
export type DriverChatInput = z.infer<typeof driverChatSchema>

export const driverSyncSchema = z.object({
  deviceId: z.string().max(64).optional(),
  events: z.array(driverEventSchema).max(200).default([]),
  locations: z.array(driverLocationSchema).max(500).default([]),
  issues: z.array(driverIssueSchema).max(50).default([]),
  chats: z.array(driverChatSchema).max(100).default([]),
})
export type DriverSyncInput = z.infer<typeof driverSyncSchema>

export const driverMediaSchema = z.object({
  id: z.string().min(8),
  kind: z.enum(["SIGNATURE", "PHOTO"]),
  mimeType: z.string().max(60),
  /** Base64 without the data: prefix. Compressed on the device (≈ 100–300 KB). */
  data: z.string().max(3_000_000),
})
export type DriverMediaInput = z.infer<typeof driverMediaSchema>

export interface DriverSyncResult {
  serverTime: string
  clock: { minute: number; running: boolean; speed: number }
  /** Ids the server now holds (new or already known). The device may drop them from its outbox. */
  accepted: { events: string[]; locations: string[]; issues: string[]; chats: string[] }
  /** Ids the server will never accept (e.g. stop no longer on this trip). Shown to the driver. */
  rejected: { kind: "event" | "location" | "issue" | "chat"; id: string; reason: string }[]
}

// ───────────────────────────── Labels the driver sees ─────────────────────────────

/** Issue types a driver can raise from the road, in the order shown. */
export const DRIVER_ISSUE_TYPES = [
  "OUTLET_CLOSED",
  "ACCESS_BLOCKED",
  "VEHICLE_BREAKDOWN",
  "LOAD_DAMAGED",
  "LOAD_MISSING",
  "TEMPERATURE",
  "LATE_ARRIVAL",
  "OTHER",
] as const
