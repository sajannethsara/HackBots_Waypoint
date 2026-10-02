"use client"

import { ChevronRight, MessagesSquare, PackageX } from "lucide-react"
import { ISSUE_TYPE_META, ROLE_LABEL, type DriverIssue } from "@waypoint/shared"
import { IssueStatusBadge, SeverityBadge } from "@/features/dispatcher/issues/issue-badges"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDriver } from "../lib/driver-provider"
import { useNav } from "../nav"
import { SectionTitle } from "../ui"

/** Issues on the driver's trips, whoever raised them (dispatch, loader, store, the driver, live monitoring). */
export function IssuesScreen() {
  const { bundle, outbox } = useDriver()
  const { openChat, openIssue } = useNav()
  const open = bundle.issues.filter((i) => i.status !== "RESOLVED")
  const resolved = bundle.issues.filter((i) => i.status === "RESOLVED")
  // Reports made on this phone that have not reached dispatch yet.
  const queued = outbox.filter((i) => i.kind === "issue" && !i.failed)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
      <Button variant="outline" className="h-11" onClick={() => openIssue()}>
        <PackageX data-icon="inline-start" /> Report a problem
      </Button>

      {queued.length > 0 && (
        <div className="grid min-w-0 gap-2">
          <SectionTitle>Waiting to send · {queued.length}</SectionTitle>
          {queued.map((q) => {
            const p = q.payload as { type: keyof typeof ISSUE_TYPE_META; description: string }
            return (
              <div key={q.id} className="rounded-xl border border-dashed bg-card px-3 py-2.5 text-sm">
                <p className="font-medium">{ISSUE_TYPE_META[p.type]?.label ?? "Problem"}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Saved on this phone. Sends when you have signal.</p>
              </div>
            )
          })}
        </div>
      )}

      {bundle.issues.length === 0 && queued.length === 0 ? (
        <Empty className="rounded-2xl border bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquare />
            </EmptyMedia>
            <EmptyTitle>No issues on your trip</EmptyTitle>
            <EmptyDescription>Problems raised by dispatch, the loader, a store or you will show up here with a chat for everyone involved.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {open.length > 0 && <SectionTitle>Open · {open.length}</SectionTitle>}
          <div className="grid gap-2">
            {open.map((i) => (
              <IssueRow key={i.id} issue={i} onClick={() => openChat(i.id)} />
            ))}
          </div>
          {resolved.length > 0 && <SectionTitle>Resolved · {resolved.length}</SectionTitle>}
          <div className="grid gap-2">
            {resolved.map((i) => (
              <IssueRow key={i.id} issue={i} onClick={() => openChat(i.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function IssueRow({ issue: i, onClick }: { issue: DriverIssue; onClick: () => void }) {
  const unread = i.chat?.unread ?? 0
  return (
    <button type="button" onClick={onClick} className={cn("grid min-w-0 gap-1.5 rounded-xl border bg-card px-3 py-3 text-left transition-colors active:bg-muted", i.status === "RESOLVED" && "opacity-75")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold">{ISSUE_TYPE_META[i.type].label}</span>
        <span className="text-xs text-muted-foreground">{i.ref}</span>
        <SeverityBadge severity={i.severity} />
        <IssueStatusBadge status={i.status} />
        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{i.description}</p>
      <p className="text-xs text-muted-foreground">
        {i.reportedBy.role === "SYSTEM" ? i.reportedBy.name : `${i.reportedBy.name} · ${ROLE_LABEL[i.reportedBy.role]}`} · {timeAgo(i.createdAt)}
        {i.outletName ? ` · ${i.outletName}` : ""}
      </p>
      {i.chat && (
        <p className="flex items-center gap-1.5 border-t pt-1.5 text-xs">
          <MessagesSquare className="size-3.5 text-muted-foreground" />
          <span className={cn("min-w-0 flex-1 truncate", unread ? "font-medium" : "text-muted-foreground")}>{i.chat.lastMessage ?? "Open the chat"}</span>
          {i.chat.closed && <span className="text-muted-foreground">Closed</span>}
          {unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-medium text-primary-foreground">{unread}</span>}
        </p>
      )}
    </button>
  )
}
