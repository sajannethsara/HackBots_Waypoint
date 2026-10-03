"use client"

import { Suspense } from "react"
import { Inbox } from "@/features/chat/inbox"
import { useWorkspace } from "@/hooks/use-workspace"

/** The dispatcher's inbox follows the depot picked in the top bar for its issue chats. */
export function DispatcherInbox() {
  const { depotId } = useWorkspace()
  return (
    <Suspense>
      <Inbox issueChatsDepotId={depotId || undefined} />
    </Suspense>
  )
}
