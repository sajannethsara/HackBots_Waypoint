import { z } from "zod"
import type { Role } from "./constants"
import { MESSAGE_MAX } from "./chat"
import type { IssueSeverity, IssueStatus, IssueType } from "./issues"

/**
 * Issue group chat. Everyone an issue affects (driver, loader, store manager) talks in one room.
 * The dispatcher watches, changes the issue's status and closes the chat; they do not post.
 */

export const canPostIssueChat = (role: Role) => role !== "DISPATCHER"

export const issueChatMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(MESSAGE_MAX),
  clientId: z.string().min(8).max(64).optional(),
})
export type IssueChatMessageInput = z.infer<typeof issueChatMessageSchema>

export interface IssueChatMemberInfo {
  id: string
  name: string
  role: Role
  /** Why they are in the chat, e.g. "Driver on TRIP-013". */
  relation: string
}

export interface IssueChatMessageDto {
  id: string
  chatId: string
  kind: "TEXT" | "SYSTEM"
  senderId: string | null
  sender: { id: string; name: string; role: Role } | null
  body: string
  clientId: string | null
  createdAt: string
}

export interface IssueChatSummary {
  id: string
  issue: {
    id: string
    ref: string
    type: IssueType
    status: IssueStatus
    severity: IssueSeverity
    description: string
    tripRef: string | null
    outletName: string | null
    createdAt: string
  }
  closed: boolean
  memberCount: number
  lastMessage: { body: string; at: string; senderName: string | null; kind: "TEXT" | "SYSTEM" } | null
  /** Messages the signed-in member has not read. Always 0 for the dispatcher. */
  unread: number
  updatedAt: string
}

export interface IssueChatDetail {
  chat: IssueChatSummary & { members: IssueChatMemberInfo[]; closedAt: string | null }
  messages: IssueChatMessageDto[]
  hasMore: boolean
  /** The signed-in user may write here (a member, and the chat is open). */
  canPost: boolean
}

/** Socket events on the /chat namespace. */
export interface IssueChatMessageEvent {
  chatId: string
  message: IssueChatMessageDto
}
