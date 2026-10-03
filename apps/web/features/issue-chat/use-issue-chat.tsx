"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import type { IssueChatDetail, IssueChatMessageDto, IssueChatSummary } from "@waypoint/shared"
import { useMe } from "@/hooks/use-session"
import { api, ApiError, qs } from "@/lib/api"
import { IssueChatView, type PendingIssueMessage } from "./issue-chat-view"

/** Issue group chat for the web roles (dispatcher, store manager, loader). The driver app has its own offline-aware wiring. */

export const issueChatKeys = {
  all: ["issue-chat"] as const,
  list: (status: string, depotId = "") => ["issue-chat", "list", status, depotId] as const,
  thread: (id: string) => ["issue-chat", "thread", id] as const,
  byIssue: (issueId: string) => ["issue-chat", "by-issue", issueId] as const,
}

/** `depotId` is for dispatchers, who can look at another depot's issue chats; members always see their own. */
export const useIssueChats = (status: "open" | "closed" | "all" = "open", enabled = true, depotId?: string) =>
  useQuery({ queryKey: issueChatKeys.list(status, depotId), queryFn: () => api<IssueChatSummary[]>(`/issue-chats${qs({ status, depotId })}`), staleTime: 5_000, enabled })

export const useIssueChatThread = (chatId: string | null) =>
  useQuery({ queryKey: issueChatKeys.thread(chatId ?? "-"), queryFn: () => api<IssueChatDetail>(`/issue-chats/${chatId}`), enabled: !!chatId, staleTime: 0 })

/** Chat id for an issue (created on first look for older issues). */
export const useIssueChatId = (issueId: string) =>
  useQuery({
    queryKey: issueChatKeys.byIssue(issueId),
    queryFn: async () => (await api<IssueChatDetail>(`/issue-chats/by-issue/${issueId}`)).chat.id,
    staleTime: 60_000,
  })

export function useCloseIssueChat(chatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (closed: boolean) => api<IssueChatDetail>(`/issue-chats/${chatId}/${closed ? "close" : "reopen"}`, { method: "POST" }),
    onSuccess: (d) => {
      qc.setQueryData(issueChatKeys.thread(chatId), d)
      qc.invalidateQueries({ queryKey: ["issue-chat", "list"] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the chat"),
  })
}

/** One issue chat, wired for the web: loads, marks read, sends with an optimistic bubble. */
export function IssueChatPane({ chatId, className }: { chatId: string; className?: string }) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const thread = useIssueChatThread(chatId)
  const [pending, setPending] = useState<PendingIssueMessage[]>([])

  const read = useMutation({
    mutationFn: () => api(`/issue-chats/${chatId}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-chat", "list"] }),
  })
  const markRead = read.mutate
  const onRead = useCallback(() => markRead(), [markRead])

  const send = useMutation({
    mutationFn: (v: { body: string; clientId: string }) => api<IssueChatMessageDto>(`/issue-chats/${chatId}/messages`, { method: "POST", json: v }),
    onSuccess: (msg, v) => {
      setPending((p) => p.filter((x) => x.id !== v.clientId))
      qc.setQueryData<IssueChatDetail>(issueChatKeys.thread(chatId), (d) => (d && !d.messages.some((m) => m.id === msg.id) ? { ...d, messages: [...d.messages, msg] } : d))
      qc.invalidateQueries({ queryKey: ["issue-chat", "list"] })
    },
    onError: (e, v) => {
      setPending((p) => p.map((x) => (x.id === v.clientId ? { ...x, failed: true } : x)))
      toast.error(e instanceof ApiError ? e.message : "Message not sent")
    },
  })

  const submit = (body: string) => {
    const clientId = crypto.randomUUID()
    setPending((p) => [...p, { id: clientId, body, createdAt: new Date().toISOString() }])
    send.mutate({ body, clientId })
  }

  if (!me) return null
  return (
    <IssueChatView
      className={className}
      detail={thread.data}
      loading={thread.isLoading}
      viewerId={me.id}
      viewerName={me.name}
      viewerRole={me.role}
      pending={pending}
      onRead={onRead}
      onSend={submit}
      onRetry={(id) => {
        const m = pending.find((p) => p.id === id)
        setPending((p) => p.filter((x) => x.id !== id))
        if (m) submit(m.body)
      }}
      onDiscard={(id) => setPending((p) => p.filter((x) => x.id !== id))}
    />
  )
}
