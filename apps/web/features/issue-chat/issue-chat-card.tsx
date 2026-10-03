"use client"

import { Lock, LockOpen, MessagesSquare, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { TagBadge } from "@/components/shared/badges"
import { PersonAvatar } from "@/features/chat/chat-parts"
import { useRemoveFromIssueChat } from "@/features/dispatcher/issues/use-issue-workflow"
import { cn } from "@/lib/utils"
import { InviteToIssueChat } from "./invite-dialog"
import { IssueChatPane, useCloseIssueChat, useIssueChatId, useIssueChatThread } from "./use-issue-chat"

/**
 * Dispatcher's view of an issue's group chat: read along, see who is in it, invite more people from
 * the trip, close or reopen it. Dispatch decides and resolves (the other tabs); the people involved talk here.
 */
export function IssueChatCard({ issueId, bare, className }: { issueId: string; /** Render without the outer card (inside a tab). */ bare?: boolean; className?: string }) {
  const id = useIssueChatId(issueId)
  if (id.isError)
    return (
      <div className="grid gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <p>The issue chat could not be opened.</p>
        <Button size="xs" variant="outline" className="mx-auto" onClick={() => id.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (id.isLoading || !id.data) return <Skeleton className="h-96 rounded-xl" />
  return <ChatCard chatId={id.data} bare={bare} className={className} />
}

/** The chat for a known chat id. `fill` stretches it to the height of its container (the inbox pane). */
export function IssueChatPanel({ chatId, fill, className }: { chatId: string; fill?: boolean; className?: string }) {
  return <ChatCard chatId={chatId} bare={!fill} fill={fill} className={className} />
}

function ChatCard({ chatId, bare, fill, className }: { chatId: string; bare?: boolean; fill?: boolean; className?: string }) {
  const { data } = useIssueChatThread(chatId)
  const close = useCloseIssueChat(chatId)
  const remove = useRemoveFromIssueChat(chatId)
  const closed = data?.chat.closed
  const resolved = data?.chat.issue.status === "RESOLVED"

  const header = (
    <div className="grid gap-2 border-b p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessagesSquare className="size-4 text-primary" /> Issue chat
        {closed && <TagBadge tone="gray">Closed</TagBadge>}
        <span className="ml-auto flex items-center gap-1.5">
          <InviteToIssueChat chatId={chatId} disabled={!data || !!closed} />
          <Button variant="outline" size="xs" disabled={!data || close.isPending || (resolved && !!closed)} title={resolved ? "A resolved issue keeps its chat closed" : undefined} onClick={() => close.mutate(!closed)}>
            {close.isPending ? <Spinner /> : closed ? <LockOpen data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
            {closed ? "Reopen" : "Close"}
          </Button>
        </span>
      </div>
      {data &&
        (data.chat.members.length ? (
          <div className="flex flex-wrap gap-1.5">
            {data.chat.members.map((m) => {
              const invited = m.relation.startsWith("Invited")
              return (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-xs" title={m.relation}>
                  <PersonAvatar name={m.name} role={m.role} size="sm" />
                  <span className="leading-tight">
                    {m.name}
                    <span className="block text-[10px] text-muted-foreground">{m.relation}</span>
                  </span>
                  {invited && !closed && (
                    <button type="button" className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label={`Remove ${m.name} from the chat`} title="Remove from chat" disabled={remove.isPending} onClick={() => remove.mutate(m.id)}>
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No driver, loader or store manager is linked to this issue yet. Invite someone from the trip.</p>
        ))}
    </div>
  )

  const body = (
    <div className={cn("flex min-h-0 flex-1 flex-col", !fill && (bare ? "h-112" : "h-96"))}>
      <IssueChatPane chatId={chatId} />
    </div>
  )

  if (fill)
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {header}
        {body}
      </div>
    )

  if (bare)
    return (
      <div className={cn("flex flex-col overflow-hidden rounded-lg border", className)}>
        {header}
        {body}
      </div>
    )

  return (
    <Card size="sm" className={cn("h-fit gap-0 overflow-hidden p-0", className)}>
      <CardHeader className="p-0">
        <CardTitle className="sr-only">Issue chat</CardTitle>
        {header}
      </CardHeader>
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  )
}
