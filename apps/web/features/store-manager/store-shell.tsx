"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ChatSheetProvider } from "@/features/chat/chat-sheet"
import { ChatProvider, useUnread } from "@/features/chat/use-chat"
import { StoreWorkspaceBar } from "./store-workspace-bar"

function StoreSidebar() {
  const { data: unread } = useUnread()
  return <AppSidebar role="STORE_MANAGER" badges={{ inbox: unread?.unread }} />
}

/** Same frame as the dispatcher workspace (sidebar, sticky bar, padded content), scoped to one outlet. */
export function StoreShell({ wsUrl, children }: { wsUrl?: string; children: React.ReactNode }) {
  return (
    <ChatProvider wsUrl={wsUrl}>
      <ChatSheetProvider>
        <SidebarProvider>
          <StoreSidebar />
          <SidebarInset className="min-w-0 bg-muted/30">
            <StoreWorkspaceBar />
            <div className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-5">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </ChatSheetProvider>
    </ChatProvider>
  )
}
