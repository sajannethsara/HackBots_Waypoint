"use client"

import { Suspense, useState } from "react"
import { Inbox } from "@/features/chat/inbox"
import { IssueChatsInbox } from "@/features/issue-chat/issue-chats-inbox"
import { cn } from "@/lib/utils"

/** Dispatch messages and the issue chats the store manager belongs to, inside the store shell. */
export function StoreInbox() {
  const [view, setView] = useState<"messages" | "issues">("messages")
  return (
    <div className="flex h-[calc(100svh-8.5rem)] min-h-[480px] flex-col gap-3">
      <div className="flex gap-1">
        {(["messages", "issues"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn("h-8 rounded-lg px-3 text-sm font-medium", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            {v === "messages" ? "Dispatch messages" : "Issue chats"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <Suspense>{view === "messages" ? <Inbox /> : <IssueChatsInbox />}</Suspense>
      </div>
    </div>
  )
}
