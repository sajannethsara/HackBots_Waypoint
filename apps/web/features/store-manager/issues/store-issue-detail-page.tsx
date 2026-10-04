"use client"

import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { ISSUE_STAGE_LABEL, ISSUE_TYPE_META, type IssueSeverity, type IssueStage, type IssueStatus, type IssueType } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { IssueStatusBadge, SeverityBadge } from "@/features/dispatcher/issues/issue-badges"
import { IssueChatPane, useIssueChatId } from "@/features/issue-chat/use-issue-chat"
import { fmtDateTime } from "@/lib/format"
import { useStoreIssue } from "../queries"

const EVENT_LABEL: Record<string, string> = {
  ISSUE_REPORTED: "Issue reported",
  ISSUE_ACKNOWLEDGED: "Dispatch acknowledged it",
  ISSUE_RESOLVED: "Resolved",
}
const humanize = (a: string) => EVENT_LABEL[a] ?? a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, " ")

export function StoreIssueDetailPage({ id }: { id: string }) {
  const { data: i, isLoading, isError } = useStoreIssue(id)
  const chat = useIssueChatId(id)

  if (isError)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Issue not found</EmptyTitle>
          <EmptyDescription>It may belong to another outlet or no longer exist.</EmptyDescription>
        </EmptyHeader>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/store-manager/issues" />}>
          Back to issues
        </Button>
      </Empty>
    )
  if (isLoading || !i) return <Skeleton className="h-[560px] rounded-xl" />

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Button variant="link" size="xs" className="w-fit px-0 text-muted-foreground" nativeButton={false} render={<Link href="/store-manager/issues" />}>
          <ArrowLeft data-icon="inline-start" /> Issues
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{i.ref}</h1>
          <IssueStatusBadge status={i.status as IssueStatus} />
          <SeverityBadge severity={i.severity as IssueSeverity} />
        </div>
        <p className="text-sm text-muted-foreground">
          {ISSUE_TYPE_META[i.type as IssueType]?.label ?? i.type} · {ISSUE_STAGE_LABEL[i.stage as IssueStage] ?? i.stage} · reported by {i.reportedBy} {fmtDateTime(i.createdAt)}
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="grid min-w-0 content-start gap-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>What was reported</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p>{i.description}</p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fact label="Order">{i.orderId ? <Link href={`/store-manager/orders/${i.orderId}`} className="hover:underline">{i.orderRef}</Link> : "—"}</Fact>
                <Fact label="Item">{i.line ?? "Whole order"}</Fact>
                <Fact label="Quantity">{i.quantity ?? "—"}</Fact>
              </dl>
              {i.photoIds.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {i.photoIds.map((id, n) => (
                    <a key={id} href={`/api/media/${id}`} target="_blank" rel="noreferrer" className="block" aria-label={`Open photo ${n + 1} in a new tab`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/media/${id}`} alt={`Photo ${n + 1} attached to ${i.ref}`} className="aspect-square w-full rounded-lg border object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {i.status === "RESOLVED" && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600" /> Resolved
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <p>{i.resolution}</p>
                {i.resolvedAt && (
                  <p className="text-xs text-muted-foreground">
                    {i.resolvedBy ? `${i.resolvedBy} · ` : ""}
                    {fmtDateTime(i.resolvedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card size="sm">
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-sm">
                {i.timeline.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-3">
                    <span>{humanize(t.action)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t.actor} · {fmtDateTime(t.at)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card size="sm" className="h-[560px] gap-0 overflow-hidden py-0">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Chat with dispatch about {i.ref}</h2>
          </div>
          <div className="min-h-0 flex-1">
            {chat.data ? <IssueChatPane chatId={chat.data} className="h-full" /> : <Skeleton className="m-4 h-40" />}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  )
}
