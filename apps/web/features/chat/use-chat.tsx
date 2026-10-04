"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, useContext, useEffect, useState } from "react"
import { io } from "socket.io-client"
import { toast } from "sonner"
import type {
  ChatContact,
  ChatMessage,
  ChatMessageEvent,
  ConversationSummary,
  IssueParticipant,
  MentionOption,
  OpenConversationInput,
  SendMessageInput,
} from "@waypoint/shared"
import { api, ApiError, qs } from "@/lib/api"
import { useMe } from "@/hooks/use-session"

/** Messaging data access: query keys, fetchers, mutations and the realtime link. */

export interface Thread {
  conversation: ConversationSummary
  messages: ChatMessage[]
  hasMore: boolean
}
/** A message that is still on its way to the server (or failed to get there). */
export type PendingMessage = ChatMessage & { pending?: boolean; failed?: boolean }

export const chatKeys = {
  all: ["chat"] as const,
  unread: ["chat", "unread"] as const,
  conversations: (scope: string, q: string) => ["chat", "conversations", scope, q] as const,
  contacts: (q: string, role: string) => ["chat", "contacts", q, role] as const,
  thread: (id: string) => ["chat", "thread", id] as const,
  mentions: (id: string, q: string) => ["chat", "mentions", id, q] as const,
  participants: (issueId: string) => ["chat", "participants", issueId] as const,
}

export type ChatLink = "connecting" | "live" | "offline"
const LinkCtx = createContext<ChatLink>("connecting")
export const useChatLink = () => useContext(LinkCtx)

/**
 * Opens the /chat socket while mounted. Sockets only say "something changed": messages are
 * merged into any open thread, lists and badges refetch. REST stays the source of truth, so
 * a dropped socket degrades to polling rather than to missing messages.
 */
export function ChatProvider({ wsUrl, children }: { wsUrl?: string; children: React.ReactNode }) {
  const qc = useQueryClient()
  const [link, setLink] = useState<ChatLink>("connecting")

  useEffect(() => {
    const base = wsUrl || `${window.location.protocol}//${window.location.hostname}:4000`
    const socket = io(`${base}/chat`, { withCredentials: true, transports: ["websocket"], reconnectionDelayMax: 5000 })
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] })
      qc.invalidateQueries({ queryKey: chatKeys.unread })
      qc.invalidateQueries({ queryKey: ["chat", "participants"] })
      qc.invalidateQueries({ queryKey: ["chat", "contacts"] })
    }
    socket.on("connect", () => {
      setLink("live")
      refresh() // catch up on anything missed while disconnected
      qc.invalidateQueries({ queryKey: ["chat", "thread"] })
    })
    socket.on("disconnect", () => setLink("offline"))
    socket.on("connect_error", () => setLink("offline"))
    socket.on("message", (e: ChatMessageEvent) => {
      qc.setQueryData<Thread>(chatKeys.thread(e.conversationId), (t) => (t ? { ...t, messages: mergeMessage(t.messages, e.message) } : t))
      refresh()
    })
    socket.on("read", refresh)
    socket.on("cleared", (e: { conversationId: string }) => {
      qc.removeQueries({ queryKey: chatKeys.thread(e.conversationId) })
      refresh()
    })
    socket.on("issue-chat:message", () => {
      qc.invalidateQueries({ queryKey: ["issue-chat"] })
      window.dispatchEvent(new Event("wp:issue-chat"))
    })
    // The issue agent changed state (working, waiting, plan ready); steps it ran may have changed the issue too.
    socket.on("agent:update", (e: { issueId: string }) => {
      qc.invalidateQueries({ queryKey: ["issue-agent", e.issueId] })
      qc.invalidateQueries({ queryKey: ["issue"] })
      qc.invalidateQueries({ queryKey: ["issue-actions", e.issueId] })
    })
    return () => {
      socket.disconnect()
    }
  }, [wsUrl, qc])

  return <LinkCtx.Provider value={link}>{children}</LinkCtx.Provider>
}

/** Insert once: replaces the optimistic copy (same clientId) or ignores a duplicate (same id). */
function mergeMessage(list: PendingMessage[], incoming: ChatMessage): PendingMessage[] {
  if (list.some((m) => m.id === incoming.id)) return list
  const i = incoming.clientId ? list.findIndex((m) => m.clientId === incoming.clientId) : -1
  if (i >= 0) return list.map((m, k) => (k === i ? incoming : m))
  return [...list, incoming]
}

/** Poll only while the socket is down. */
const pollWhenOffline = (link: ChatLink) => (link === "live" ? false : 15_000)

export function useUnread() {
  const link = useChatLink()
  return useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => api<{ unread: number; conversations: number }>("/chat/unread"),
    refetchInterval: pollWhenOffline(link),
  })
}

export function useConversations(scope: "all" | "unread" | "issues", q: string) {
  const link = useChatLink()
  return useQuery({
    queryKey: chatKeys.conversations(scope, q),
    queryFn: () => api<ConversationSummary[]>(`/chat/conversations${qs({ scope, q })}`),
    placeholderData: (prev) => prev,
    refetchInterval: pollWhenOffline(link),
  })
}

export function useContacts(q: string, role: string, enabled = true) {
  return useQuery({
    queryKey: chatKeys.contacts(q, role),
    queryFn: () => api<ChatContact[]>(`/chat/contacts${qs({ q, role })}`),
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useThread(id: string | null) {
  const link = useChatLink()
  return useQuery({
    queryKey: chatKeys.thread(id ?? ""),
    queryFn: () => api<Thread>(`/chat/conversations/${id}/messages`),
    enabled: !!id,
    refetchInterval: pollWhenOffline(link),
  })
}

export function useOlderMessages() {
  return useMutation({
    mutationFn: ({ id, before }: { id: string; before: string }) => api<Thread>(`/chat/conversations/${id}/messages${qs({ before })}`),
  })
}

export function useOpenConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OpenConversationInput) => api<ConversationSummary>("/chat/conversations", { method: "POST", json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "participants"] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not open the conversation"),
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/chat/conversations/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.unread })
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] })
      qc.invalidateQueries({ queryKey: ["chat", "participants"] })
    },
  })
}

/** Clear a conversation for the signed-in side only; the other side keeps its history. */
export function useClearConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/chat/conversations/${id}/clear`, { method: "POST" }),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: chatKeys.thread(id) })
      qc.invalidateQueries({ queryKey: chatKeys.all })
      toast.success("Chat cleared")
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not clear the chat"),
  })
}

/** Optimistic send: the bubble appears at once, then is swapped for the stored message. */
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const key = chatKeys.thread(conversationId)

  const patch = (clientId: string, fn: (m: PendingMessage) => PendingMessage | null) =>
    qc.setQueryData<Thread>(key, (t) =>
      t ? { ...t, messages: (t.messages as PendingMessage[]).flatMap((m) => (m.clientId === clientId ? (fn(m) ? [fn(m)!] : []) : [m])) } : t,
    )

  const mutation = useMutation({
    mutationFn: (input: SendMessageInput) => api<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { method: "POST", json: input }),
    onMutate: (input) => {
      if (!me || !input.clientId) return
      const optimistic: PendingMessage = {
        id: `tmp-${input.clientId}`,
        conversationId,
        kind: "TEXT",
        senderId: me.id,
        sender: { id: me.id, name: me.name, role: me.role },
        body: input.body,
        mentions: [],
        clientId: input.clientId,
        createdAt: new Date().toISOString(),
        pending: true,
      }
      qc.setQueryData<Thread>(key, (t) => (t ? { ...t, messages: mergeMessage(t.messages, optimistic) } : t))
    },
    onSuccess: (msg) => {
      qc.setQueryData<Thread>(key, (t) => (t ? { ...t, messages: mergeMessage(t.messages, msg) } : t))
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] })
    },
    onError: (e, input) => {
      if (input.clientId) patch(input.clientId, (m) => ({ ...m, pending: false, failed: true }))
      toast.error(e instanceof ApiError ? e.message : "Message not sent")
    },
  })

  return {
    ...mutation,
    /** Drop a failed bubble (the composer keeps nothing, so the caller re-sends the text). */
    discard: (clientId: string) => patch(clientId, () => null),
  }
}

/** What can be @mentioned: in a direct conversation or inside an issue's group chat. */
export type MentionScope = { conversationId: string } | { issueChatId: string }

export function useMentionOptions(scope: MentionScope, q: string, enabled: boolean) {
  const id = "issueChatId" in scope ? `issue:${scope.issueChatId}` : scope.conversationId
  return useQuery({
    queryKey: chatKeys.mentions(id, q),
    queryFn: () => api<MentionOption[]>("issueChatId" in scope ? `/issue-chats/${scope.issueChatId}/mentions${qs({ q })}` : `/chat/mentions${qs({ conversationId: scope.conversationId, q })}`),
    enabled: enabled && !!id,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

export function useIssueParticipants(issueId: string) {
  const link = useChatLink()
  return useQuery({
    queryKey: chatKeys.participants(issueId),
    queryFn: () => api<IssueParticipant[]>(`/chat/issues/${issueId}/participants`),
    refetchInterval: pollWhenOffline(link),
  })
}
