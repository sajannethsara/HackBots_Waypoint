import { z } from "zod"
import { DEFERRAL_REASONS } from "./constants"

/**
 * The issue agent: an AI assistant that works an issue for dispatch. It may talk in the issue chat on
 * its own; anything that changes the system is a proposed step that a dispatcher approves (or edits, or skips).
 */

export const AGENT_STATUSES = ["IDLE", "THINKING", "WAITING", "PLAN_READY", "DONE", "FAILED"] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]

export const AGENT_STEP_STATUSES = ["PROPOSED", "DONE", "SKIPPED", "FAILED", "SUPERSEDED"] as const
export type AgentStepStatus = (typeof AGENT_STEP_STATUSES)[number]

const note = z.string().trim().max(500).optional()

/** A system decision, same shapes as the Decisions tab (issueActionSchema). */
export const agentDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("defer-order"), reason: z.enum(DEFERRAL_REASONS), note }),
  z.object({ action: z.literal("short-ship"), note }),
  z.object({ action: z.literal("carry-over"), shortShip: z.boolean().default(false), note }),
  z.object({ action: z.literal("vehicle-out-of-service"), deferRemaining: z.boolean().default(false), note }),
  z.object({ action: z.literal("vehicle-return"), note }),
])

/** What each kind of step carries. Dispatch can edit these before approving. */
export const agentStepPayloadSchemas = {
  acknowledge: z.object({}),
  invite: z.object({ userId: z.string().min(1), name: z.string().optional(), relation: z.string().optional() }),
  decision: z.object({ decision: agentDecisionSchema }),
  resolve: z.object({ playbook: z.array(z.string()).default([]), resolution: z.string().trim().min(3).max(1000) }),
} as const
export type AgentStepKind = keyof typeof agentStepPayloadSchemas
export const AGENT_STEP_KINDS = Object.keys(agentStepPayloadSchemas) as AgentStepKind[]

export type AgentStepPayload =
  | { kind: "acknowledge"; payload: z.infer<(typeof agentStepPayloadSchemas)["acknowledge"]> }
  | { kind: "invite"; payload: z.infer<(typeof agentStepPayloadSchemas)["invite"]> }
  | { kind: "decision"; payload: z.infer<(typeof agentStepPayloadSchemas)["decision"]> }
  | { kind: "resolve"; payload: z.infer<(typeof agentStepPayloadSchemas)["resolve"]> }

export const agentFeedbackSchema = z.object({ text: z.string().trim().min(2).max(1000) })
export type AgentFeedbackInput = z.infer<typeof agentFeedbackSchema>

/** Approve a step, optionally with dispatch's own edits to what it does. */
export const agentApproveSchema = z.object({ payload: z.record(z.string(), z.unknown()).optional() })
export type AgentApproveInput = z.infer<typeof agentApproveSchema>

export const agentSkipSchema = z.object({ reason: z.string().trim().max(300).optional() })
export type AgentSkipInput = z.infer<typeof agentSkipSchema>

export interface AgentStepDto {
  id: string
  plan: number
  seq: number
  kind: AgentStepKind
  title: string
  rationale: string
  payload: Record<string, unknown>
  status: AgentStepStatus
  edited: boolean
  result: string | null
  decidedBy: string | null
  decidedAt: string | null
}

export interface AgentNoteDto {
  id: string
  kind: "FEEDBACK" | "CHAT" | "RUN"
  body: string
  author: string | null
  createdAt: string
}

export interface AgentSessionDto {
  /** False when the server has no Gemini API key: the tab explains how to turn it on. */
  configured: boolean
  status: AgentStatus
  diagnosis: string | null
  waitingFor: string | null
  waitingSince: string | null
  error: string | null
  plan: number
  runs: number
  lastRunAt: string | null
  /** Steps of the latest plan first, then earlier plans' history. */
  steps: AgentStepDto[]
  notes: AgentNoteDto[]
}

/** Socket event: something about an issue's agent changed; refetch it. */
export interface AgentUpdateEvent {
  issueId: string
  status: AgentStatus
}

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE: "Not started",
  THINKING: "Working on it",
  WAITING: "Waiting for replies",
  PLAN_READY: "Plan ready for review",
  DONE: "Done",
  FAILED: "Needs attention",
}
