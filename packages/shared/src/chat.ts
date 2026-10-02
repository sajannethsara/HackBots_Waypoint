import { z } from "zod"
import type { Role } from "./constants"

/**
 * Messaging rules, shared by the API (enforcement) and the UI (affordances).
 *
 * Star topology: the dispatch desk talks to everyone; loaders, drivers and store managers
 * talk only to the dispatch desk of their depot, never to each other.
 */
export const CHAT_PEERS: Record<Role, readonly Role[]> = {
  DISPATCHER: ["LOADER", "DRIVER", "STORE_MANAGER"],
  LOADER: ["DISPATCHER"],
  DRIVER: ["DISPATCHER"],
  STORE_MANAGER: ["DISPATCHER"],
}
export const canChat = (a: Role, b: Role) => CHAT_PEERS[a].includes(b)

export const MESSAGE_MAX = 2000

// ── @mentions ──
// Typed in the composer as "@" + a search, stored in the body as @[type:id|label].

export const MENTION_TYPES = ["issue", "trip", "outlet", "vehicle", "order"] as const
export type MentionType = (typeof MENTION_TYPES)[number]
export const MENTION_LABEL: Record<MentionType, string> = {
  issue: "Issue",
  trip: "Trip",
  outlet: "Outlet",
  vehicle: "Vehicle",
  order: "Order",
}

export interface MentionRef {
  type: MentionType
  id: string
  label: string
}

const TOKEN = /@\[(issue|trip|outlet|vehicle|order):([^\]|]+)\|([^\]]*)\]/g
export const mentionToken = (m: MentionRef) => `@[${m.type}:${m.id}|${m.label.replace(/[\]|]/g, " ")}]`

/** Split a body into plain text and mention chips, in order. */
export function parseBody(body: string): (string | MentionRef)[] {
  const out: (string | MentionRef)[] = []
  let last = 0
  for (const m of body.matchAll(TOKEN)) {
    if (m.index > last) out.push(body.slice(last, m.index))
    out.push({ type: m[1] as MentionType, id: m[2], label: m[3] })
    last = m.index + m[0].length
  }
  if (last < body.length) out.push(body.slice(last))
  return out
}

/** Plain-text rendering for previews and notifications: "@[trip:x|TRIP-019]" -> "@TRIP-019". */
export const bodyPreview = (body: string) => body.replace(TOKEN, (_, __, ___, label) => `@${label}`)

// ── Wire types ──

export interface ChatMessage {
  id: string
  conversationId: string
  kind: "TEXT" | "SYSTEM"
  senderId: string | null
  sender: { id: string; name: string; role: Role } | null
  body: string
  mentions: MentionRef[]
  clientId: string | null
  createdAt: string
}

export interface ChatPerson {
  id: string
  name: string
  role: Role
  /** Outlet name for store managers, vehicle for drivers, depot for loaders. */
  detail: string | null
  phone?: string | null
}

export interface ConversationSummary {
  id: string
  kind: "DIRECT" | "ISSUE"
  /** The member on the other side of the dispatch desk. */
  member: ChatPerson
  issue: { id: string; ref: string; type: string; status: string; severity: string } | null
  lastMessage: { body: string; at: string; senderRole: Role | null; kind: "TEXT" | "SYSTEM" } | null
  /** Messages the signed-in side has not read yet. */
  unread: number
  updatedAt: string
}

export interface ChatContact extends ChatPerson {
  /** Existing direct conversation, when there is one. */
  conversationId: string | null
  unread: number
}

export interface IssueParticipant extends ChatPerson {
  /** Why this person is on the issue. */
  relation: string
  conversationId: string | null
  unread: number
}

export interface MentionOption extends MentionRef {
  hint: string | null
}

// ── Inputs ──

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(MESSAGE_MAX),
  clientId: z.string().min(8).max(64).optional(),
})
export type SendMessageInput = z.infer<typeof sendMessageSchema>

export const openConversationSchema = z
  .object({
    /** Dispatchers pick who to talk to; members always talk to their own desk. */
    memberId: z.string().min(1).optional(),
    issueId: z.string().min(1).optional(),
  })
  .strict()
export type OpenConversationInput = z.infer<typeof openConversationSchema>

/** Socket events on the /chat namespace. */
export interface ChatMessageEvent {
  conversationId: string
  message: ChatMessage
}
