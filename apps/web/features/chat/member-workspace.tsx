"use client"

import { Suspense } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { useMe } from "@/hooks/use-session"
import { Inbox } from "./inbox"
import { ChatProvider, useUnread } from "./use-chat"

function Shell() {
  const { data: me } = useMe()
  const { data: unread } = useUnread()
  if (!me) return null
  return (
    <SidebarProvider>
      <AppSidebar role={me.role} badges={{ inbox: unread?.unread }} />
      <SidebarInset className="min-w-0 bg-muted/30">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium">Inbox</span>
        </header>
        <div className="mx-auto h-[calc(100svh-3.5rem)] w-full max-w-5xl p-3 md:p-5">
          <Suspense>
            <Inbox />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * Landing screen for loaders, drivers and store managers until their own workspaces are built:
 * a direct line to the dispatch desk. Same inbox the dispatcher uses, scoped to their own threads.
 */
export function MemberWorkspace({ wsUrl }: { wsUrl?: string }) {
  return (
    <ChatProvider wsUrl={wsUrl}>
      <Shell />
    </ChatProvider>
  )
}
