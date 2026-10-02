"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceBar } from "@/components/layout/workspace-bar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ChatProvider, useUnread } from "@/features/chat/use-chat"
import { ChatSheetProvider } from "@/features/chat/chat-sheet"
import { useIssueSummary } from "@/features/dispatcher/queries"
import { WorkspaceProvider } from "@/hooks/use-workspace"

function DispatcherSidebar() {
  const { data } = useIssueSummary()
  const { data: unread } = useUnread()
  return <AppSidebar role="DISPATCHER" badges={{ issues: data?.open, inbox: unread?.unread }} />
}

export function DispatcherShell({ wsUrl, children }: { wsUrl?: string; children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ChatProvider wsUrl={wsUrl}>
        <ChatSheetProvider>
          <SidebarProvider>
            <DispatcherSidebar />
            <SidebarInset className="min-w-0 bg-muted/30">
              <WorkspaceBar />
              <div className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-5">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </ChatSheetProvider>
      </ChatProvider>
    </WorkspaceProvider>
  )
}
