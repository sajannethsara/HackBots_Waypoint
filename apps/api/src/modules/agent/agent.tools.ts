import type { FunctionDeclaration } from "@google/genai"
import { AGENT_STEP_KINDS } from "@waypoint/shared"
import { z } from "zod"

/** The agent's tools. Fixed order and content, so the request prefix stays cacheable. */
export const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: "get_outlet_orders",
    description:
      "List an outlet's recent and upcoming orders (yesterday onwards): ref, status, delivery date, units, lines, and whether it is a carry-over order. Use it to see what the store will receive next and whether a carry-over order already exists.",
    parametersJsonSchema: {
      type: "object",
      properties: { outletId: { type: "string", description: "Outlet id, e.g. OUT001. Defaults to the issue's outlet." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_trip_status",
    description: "Show a trip's vehicle, driver and every stop in order with its status, planned arrival, live ETA and any risk. Use it to judge what a decision does to the rest of the run.",
    parametersJsonSchema: {
      type: "object",
      properties: { tripId: { type: "string", description: "Trip id. Defaults to the issue's trip." } },
      additionalProperties: false,
    },
  },
  {
    name: "send_chat_message",
    description:
      "Post a message in this issue's group chat, seen by everyone in it (reporter, driver, loader, store manager). Use it to ask for the facts you need or to keep people informed. Plain text, a few sentences. Call wait_for_replies afterwards if you need an answer before planning.",
    parametersJsonSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The message, addressed to people by name." } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "wait_for_replies",
    description:
      "End this turn and wait for people in the issue chat to answer. You are run again when someone replies, or when the dispatcher asks you to continue. Use only after asking something with send_chat_message.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        waitingFor: { type: "string", description: "Who you are waiting for, e.g. 'Dilani Fernando (store manager)'." },
        question: { type: "string", description: "What you asked, in a few words, so the dispatcher can see it." },
        diagnosis: { type: "string", description: "Your current read of the situation, two or three sentences." },
      },
      required: ["waitingFor", "question", "diagnosis"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_plan",
    description:
      "End this turn with a plan for the dispatcher: a short diagnosis and the ordered steps to handle the issue. Each step is approved, edited or skipped by the dispatcher. Replaces any earlier plan steps that were not acted on yet.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        diagnosis: { type: "string", description: "What happened, what matters, what you recommend. Two or three sentences." },
        steps: {
          type: "array",
          description: "Ordered steps. May be empty when there is nothing to do but wait for the dispatcher.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: [...AGENT_STEP_KINDS] },
              title: { type: "string", description: "One line the dispatcher can scan, e.g. 'Carry over 6 × Yoghurt cups to Friday's run'." },
              rationale: { type: "string", description: "Why, grounded in the facts you saw. One or two sentences." },
              payload: {
                type: "object",
                description:
                  'acknowledge: {}. invite: {"userId": "<id from the invite list>"}. decision: {"decision": {"action": ..., ...}} using the decision shapes. resolve: {"playbook": ["<playbook ids>"], "resolution": "<note the store and driver will read>"}.',
              },
            },
            required: ["kind", "title", "rationale", "payload"],
            additionalProperties: false,
          },
        },
      },
      required: ["diagnosis", "steps"],
      additionalProperties: false,
    },
  },
]

/** Tools that end the agent's turn. */
export const TERMINAL_TOOLS = new Set(["wait_for_replies", "propose_plan"])

export const toolInput = {
  get_outlet_orders: z.object({ outletId: z.string().optional() }),
  get_trip_status: z.object({ tripId: z.string().optional() }),
  send_chat_message: z.object({ text: z.string().trim().min(2).max(1000) }),
  wait_for_replies: z.object({ waitingFor: z.string().trim().min(2).max(200), question: z.string().trim().min(2).max(500), diagnosis: z.string().trim().min(2).max(1500) }),
  propose_plan: z.object({
    diagnosis: z.string().trim().min(2).max(1500),
    steps: z
      .array(z.object({ kind: z.enum(AGENT_STEP_KINDS as [string, ...string[]]), title: z.string().trim().min(2).max(160), rationale: z.string().trim().min(2).max(600), payload: z.record(z.string(), z.unknown()) }))
      .max(8),
  }),
} as const
