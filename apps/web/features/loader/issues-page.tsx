"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Clock, MessagesSquare, Radio, Send, TriangleAlert, Truck } from "lucide-react"
import { ISSUE_TYPE_META, type LoaderIssueDetail } from "@waypoint/shared"
import { TagBadge, TONE, type Tone } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime, fmtTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useLoaderIssues } from "./queries"

const STATUS: Record<LoaderIssueDetail["status"], { label: string; tone: Tone }> = {
  OPEN: { label: "Awaiting dispatch", tone: "amber" },
  ACKNOWLEDGED: { label: "Dispatch is on it", tone: "blue" },
  RESOLVED: { label: "Resolved", tone: "green" },
}
const SEVERITY_TONE: Record<LoaderIssueDetail["severity"], Tone> = { HIGH: "red", MEDIUM: "amber", LOW: "gray" }

/**
 * What happened to the issues a loader raised. Right after sending (`sent=1`) it is the confirmation
 * screen; opened later (View issue) it is the same live status. Polls, so dispatch's answer shows up.
 */
export function LoaderIssuesPage() {
  const params = useSearchParams()
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean)
  const tripId = params.get("trip")
  const sent = params.get("sent") === "1"
  const { data: issues, isLoading, error } = useLoaderIssues(ids)
  const allResolved = !!issues?.length && issues.every((i) => i.status === "RESOLVED")

  return (
    <div className="grid gap-4">
      <PageHeader title={sent ? "Issue sent" : "Issue status"} description={sent ? "Your report is with the dispatch desk." : "Live status of issues raised at the loading bay."} />

      <Card className="mx-auto w-full max-w-2xl gap-5 p-6">
        {sent && (
          <div className="grid justify-items-center gap-2 text-center">
            <span className={cn("relative flex size-14 items-center justify-center rounded-full ring-8 ring-emerald-500/10", TONE.green)}>
              <Send className="size-6" />
              <Radio className="absolute -right-1 -bottom-1 size-5 rounded-full bg-background p-0.5 text-primary" />
            </span>
            <TagBadge tone="green">Transmitted to dispatch control</TagBadge>
            <h2 className="text-xl font-semibold tracking-tight">{allResolved ? "Dispatch has decided" : "Dispatcher notified — awaiting decision"}</h2>
            {issues && (
              <p className="text-sm text-muted-foreground">
                {issues.length === 1 ? "Incident" : `${issues.length} incidents`} {issues.map((i) => i.ref).join(", ")}
                {issues[0] && ` · logged by ${issues[0].reportedBy.name} at ${fmtTime(issues[0].createdAt)}`}
              </p>
            )}
          </div>
        )}

        {ids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues selected.</p>
        ) : isLoading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Could not load these issues</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : !issues?.length ? (
          <p className="text-sm text-muted-foreground">These issues are not visible to you (they may belong to another depot).</p>
        ) : (
          <ul className="grid gap-3">
            {issues.map((i) => (
              <IssueCard key={i.id} issue={i} />
            ))}
          </ul>
        )}

        {issues?.some((i) => i.status !== "RESOLVED") && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Listening for dispatch: this page updates on its own. Loading of other stops can carry on.
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          {tripId && (
            <Button variant="outline" nativeButton={false} render={<Link href={`/loader/vehicles/${tripId}`} />}>
              <Truck /> Back to vehicle
            </Button>
          )}
          <Button variant="outline" nativeButton={false} render={<Link href="/loader/inbox?view=issues" />}>
            <MessagesSquare /> Issue chats
          </Button>
          <Button nativeButton={false} render={<Link href="/loader/queue" />}>
            <ArrowLeft /> Return to Loading Queue
          </Button>
        </div>
      </Card>
    </div>
  )
}

function IssueCard({ issue: i }: { issue: LoaderIssueDetail }) {
  const status = STATUS[i.status]
  return (
    <li className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{i.ref}</span>
        <TagBadge tone={SEVERITY_TONE[i.severity]}>{ISSUE_TYPE_META[i.type].label}</TagBadge>
        <span className="ml-auto">
          <TagBadge tone={status.tone}>
            {i.status === "RESOLVED" && <CheckCircle2 className="size-3" />}
            {status.label}
          </TagBadge>
        </span>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <Fact label="Vehicle" value={i.trip ? `${i.trip.vehicleId} · ${i.trip.ref}` : "—"} />
        <Fact label="Consignment" value={i.order ? `${i.order.ref}${i.outlet ? ` → ${i.outlet.name}` : ""}` : "Whole trip"} />
        <Fact label="Logged" value={fmtDateTime(i.createdAt)} />
      </div>
      {i.orderLine && (
        <p className="text-sm">
          <span className="text-muted-foreground">Item: </span>
          <span className="font-medium">{i.orderLine.description}</span>
          {i.quantity != null && <span className="text-muted-foreground"> · {i.quantity} units</span>}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{i.description}</p>
      {i.status === "RESOLVED" && i.resolution && (
        <div className={cn("rounded-md px-3 py-2 text-sm ring-1 ring-inset", TONE.green)}>
          <span className="font-semibold">Dispatch decision{i.resolvedAt ? ` (${fmtTime(i.resolvedAt)})` : ""}: </span>
          {i.resolution}
        </div>
      )}
    </li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
