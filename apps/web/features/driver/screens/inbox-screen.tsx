"use client"

import { Suspense } from "react"
import { WifiOff } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Inbox } from "@/features/chat/inbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useDriver } from "../lib/driver-provider"

/** Direct line to dispatch. Messages need a connection; everything else in the app does not. */
export default function InboxScreen() {
  const { online } = useDriver()
  if (!online)
    return (
      <div className="p-4">
        <Empty className="rounded-2xl border bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WifiOff />
            </EmptyMedia>
            <EmptyTitle>Messages need signal</EmptyTitle>
            <EmptyDescription>Your deliveries and reports are still being saved. Messages will load when you are back online.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  return (
    <div className="h-full p-2">
      <Suspense fallback={<Skeleton className="h-full w-full rounded-xl" />}>
        <Inbox />
      </Suspense>
    </div>
  )
}
