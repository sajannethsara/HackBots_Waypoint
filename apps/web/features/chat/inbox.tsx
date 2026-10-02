"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDeferredValue, useState } from "react"
import { Headset, MessageSquarePlus, MessagesSquare, Search } from "lucide-react"
import { ROLE_LABEL, type ConversationSummary, type Role } from "@waypoint/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMe } from "@/hooks/use-session"
import { cn } from "@/lib/utils"
import { ChatThread } from "./chat-thread"
import { counterpart, PersonAvatar, RoleTag, shortAgo, UnreadDot } from "./chat-parts"
import { useChatLink, useContacts, useConversations, useOpenConversation } from "./use-chat"

type Scope = "all" | "unread" | "issues"

/**
 * Two-pane inbox. Same screen for every role: the dispatcher sees every conversation of the
 * depot's desk and can start one with anyone; everyone else sees their own threads with the desk.
 * The open conversation lives in the URL (?c=) so it survives refresh and can be linked to.
 */
export function Inbox() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const selected = params.get("c")
  const { data: me } = useMe()
  const link = useChatLink()
  const [scope, setScope] = useState<Scope>("all")
  const [search, setSearch] = useState("")
  const q = useDeferredValue(search.trim())
  const [picking, setPicking] = useState(false)
  const list = useConversations(scope, q)
  const open = useOpenConversation()
  const role = me?.role

  const select = (id: string | null) => router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false })
  const startWithDesk = () => open.mutate({}, { onSuccess: (c) => select(c.id) })

  return (
    <div className="grid h-full min-h-0 overflow-hidden rounded-xl border bg-card md:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden border-r", selected && "hidden md:flex")}>
        <div className="grid gap-2.5 border-b p-3">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 text-base font-semibold tracking-tight">Inbox</h1>
            <span
              className={cn("size-2 rounded-full", link === "live" ? "bg-emerald-500" : link === "offline" ? "bg-amber-500" : "bg-muted-foreground/40")}
              title={link === "live" ? "Live: new messages arrive instantly" : link === "offline" ? "Reconnecting: refreshing every 15 s" : "Connecting…"}
            />
            {role === "DISPATCHER" ? (
              <Button size="sm" onClick={() => setPicking(true)}>
                <MessageSquarePlus data-icon="inline-start" /> New message
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={open.isPending} onClick={startWithDesk}>
                <Headset data-icon="inline-start" /> Message dispatch
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, outlets, issues" className="h-8 pl-8" />
          </div>
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList className="w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="issues">Issues</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {list.isLoading || !role ? (
            <div className="grid gap-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !list.data?.length ? (
            <Empty className="m-3 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquare />
                </EmptyMedia>
                <EmptyTitle>{scope === "unread" ? "All caught up" : q ? "No matches" : "No conversations yet"}</EmptyTitle>
                <EmptyDescription>
                  {role === "DISPATCHER" ? "Start one with a driver, loader or store manager, or from an issue." : "Messages from the dispatch desk will show up here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {list.data.map((c) => (
                <li key={c.id}>
                  <Row c={c} role={role} active={c.id === selected} onClick={() => select(c.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className={cn("flex min-h-0 min-w-0 flex-col", !selected && "hidden md:flex")}>
        {selected ? (
          <ChatThread key={selected} conversationId={selected} onBack={() => select(null)} />
        ) : (
          <Empty className="m-auto border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquare />
              </EmptyMedia>
              <EmptyTitle>Select a conversation</EmptyTitle>
              <EmptyDescription>
                {role === "DISPATCHER"
                  ? "You can message drivers, loaders and store managers at your depot. They can only reply to dispatch, never to each other."
                  : "You can message the dispatch desk about your work. Use @ to attach an issue, trip, outlet, vehicle or order."}
              </EmptyDescription>
            </EmptyHeader>
            {role && role !== "DISPATCHER" && (
              <EmptyContent>
                <Button size="sm" disabled={open.isPending} onClick={startWithDesk}>
                  <Headset data-icon="inline-start" /> Message dispatch
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}
      </section>

      {role === "DISPATCHER" && <NewMessageDialog open={picking} onOpenChange={setPicking} onPicked={select} />}
    </div>
  )
}

function Row({ c, role, active, onClick }: { c: ConversationSummary; role: Role; active: boolean; onClick: () => void }) {
  const who = counterpart(role, c)
  const last = c.lastMessage
  const mine = last?.senderRole && (last.senderRole === "DISPATCHER") === (role === "DISPATCHER")
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50", active && "bg-muted")}>
      <PersonAvatar name={who.name} role={who.role} />
      <span className="grid min-w-0 flex-1 grid-cols-1 gap-0.5">
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{who.name}</span>
          {last && <span className="shrink-0 text-[11px] text-muted-foreground">{shortAgo(last.at)}</span>}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {c.issue ? (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {c.issue.ref}
            </Badge>
          ) : (
            who.detail && <span className="max-w-24 shrink-0 truncate">{who.detail} ·</span>
          )}
          <span className={cn("min-w-0 flex-1 truncate", c.unread && "text-foreground")}>
            {last?.kind === "SYSTEM" ? last.body : `${mine ? "You: " : ""}${last?.body ?? ""}`}
          </span>
          <UnreadDot count={c.unread} />
        </span>
      </span>
    </button>
  )
}

/** Dispatcher only: pick anyone at the depot to start a direct conversation. */
function NewMessageDialog({ open, onOpenChange, onPicked }: { open: boolean; onOpenChange: (o: boolean) => void; onPicked: (id: string) => void }) {
  const [search, setSearch] = useState("")
  const [role, setRole] = useState("")
  const q = useDeferredValue(search.trim())
  const contacts = useContacts(q, role, open)
  const start = useOpenConversation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Anyone at this depot: loaders, drivers and store managers of the outlets you serve.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["", "Everyone"],
            ["DRIVER", "Drivers"],
            ["LOADER", "Loaders"],
            ["STORE_MANAGER", "Store managers"],
          ].map(([value, label]) => (
            <Button key={value} size="xs" variant={role === value ? "default" : "outline"} onClick={() => setRole(value)}>
              {label}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, vehicle or outlet" className="pl-8" />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          {contacts.isLoading ? (
            <div className="grid gap-2 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !contacts.data?.length ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Nobody matches.</p>
          ) : (
            <ul className="divide-y">
              {contacts.data.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={start.isPending}
                    className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left hover:bg-muted/50 disabled:opacity-60"
                    onClick={() =>
                      start.mutate(
                        { memberId: p.id },
                        {
                          onSuccess: (c) => {
                            onPicked(c.id)
                            onOpenChange(false)
                          },
                        },
                      )
                    }
                  >
                    <PersonAvatar name={p.name} role={p.role} />
                    <span className="grid min-w-0 flex-1 leading-tight">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {ROLE_LABEL[p.role]}
                        {p.detail ? ` · ${p.detail}` : ""}
                      </span>
                    </span>
                    <UnreadDot count={p.unread} />
                    <RoleTag role={p.role} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
