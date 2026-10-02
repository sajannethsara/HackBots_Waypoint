"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { IssueActionInput, IssueActionResult, IssueActionsResponse, IssueChatCandidate, IssueChatDetail } from "@waypoint/shared"
import { api, ApiError } from "@/lib/api"
import { issueChatKeys } from "@/features/issue-chat/use-issue-chat"

/** What the dispatcher can decide on an issue, and who they can bring into its chat. */

export const issueWorkflowKeys = {
  actions: (issueId: string) => ["issue-actions", issueId] as const,
  candidates: (chatId: string) => ["issue-chat", "candidates", chatId] as const,
}

export const useIssueActions = (issueId: string) =>
  useQuery({ queryKey: issueWorkflowKeys.actions(issueId), queryFn: () => api<IssueActionsResponse>(`/issues/${issueId}/actions`) })

/** A decision changes trips, orders, vehicles and plans, so everything that shows them refreshes. */
function useRefreshAfterDecision() {
  const qc = useQueryClient()
  return () => {
    for (const key of ["issue", "issues", "issue-actions", "trip", "trips", "order", "orders", "plan", "live", "live-routes", "vehicle", "vehicles", "outlet", "outlets", "dashboard", "issue-chat"])
      qc.invalidateQueries({ queryKey: [key] })
  }
}

export function useRunIssueAction(issueId: string) {
  const refresh = useRefreshAfterDecision()
  return useMutation({
    mutationFn: (input: IssueActionInput) => api<IssueActionResult>(`/issues/${issueId}/actions`, { method: "POST", json: input }),
    onSuccess: (r) => {
      toast.success("Decision applied", { description: r.summary })
      refresh()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not apply that decision"),
  })
}

export const useIssueChatCandidates = (chatId: string, enabled: boolean) =>
  useQuery({ queryKey: issueWorkflowKeys.candidates(chatId), queryFn: () => api<IssueChatCandidate[]>(`/issue-chats/${chatId}/candidates`), enabled })

export function useInviteToIssueChat(chatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api<IssueChatDetail>(`/issue-chats/${chatId}/members`, { method: "POST", json: { userId } }),
    onSuccess: (d) => {
      qc.setQueryData(issueChatKeys.thread(chatId), d)
      qc.invalidateQueries({ queryKey: issueWorkflowKeys.candidates(chatId) })
      qc.invalidateQueries({ queryKey: ["issue-chat", "list"] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not add them to the chat"),
  })
}

export function useRemoveFromIssueChat(chatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api<IssueChatDetail>(`/issue-chats/${chatId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: (d) => {
      qc.setQueryData(issueChatKeys.thread(chatId), d)
      qc.invalidateQueries({ queryKey: issueWorkflowKeys.candidates(chatId) })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not remove them"),
  })
}
