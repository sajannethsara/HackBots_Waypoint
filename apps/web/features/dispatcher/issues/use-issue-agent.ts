"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { AgentSessionDto } from "@waypoint/shared"
import { api, ApiError } from "@/lib/api"

/** The AI agent working an issue: its state, and the dispatcher's controls over it. */

export const agentKey = (issueId: string) => ["issue-agent", issueId] as const

export const useIssueAgent = (issueId: string) =>
  useQuery({
    queryKey: agentKey(issueId),
    queryFn: () => api<AgentSessionDto>(`/issues/${issueId}/agent`),
    // The socket pushes changes; poll gently while it works, in case the socket is down.
    refetchInterval: (q) => (q.state.data?.status === "THINKING" ? 5_000 : false),
  })

function useAgentMutation<TInput>(issueId: string, path: (input: TInput) => string, body: (input: TInput) => unknown, done?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => api<AgentSessionDto>(`/issues/${issueId}/agent${path(input)}`, { method: "POST", json: body(input) ?? {} }),
    onSuccess: (data) => {
      qc.setQueryData(agentKey(issueId), data)
      // Approved steps change the issue, its decisions, chat and the orders/trips they touch.
      for (const key of ["issue", "issues", "issue-actions", "issue-chat", "trip", "trips", "order", "orders", "plan"]) qc.invalidateQueries({ queryKey: [key] })
      if (done) toast.success(done)
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "The agent could not do that"),
  })
}

export const useStartAgent = (issueId: string) => useAgentMutation<void>(issueId, () => "/start", () => ({}))
export const useAgentFeedback = (issueId: string) => useAgentMutation<string>(issueId, () => "/feedback", (text) => ({ text }), "Sent to the agent")
export const useStopAgent = (issueId: string) => useAgentMutation<void>(issueId, () => "/stop", () => ({}))
export const useApproveAll = (issueId: string) => useAgentMutation<void>(issueId, () => "/approve-all", () => ({}))
export const useApproveStep = (issueId: string) =>
  useAgentMutation<{ stepId: string; payload?: Record<string, unknown> }>(issueId, (i) => `/steps/${i.stepId}/approve`, (i) => ({ payload: i.payload }))
export const useSkipStep = (issueId: string) => useAgentMutation<{ stepId: string; reason?: string }>(issueId, (i) => `/steps/${i.stepId}/skip`, (i) => ({ reason: i.reason }))
