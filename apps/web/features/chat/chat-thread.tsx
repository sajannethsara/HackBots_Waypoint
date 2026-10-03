"use client"

import Link from "next/link"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ExternalLink, Headset, MessageSquareText, Phone, RotateCcw, Trash2 } from "lucide-react"
import { ISSUE_TYPE_META, type ChatMessage, type IssueSeverity, type IssueStatus, type IssueType, type Role } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/hooks/use-session"
import { cn } from "@/lib/utils"
import { IssueStatusBadge, SeverityBadge } from "../dispatcher/issues/issue-badges"
import { clock, counterpart, dayLabel, MessageBody, PersonAvatar, RoleTag } from "./chat-parts"
import { Composer } from "./composer"
import { useMarkRead, useOlderMessages, useSendMessage, useThread, type PendingMessage } from "./use-chat"

const GROUP_GAP_MS = 5 * 60_000

/** One conversation: header, messages, composer. Used in the inbox and in the issue side sheet. */
export function ChatThread({
  conversationId,
  onBack,
  reserveClose,
  touch,
  className,
}: {
  conversationId: string
  /** Bigger targets for phones. */
  touch?: boolean
  onBack?: () => void
  /** Leave room for a close button in the top-right corner (the side sheet has one). */
  reserveClose?: boolean
  className?: string
}) {
  const { data: me } = useMe()
  const thread = useThread(conversationId)
  const send = useSendMessage(conversationId)
  const markRead = useMarkRead()
  const older = useOlderMessages()
  const [earlier, setEarlier] = useState<ChatMessage[]>([])
  const [hasMoreEarlier, setHasMoreEarlier] = useState<boolean | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prevHeight = useRef<number | null>(null)

  const latest = useMemo(() => thread.data?.messages ?? [], [thread.data?.messages])
  const messages = useMemo<PendingMessage[]>(() => {
    const seen = new Set(latest.map((m) => m.id))
    return [...earlier.filter((m) => !seen.has(m.id)), ...latest]
  }, [earlier, latest])
  const canLoadEarlier = hasMoreEarlier ?? thread.data?.hasMore ?? false

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (prevHeight.current !== null) {
      el.scrollTop = el.scrollHeight - prevHeight.current // earlier messages were prepended
      prevHeight.current = null
    } else if (stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, thread.isSuccess])

  // Reading the thread clears its unread count (server-side, shared by the whole desk).
  const lastId = latest.at(-1)?.id
  const lastFromOther = latest.at(-1)?.sender && latest.at(-1)?.sender?.role !== me?.role
  const { mutate: mark } = markRead
  useEffect(() => {
    if (!lastId || !lastFromOther || document.visibilityState !== "visible") return
    mark(conversationId)
  }, [conversationId, lastId, lastFromOther, mark])

  if (thread.isError)
    return (
      <Empty className={cn("m-4 border", className)}>
        <EmptyHeader>
          <EmptyTitle>Conversation unavailable</EmptyTitle>
          <EmptyDescription>It may have been removed, or you may not have access to it.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  const conv = thread.data?.conversation
  const other = conv && me ? counterpart(me.role, conv) : null

  const loadEarlier = () => {
    const first = messages.find((m) => !m.pending)
    if (!first) return
    prevHeight.current = scroller.current?.scrollHeight ?? null
    older.mutate(
      { id: conversationId, before: first.id },
      {
        onSuccess: (d) => {
          setEarlier((e) => [...d.messages, ...e])
          setHasMoreEarlier(d.hasMore)
        },
        onError: () => (prevHeight.current = null),
      },
    )
  }

  const submit = (body: string) => {
    stick.current = true
    send.mutate({ body, clientId: crypto.randomUUID() })
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <header className={cn("flex items-center gap-3 border-b px-3 py-2.5", reserveClose && "pr-12")}>
        {onBack && (
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to conversations" className="md:hidden">
            <ArrowLeft />
          </Button>
        )}
        {other ? (
          <>
            {me?.role !== "DISPATCHER" ? (
              // The other side is the dispatch desk: a team, not a person, so no initials.
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                <Headset className="size-4" />
              </span>
            ) : (
              <PersonAvatar name={other.name} role={other.role} />
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{other.name}</p>
                {me?.role === "DISPATCHER" && <RoleTag role={other.role} />}
              </div>
              <p className="truncate text-xs text-muted-foreground">{me?.role === "DISPATCHER" ? (other.detail ?? "") : "Replies come from whoever is on shift"}</p>
            </div>
            {other.phone && (
              <Button variant="outline" size="icon-sm" nativeButton={false} render={<a href={`tel:${other.phone}`} />} aria-label={`Call ${other.name}`} title={`Call ${other.phone}`}>
                <Phone />
              </Button>
            )}
          </>
        ) : (
          <Skeleton className="h-9 w-48" />
        )}
      </header>

      {conv?.issue && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
          <span className="font-semibold">{conv.issue.ref}</span>
          <span className="text-muted-foreground">{ISSUE_TYPE_META[conv.issue.type as IssueType]?.label}</span>
          <SeverityBadge severity={conv.issue.severity as IssueSeverity} />
          <IssueStatusBadge status={conv.issue.status as IssueStatus} />
          {me?.role === "DISPATCHER" && (
            <Link href={`/dispatcher/issues/${conv.issue.id}`} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
              Open issue <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
      )}

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}
      >
        {thread.isLoading || !me ? (
          <div className="grid gap-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-14 w-3/4" />
          </div>
        ) : messages.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareText />
              </EmptyMedia>
              <EmptyTitle>No messages yet</EmptyTitle>
              <EmptyDescription>
                {me.role === "DISPATCHER" ? `Start the conversation with ${other?.name ?? "them"}.` : "Write to the dispatch desk."} Use @ to attach an issue, trip, outlet, vehicle or order.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <MessageList
            messages={messages}
            myRole={me.role}
            myId={me.id}
            canLoadEarlier={canLoadEarlier}
            loadingEarlier={older.isPending}
            onLoadEarlier={loadEarlier}
            onRetry={(m) => {
              send.discard(m.clientId!)
              submit(m.body)
            }}
            onDiscard={(m) => send.discard(m.clientId!)}
          />
        )}
      </div>

      {conv && other && (
        <Composer
          scope={{ conversationId }}
          placeholder={`Message ${other.name}…`}
          mentionHint={`You can mention issues, trips, outlets, vehicles and orders that involve ${other.name}.`}
          onSend={submit}
          autoFocus={!touch}
          touch={touch}
        />
      )}
    </div>
  )
}

/**
 * The message bubbles. `group` is the issue-chat look: everyone's messages are shown against their
 * name and role, and "mine" means sent by me (not by my side of a two-party conversation).
 */
export function MessageList({
  messages,
  myRole,
  myId,
  group,
  canLoadEarlier,
  loadingEarlier,
  onLoadEarlier,
  onRetry,
  onDiscard,
}: {
  messages: PendingMessage[]
  myRole: Role
  myId: string
  group?: boolean
  canLoadEarlier?: boolean
  loadingEarlier?: boolean
  onLoadEarlier?: () => void
  onRetry?: (m: PendingMessage) => void
  onDiscard?: (m: PendingMessage) => void
}) {
  return (
    <div className="grid gap-0.5">
      {canLoadEarlier && onLoadEarlier && (
        <Button variant="ghost" size="xs" className="mx-auto mb-2" disabled={loadingEarlier} onClick={onLoadEarlier}>
          {loadingEarlier ? "Loading…" : "Load earlier messages"}
        </Button>
      )}
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const next = messages[i + 1]
        const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
        return (
          <div key={m.id}>
            {newDay && (
              <div className="my-3 flex items-center gap-3 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                <span className="h-px flex-1 bg-border" />
                {dayLabel(m.createdAt)}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            {m.kind === "SYSTEM" ? (
              <p className="my-2 text-center text-xs text-muted-foreground">
                <MessageBody body={m.body} viewer={myRole} /> · {clock(m.createdAt)}
              </p>
            ) : (
              <Bubble
                m={m}
                mine={group ? m.senderId === myId : m.sender?.role === myRole}
                group={group}
                byMe={m.senderId === myId}
                myRole={myRole}
                first={newDay || !prev || prev.kind === "SYSTEM" || prev.senderId !== m.senderId || +new Date(m.createdAt) - +new Date(prev.createdAt) > GROUP_GAP_MS}
                last={!next || next.kind === "SYSTEM" || next.senderId !== m.senderId || +new Date(next.createdAt) - +new Date(m.createdAt) > GROUP_GAP_MS || dayLabel(next.createdAt) !== dayLabel(m.createdAt)}
                onRetry={() => onRetry?.(m)}
                onDiscard={() => onDiscard?.(m)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Bubble({
  m,
  mine,
  byMe,
  myRole,
  group,
  first,
  last,
  onRetry,
  onDiscard,
}: {
  m: PendingMessage
  /** Sent from the viewer's side of the conversation (the desk is shared by all dispatchers). */
  mine: boolean
  byMe: boolean
  myRole: Role
  group?: boolean
  first: boolean
  last: boolean
  onRetry: () => void
  onDiscard: () => void
}) {
  return (
    <div className={cn("flex items-end gap-2", mine && "flex-row-reverse", first && "mt-2")}>
      {!mine && <div className="w-8 shrink-0">{last && m.sender && <PersonAvatar name={m.sender.name} role={m.sender.role} size="sm" />}</div>}
      <div className={cn("flex min-w-0 max-w-[82%] flex-col", mine ? "items-end" : "items-start")}>
        {first && m.sender && (!mine || !byMe) && (
          <span className="mb-0.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            {m.sender.name}
            {group && <RoleTag role={m.sender.role} />}
          </span>
        )}
        <div
          className={cn(
            "rounded-2xl px-3 py-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
            mine ? "bg-primary text-primary-foreground" : "bg-muted",
            mine ? (last ? "rounded-br-md" : "") : last ? "rounded-bl-md" : "",
            m.pending && "opacity-60",
            m.failed && "bg-destructive/10 text-foreground ring-1 ring-destructive/40",
          )}
        >
          <MessageBody body={m.body} viewer={myRole} onBrand={mine && !m.failed} />
        </div>
        {m.failed ? (
          <span className="mt-0.5 flex items-center gap-2 px-1 text-[11px] text-destructive">
            Not sent
            <button type="button" className="inline-flex items-center gap-0.5 underline" onClick={onRetry}>
              <RotateCcw className="size-3" /> Retry
            </button>
            <button type="button" className="inline-flex items-center gap-0.5 underline" onClick={onDiscard}>
              <Trash2 className="size-3" /> Discard
            </button>
          </span>
        ) : (
          last && <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{m.pending ? "Sending…" : clock(m.createdAt)}</span>
        )}
      </div>
    </div>
  )
}
