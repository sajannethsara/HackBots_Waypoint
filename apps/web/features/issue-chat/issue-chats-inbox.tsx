"use client"

import { useState } from "react"
import { ArrowLeft, MessagesSquare } from "lucide-react"
import { ISSUE_TYPE_META } from "@waypoint/shared"
import { IssueStatusBadge, SeverityBadge } from "@/features/dispatcher/issues/issue-badges"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { shortAgo } from "@/features/chat/chat-parts"
import { cn } from "@/lib/utils"
import { IssueChatPane, useIssueChats, useIssueChatThread } from "./use-issue-chat"

/** The group chats of the issues that affect this person (loader, store manager). */
export function IssueChatsInbox() {
  const [selected, setSelected] = useState<string | null>(null)
  const list = useIssueChats("all")

  return (
    <div className="grid h-full min-h-0 overflow-hidden rounded-xl border bg-card md:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden border-r", selected && "hidden md:flex")}>
        <h1 className="border-b p-3 text-base font-semibold tracking-tight">Issue chats</h1>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.isLoading ? (
            <div className="grid gap-2 p-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !list.data?.length ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquare />
                </EmptyMedia>
                <EmptyTitle>No issue chats</EmptyTitle>
                <EmptyDescription>When a problem affects you, a chat opens here with everyone involved.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            list.data.map((c) => (
              <button key={c.id} type="button" onClick={() => setSelected(c.id)} className={cn("grid w-full gap-1 border-b px-3 py-2.5 text-left hover:bg-muted/50", selected === c.id && "bg-muted")}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{ISSUE_TYPE_META[c.issue.type].label}</span>
                  <span className="text-xs text-muted-foreground">{c.issue.ref}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{shortAgo(c.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <SeverityBadge severity={c.issue.severity} />
                  <IssueStatusBadge status={c.issue.status} />
                  {c.closed && <span className="text-[11px] text-muted-foreground">Closed</span>}
                  {c.unread > 0 && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-medium text-primary-foreground">{c.unread}</span>}
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.lastMessage ? `${c.lastMessage.senderName ? `${c.lastMessage.senderName}: ` : ""}${c.lastMessage.body}` : c.issue.description}</p>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className={cn("flex min-h-0 min-w-0 flex-col", !selected && "hidden md:flex")}>
        {selected ? (
          <Thread chatId={selected} onBack={() => setSelected(null)} />
        ) : (
          <Empty className="m-auto">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquare />
              </EmptyMedia>
              <EmptyTitle>Pick an issue</EmptyTitle>
              <EmptyDescription>Everyone it affects talks in the same chat.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  )
}

function Thread({ chatId, onBack }: { chatId: string; onBack: () => void }) {
  const { data } = useIssueChatThread(chatId)
  return (
    <>
      <header className="flex items-center gap-2 border-b p-2.5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{data ? `${ISSUE_TYPE_META[data.chat.issue.type].label} · ${data.chat.issue.ref}` : "Issue chat"}</p>
          <p className="truncate text-xs text-muted-foreground">{data ? data.chat.members.map((m) => m.name).join(", ") : ""}</p>
        </div>
        {data && <IssueStatusBadge status={data.chat.issue.status} />}
      </header>
      <IssueChatPane key={chatId} chatId={chatId} />
    </>
  )
}
