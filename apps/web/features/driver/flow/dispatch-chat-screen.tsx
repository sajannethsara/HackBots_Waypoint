"use client"

import { WifiOff } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { ChatThread } from "@/features/chat/chat-thread"
import { useOpenConversation } from "@/features/chat/use-chat"
import { useDriver } from "../lib/driver-provider"

/** The driver's direct line to the dispatch desk. The same chat component the dispatcher uses. Needs signal. */
export default function DispatchChatScreen({ onClose }: { onClose: () => void }) {
  const { online } = useDriver()
  const open = useOpenConversation()
  const [id, setId] = useState<string | null>(null)
  const { mutate } = open

  useEffect(() => {
    if (online) mutate({}, { onSuccess: (c) => setId(c.id) })
  }, [online, mutate])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      {!online ? (
        <div className="m-auto grid max-w-xs gap-3 p-6 text-center">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WifiOff />
              </EmptyMedia>
              <EmptyTitle>Dispatch needs signal</EmptyTitle>
              <EmptyDescription>Your deliveries and problem reports are still saved. Message dispatch when you are back online.</EmptyDescription>
            </EmptyHeader>
          </Empty>
          <Button variant="outline" className="h-11" onClick={onClose}>
            Back
          </Button>
        </div>
      ) : id ? (
        <ChatThread conversationId={id} onBack={onClose} touch className="min-h-0" />
      ) : (
        <div className="grid gap-3 p-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="ml-auto h-10 w-1/2" />
        </div>
      )}
    </div>
  )
}
