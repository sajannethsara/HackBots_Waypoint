"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceBar } from "@/components/layout/workspace-bar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { WorkspaceProvider } from "@/hooks/use-workspace"

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <SidebarProvider>
        <AppSidebar role="DISPATCHER" />
        <SidebarInset className="min-w-0 bg-muted/30">
          <WorkspaceBar />
          <div className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-5">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceProvider>
  )
}
