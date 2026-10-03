"use client"

import { CalendarDays, MapPin, PartyPopper, Wallet } from "lucide-react"
import { BrandBadge } from "@/components/shared/badges"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAppContext, useMe } from "@/hooks/use-session"
import { fmtDate } from "@/lib/format"
import { NotificationBell } from "./notifications/notification-bell"

/** Sticky top bar: sidebar toggle, operating day and the outlet this manager is scoped to. */
export function StoreWorkspaceBar() {
  const { data: ctx } = useAppContext()
  const { data: me } = useMe()
  const cal = ctx?.calendar

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <div className="flex h-7 items-center gap-2 rounded-md border px-2.5 text-sm">
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <span className="font-medium tabular-nums">{ctx ? fmtDate(ctx.operatingDate) : "—"}</span>
      </div>
      <div className="flex h-7 min-w-0 items-center gap-2 rounded-md border px-2.5 text-sm">
        <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{me?.outlet?.name ?? "Outlet"}</span>
        {me?.outlet && <BrandBadge brand={me.outlet.brand} />}
      </div>
      <div className="hidden items-center gap-1.5 md:flex">
        {cal && cal.festivalRamp > 0 && (
          <Badge variant="outline" className="gap-1 font-normal">
            <PartyPopper className="size-3 text-amber-500" /> Festival ramp {Math.round(cal.festivalRamp * 100)}%
          </Badge>
        )}
        {cal?.isPayday && (
          <Badge variant="outline" className="gap-1 font-normal">
            <Wallet className="size-3" /> Payday
          </Badge>
        )}
        {cal?.monsoon && (
          <Badge variant="outline" className="font-normal">
            Monsoon
          </Badge>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
      </div>
    </header>
  )
}
