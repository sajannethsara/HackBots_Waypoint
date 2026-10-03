"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, ClipboardCheck, MessageSquare, Pencil, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useChatSheet } from "@/features/chat/chat-sheet"
import { fmtDate } from "@/lib/format"
import { useStoreOrder } from "../queries"
import { ReportIssueDialog } from "../issues/report-issue-dialog"
import { LOCKED_STATUSES } from "../shared/order-bits"
import { CancelOrderDialog } from "./cancel-order-dialog"
import { OrderHeaderChips, StoreOrderView } from "./store-order-view"

export function StoreOrderDetailPage({ id }: { id: string }) {
  const { data: o, isLoading, isError } = useStoreOrder(id)
  const [cancelling, setCancelling] = useState(false)
  const [reporting, setReporting] = useState(false)
  const chat = useChatSheet()

  if (isError)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Order not found</EmptyTitle>
          <EmptyDescription>
            It may belong to another outlet or no longer exist.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/store-manager/orders" />}
        >
          Back to orders
        </Button>
      </Empty>
    )
  if (isLoading || !o) return <Skeleton className="h-[640px] rounded-xl" />

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Button
            variant="link"
            size="xs"
            className="w-fit px-0 text-muted-foreground"
            nativeButton={false}
            render={<Link href="/store-manager/orders" />}
          >
            <ArrowLeft data-icon="inline-start" /> My orders
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{o.ref}</h1>
            <OrderHeaderChips o={o} />
          </div>
          <p className="text-sm text-muted-foreground">
            Placed by {o.createdBy} on{" "}
            {fmtDate(o.submittedAt, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}{" "}
            for {o.outlet.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {o.status === "SUBMITTED" && (
            <>
              <Button size="sm" nativeButton={false} render={<Link href={`/store-manager/orders/new?edit=${o.id}`} />}>
                <Pencil data-icon="inline-start" /> Edit order
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>
                <X data-icon="inline-start" /> Cancel order
              </Button>
            </>
          )}
          {o.status === "DRAFT" && (
            <Button size="sm" nativeButton={false} render={<Link href={`/store-manager/orders/new?draft=${o.id}`} />}>
              <Pencil data-icon="inline-start" /> Continue editing
            </Button>
          )}
          {(o.status === "DELIVERED" || o.status === "PARTIAL") && !o.receipt && (
            <Button size="sm" nativeButton={false} render={<Link href={`/store-manager/orders/${o.id}/receive`} />}>
              <ClipboardCheck data-icon="inline-start" /> Receive delivery
            </Button>
          )}
          {["DELIVERED", "PARTIAL", "RECEIVED", "REFUSED"].includes(o.status) && (
            <Button size="sm" variant="outline" onClick={() => setReporting(true)}>
              <TriangleAlert data-icon="inline-start" /> Report issue
            </Button>
          )}
          {o.delivery && (
            <Button size="sm" variant="outline" onClick={() => chat.open({})}>
              <MessageSquare data-icon="inline-start" /> Message dispatch
            </Button>
          )}
          {LOCKED_STATUSES.includes(o.status) && (
            <p className="w-full text-right text-xs text-muted-foreground sm:max-w-xs">
              Dispatch has planned this order, so it can no longer be edited or cancelled. Message dispatch if something has to change.
            </p>
          )}
        </div>
      </div>
      <StoreOrderView o={o} />
      <ReportIssueDialog order={reporting ? { id: o.id, ref: o.ref } : null} onClose={() => setReporting(false)} />
      <CancelOrderDialog order={cancelling ? { id: o.id, ref: o.ref } : null} onClose={() => setCancelling(false)} />
    </div>
  )
}
