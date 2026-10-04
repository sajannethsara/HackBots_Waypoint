"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Bell, BellOff, CheckCheck } from "lucide-react"
import type { StoreNotification } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useMarkNotificationsRead, useStoreNotifications } from "../queries"

/** Older notifications were written with the pre-rename `/store` prefix. */
const hrefOf = (link: string | null) => (link ? link.replace(/^\/store(?=\/|$)/, "/store-manager") : null)

/** The bell in the top bar: unread count, the latest notifications, and mark-as-read. Polls every 30 s. */
export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useStoreNotifications()
  const mark = useMarkNotificationsRead()
  const unread = data?.unread ?? 0

  function openItem(n: StoreNotification) {
    if (!n.readAt) mark.mutate([n.id])
    const href = hrefOf(n.link)
    setOpen(false)
    if (href) router.push(href)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} />}>
        <Bell />
        {unread > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Notifications" className="w-[360px] max-w-[calc(100vw-1.5rem)] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <Button variant="ghost" size="xs" disabled={unread === 0 || mark.isPending} onClick={() => mark.mutate(undefined)}>
            <CheckCheck data-icon="inline-start" /> Mark all read
          </Button>
        </div>
        {isLoading ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : isError || !data ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Could not load notifications.</p>
        ) : data.items.length === 0 ? (
          <div className="grid justify-items-center gap-1 p-8 text-center">
            <BellOff className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">You’re all caught up</p>
            <p className="text-xs text-muted-foreground">New updates about your orders and deliveries show up here.</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto overscroll-contain">
            <ul>
              {data.items.map((n) => (
                <li key={n.id} className="border-b last:border-b-0">
                  <button type="button" onClick={() => openItem(n)} className={cn("flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/60", !n.readAt && "bg-primary/5")}>
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                      <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="border-t px-3 py-2">
          <Link href="/store-manager/settings" onClick={() => setOpen(false)} className="text-xs text-primary hover:underline">
            Notification settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
