"use client"

import { Bell } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/** Placeholder: the notifications tab is reserved here and will be filled in later. */
export function AlertsScreen() {
  return (
    <div className="p-4">
      <Empty className="rounded-2xl border bg-card py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bell />
          </EmptyMedia>
          <EmptyTitle>Notifications</EmptyTitle>
          <EmptyDescription>Updates from dispatch, stores and the loading bay will appear here. Coming soon.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
