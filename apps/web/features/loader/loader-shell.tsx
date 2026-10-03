"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Bell, CalendarDays, MapPin } from "lucide-react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { HOME } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ChatProvider, useUnread } from "@/features/chat/use-chat"
import { useAppContext, useMe } from "@/hooks/use-session"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isFlagged } from "./model"
import { useLoaderQueue } from "./queries"
import { TOUCH } from "./touch"

function LoaderSidebar() {
  const { data: unread } = useUnread()
  const { data: trips } = useLoaderQueue("all")
  return <AppSidebar role="LOADER" badges={{ inbox: unread?.unread, flagged: trips?.filter(isFlagged).length }} />
}

/** Sticky top bar: the operating day and the loader's own depot (the API scopes everything to it). */
function LoaderBar() {
  const { data: ctx } = useAppContext()
  const { data: me } = useMe()
  return (
    <header className={cn("sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur", TOUCH)}>
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <div className="flex h-7 items-center gap-2 rounded-md border px-2.5 text-sm">
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <span className="font-medium tabular-nums">{ctx?.operatingDate ? fmtDate(ctx.operatingDate) : "—"}</span>
      </div>
      <div className="flex h-7 items-center gap-2 rounded-md border px-2.5 text-sm">
        <MapPin className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{me?.depot?.name ?? "—"}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Notifications">
          <Bell />
        </Button>
      </div>
    </header>
  )
}

export function LoaderShell({ wsUrl, children }: { wsUrl?: string; children: React.ReactNode }) {
  const router = useRouter()
  const { data: me } = useMe()
  // Signed in as another role (the proxy only checks for a session): send them to their own workspace.
  const otherRole = !!me && me.role !== "LOADER"
  useEffect(() => {
    if (me && me.role !== "LOADER") router.replace(HOME[me.role])
  }, [me, router])
  if (!me || otherRole) return null

  return (
    <ChatProvider wsUrl={wsUrl}>
      <SidebarProvider>
        <LoaderSidebar />
        <SidebarInset className="min-w-0 bg-muted/30">
          <LoaderBar />
          <div className={cn("mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-5", TOUCH)}>{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ChatProvider>
  )
}
