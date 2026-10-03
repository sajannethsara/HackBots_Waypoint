"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import type { IssueChatDetail, Role } from "@waypoint/shared"
import { Composer } from "@/features/chat/composer"
import { MessageList } from "@/features/chat/chat-thread"
import type { PendingMessage } from "@/features/chat/use-chat"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface PendingIssueMessage {
  id: string
  body: string
  createdAt: string
  failed?: boolean
}

/**
 * The room for one issue. It is the same message list and composer as a direct conversation, in
 * group mode: everyone it affects talks here, each message carries its sender's name and role, and
 * @mentions work. Presentational: the caller supplies the data and how to send (the driver app queues
 * messages offline; the web roles post straight away).
 */
export function IssueChatView({
  detail,
  loading,
  viewerId,
  viewerName,
  viewerRole,
  pending = [],
  onSend,
  onRetry,
  onDiscard,
  onRead,
  note,
  touch,
  className,
}: {
  detail?: IssueChatDetail | null
  loading?: boolean
  viewerId: string
  viewerName: string
  viewerRole: Role
  pending?: PendingIssueMessage[]
  onSend?: (body: string) => void
  onRetry?: (id: string) => void
  onDiscard?: (id: string) => void
  /** Called when the reader has seen new messages. */
  onRead?: () => void
  /** Shown above the composer, e.g. "You are offline: messages send when you reconnect". */
  note?: React.ReactNode
  /** Bigger targets for phones. */
  touch?: boolean
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const chatId = detail?.chat.id ?? ""
  const unread = detail?.chat.unread ?? 0

  const messages = useMemo<PendingMessage[]>(
    () => [
      ...(detail?.messages ?? []).map((m) => ({ ...m, conversationId: m.chatId, mentions: [] })),
      ...pending.map<PendingMessage>((p) => ({
        id: p.id,
        conversationId: chatId,
        kind: "TEXT",
        senderId: viewerId,
        sender: { id: viewerId, name: viewerName, role: viewerRole },
        body: p.body,
        mentions: [],
        clientId: p.id,
        createdAt: p.createdAt,
        pending: !p.failed,
        failed: p.failed,
      })),
    ],
    [detail?.messages, pending, chatId, viewerId, viewerName, viewerRole],
  )

  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  useEffect(() => {
    if (unread > 0) onRead?.()
  }, [unread, messages.length, onRead])

  const canPost = !!detail?.canPost && !!onSend
  const closed = detail?.chat.closed

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {loading && !detail ? (
          <div className="grid gap-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-10 w-3/5" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet. Use @ to attach a trip, outlet, order or issue.</p>
        ) : (
          <MessageList
            group
            messages={messages}
            myRole={viewerRole}
            myId={viewerId}
            onRetry={(m) => onRetry?.(m.id)}
            onDiscard={(m) => onDiscard?.(m.id)}
          />
        )}
      </div>

      {note && <div className="border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{note}</div>}

      {canPost ? (
        <Composer
          scope={{ issueChatId: chatId }}
          placeholder="Message everyone in this issue"
          mentionHint="You can mention the issue, its trip, outlet, vehicle and orders."
          onSend={onSend}
          touch={touch}
        />
      ) : (
        <p className="border-t bg-muted/40 px-3 py-2.5 text-center text-xs text-muted-foreground">
          {closed
            ? "This chat is closed. You can still read it."
            : detail
              ? "You can read this chat but not post."
              : ""}
        </p>
      )}
    </div>
  )
}
