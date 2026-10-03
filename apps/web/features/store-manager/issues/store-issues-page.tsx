"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ISSUE_TYPE_META, type IssueSeverity, type IssueStatus, type IssueType } from "@waypoint/shared"
import { PageHeader } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IssueStatusBadge, SeverityBadge } from "@/features/dispatcher/issues/issue-badges"
import { timeAgo } from "@/lib/format"
import { useStoreIssues } from "../queries"

const TABS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const

export function StoreIssuesPage() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "open") as (typeof TABS)[number]["value"]
  const { data, isLoading, isError } = useStoreIssues(tab)

  return (
    <div className="grid gap-4">
      <PageHeader title="Issues" description="Problems with your deliveries, and what dispatch is doing about them." />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/store-manager/issues?tab=${v}`)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card size="sm" className="gap-0 py-0">
        {isLoading ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : isError || !data ? (
          <Empty className="m-3 border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>Could not load issues</EmptyTitle>
              <EmptyDescription>Please refresh and try again.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : data.length === 0 ? (
          <Empty className="m-3 border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>{tab === "resolved" ? "Nothing resolved yet" : "No issues"}</EmptyTitle>
              <EmptyDescription>If something is wrong with a delivery, report it from the order or when you receive it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Issue</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead className="hidden sm:table-cell">Order</TableHead>
                <TableHead className="hidden sm:table-cell">Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden pr-4 sm:table-cell">Reported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((i) => (
                <TableRow key={i.id} className="cursor-pointer" onClick={() => router.push(`/store-manager/issues/${i.id}`)}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/store-manager/issues/${i.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                      {i.ref}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {ISSUE_TYPE_META[i.type as IssueType]?.label ?? i.type}
                    {i.quantity != null && <span className="text-xs text-muted-foreground"> · {i.quantity} units</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {i.orderId ? (
                      <Link href={`/store-manager/orders/${i.orderId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {i.orderRef}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <SeverityBadge severity={i.severity as IssueSeverity} />
                  </TableCell>
                  <TableCell>
                    <IssueStatusBadge status={i.status as IssueStatus} />
                  </TableCell>
                  <TableCell className="hidden pr-4 text-xs text-muted-foreground sm:table-cell">{timeAgo(i.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
