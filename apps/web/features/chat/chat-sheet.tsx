"use client"

import { usePathname } from "next/navigation"
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { Boxes, MessageSquare, Store, Truck } from "lucide-react"
import type { IssueParticipant, Role } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ChatThread } from "./chat-thread"
import { PersonAvatar, UnreadDot } from "./chat-parts"
import { useIssueParticipants, useOpenConversation } from "./use-chat"

interface OpenArgs {
  /** Who to talk to; with `issueId` the thread is scoped to that issue. */
  memberId?: string
  issueId?: string
  /** Already know the conversation (e.g. from a list)? Skips the find-or-create call. */
  conversationId?: string
}

const Ctx = createContext<{ open: (a: OpenArgs) => void } | null>(null)

export function useChatSheet() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useChatSheet must be used inside ChatSheetProvider")
  return ctx
}

/** A chat in a right-hand sheet that any screen can open, so the dispatcher never leaves what they are doing. */
export function ChatSheetProvider({ children }: { children: React.ReactNode }) {
  // The sheet belongs to the page it was opened on: navigating (e.g. via a mention) closes it.
  const pathname = usePathname()
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const shown = openedOn === pathname
  const [conversationId, setConversationId] = useState<string | null>(null)
  const openConversation = useOpenConversation()
  const { mutate } = openConversation

  const open = useCallback(
    (a: OpenArgs) => {
      setOpenedOn(pathname)
      if (a.conversationId) return setConversationId(a.conversationId)
      setConversationId(null)
      mutate({ memberId: a.memberId, issueId: a.issueId }, { onSuccess: (c) => setConversationId(c.id), onError: () => setOpenedOn(null) })
    },
    [mutate, pathname],
  )
  const value = useMemo(() => ({ open }), [open])

  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet open={shown} onOpenChange={(o) => !o && setOpenedOn(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-md">
          <SheetTitle className="sr-only">Conversation</SheetTitle>
          <SheetDescription className="sr-only">Chat with someone involved in this work</SheetDescription>
          {conversationId ? (
            <ChatThread key={conversationId} conversationId={conversationId} reserveClose />
          ) : (
            <div className="grid gap-3 p-4 pr-12">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  )
}

const CONTACT_ICON: Partial<Record<Role, typeof Truck>> = { DRIVER: Truck, LOADER: Boxes, STORE_MANAGER: Store }

/** "Talk to the people involved": one button per relevant account on an issue. */
export function IssueContacts({ issueId, className }: { issueId: string; className?: string }) {
  const { data, isLoading } = useIssueParticipants(issueId)
  const { open } = useChatSheet()

  return (
    <div className={cn("grid gap-2", className)}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Talk to the people involved</p>
      {isLoading ? (
        <Skeleton className="h-12" />
      ) : !data?.length ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No driver, loader or store manager is linked to this issue yet.</p>
      ) : (
        data.map((p) => <ContactButton key={p.id} p={p} onClick={() => open({ memberId: p.id, issueId, conversationId: p.conversationId ?? undefined })} />)
      )}
    </div>
  )
}

function ContactButton({ p, onClick }: { p: IssueParticipant; onClick: () => void }) {
  const Icon = CONTACT_ICON[p.role] ?? MessageSquare
  return (
    <Button variant="outline" className="h-auto justify-start gap-2.5 px-2.5 py-2 text-left whitespace-normal" onClick={onClick}>
      <PersonAvatar name={p.name} role={p.role} />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{p.name}</span>
        <span className="truncate text-xs font-normal text-muted-foreground">{p.relation}</span>
      </span>
      <UnreadDot count={p.unread} />
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">Chat</span>
    </Button>
  )
}
