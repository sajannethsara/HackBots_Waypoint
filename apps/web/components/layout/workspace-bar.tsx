"use client"

import { Bell, CalendarDays, MapPin, PartyPopper, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAppContext } from "@/hooks/use-session"
import { useWorkspace } from "@/hooks/use-workspace"
import { DemoPlayer } from "@/features/dispatcher/demo/demo-player"
import { fmtDate } from "@/lib/format"

/** Sticky top bar: sidebar toggle, operating day, depot scope and the day's demand drivers. */
export function WorkspaceBar() {
  const { data: ctx } = useAppContext()
  const ws = useWorkspace()
  const cal = ctx?.calendar
  const depotName = (id: string) => ctx?.depots.find((d) => d.id === id)?.name ?? "Depot"

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <div className="flex h-7 items-center gap-2 rounded-md border px-2.5 text-sm">
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <span className="font-medium tabular-nums">{ws.date ? fmtDate(ws.date) : "—"}</span>
      </div>
      <Select value={ws.depotId} onValueChange={(v) => v && ws.setDepotId(String(v))}>
        <SelectTrigger size="sm" className="w-40">
          <MapPin className="size-3.5 text-muted-foreground" />
          <SelectValue>{(v: string) => depotName(v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ctx?.depots.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        {cal && <span className="text-xs text-muted-foreground">ISO week {cal.isoWeek}</span>}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <DemoPlayer />
        <Button variant="ghost" size="icon-sm" aria-label="Notifications">
          <Bell />
        </Button>
      </div>
    </header>
  )
}
