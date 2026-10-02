"use client"

import { useState } from "react"
import { UserPlus } from "lucide-react"
import { ROLE_LABEL, type IssueChatCandidate, type Role } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { PersonAvatar } from "@/features/chat/chat-parts"
import { useIssueChatCandidates, useInviteToIssueChat } from "@/features/dispatcher/issues/use-issue-workflow"

const ORDER: Role[] = ["STORE_MANAGER", "LOADER", "DRIVER"]
const HEADING: Record<string, string> = { STORE_MANAGER: "Stores on this trip", LOADER: "Loaders", DRIVER: "Drivers" }

/** Dispatcher: add someone connected to the issue's trip (a loader, another store on the run) to its chat. */
export function InviteToIssueChat({ chatId, disabled }: { chatId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const candidates = useIssueChatCandidates(chatId, open)
  const invite = useInviteToIssueChat(chatId)
  const [adding, setAdding] = useState<string | null>(null)

  const groups = ORDER.map((role) => ({ role, people: (candidates.data ?? []).filter((c) => c.role === role) })).filter((g) => g.people.length)

  const add = (c: IssueChatCandidate) => {
    setAdding(c.id)
    invite.mutate(c.id, { onSettled: () => setAdding(null) })
  }

  return (
    <>
      <Button variant="outline" size="xs" disabled={disabled} onClick={() => setOpen(true)} title={disabled ? "Reopen the chat to add people" : "Add a loader or a store from this trip"}>
        <UserPlus data-icon="inline-start" /> Invite
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add people to this chat</DialogTitle>
            <DialogDescription>Loaders and the stores on the same trip. They see the whole conversation from the start.</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {candidates.isLoading ? (
              <div className="grid gap-2">
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            ) : !groups.length ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Everyone connected to this issue&apos;s trip is already in the chat.</p>
            ) : (
              <div className="grid gap-4">
                {groups.map((g) => (
                  <div key={g.role} className="grid gap-1.5">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{HEADING[g.role]}</p>
                    <ul className="divide-y rounded-lg border">
                      {g.people.map((c) => (
                        <li key={c.id} className="flex items-center gap-2.5 px-2.5 py-2">
                          <PersonAvatar name={c.name} role={c.role} />
                          <span className="grid min-w-0 flex-1 leading-tight">
                            <span className="truncate text-sm font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground">{c.relation}</span>
                          </span>
                          <Button size="xs" variant="outline" disabled={invite.isPending} onClick={() => add(c)} aria-label={`Add ${c.name} (${ROLE_LABEL[c.role]})`}>
                            {adding === c.id ? <Spinner /> : <UserPlus data-icon="inline-start" />} Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
