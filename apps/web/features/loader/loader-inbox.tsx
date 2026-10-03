"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Inbox } from "@/features/chat/inbox"
import { IssueChatsInbox } from "@/features/issue-chat/issue-chats-inbox"
import { cn } from "@/lib/utils"

/** The loader's line to dispatch: direct messages and issue group chats (`?view=issues`). */
export function LoaderInbox() {
  const router = useRouter()
  const pathname = usePathname()
  const view = useSearchParams().get("view") === "issues" ? "issues" : "messages"
  return (
    <div className="grid h-[calc(100svh-3.5rem-2.5rem)] grid-rows-[auto_1fr] gap-3">
      <div className="flex gap-1">
        {(["messages", "issues"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => router.replace(v === "issues" ? `${pathname}?view=issues` : pathname)}
            className={cn("h-8 rounded-lg px-3 text-sm font-medium", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            {v === "messages" ? "Dispatch messages" : "Issue chats"}
          </button>
        ))}
      </div>
      <div className="min-h-0">{view === "messages" ? <Inbox /> : <IssueChatsInbox />}</div>
    </div>
  )
}
