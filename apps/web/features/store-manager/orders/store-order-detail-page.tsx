"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate } from "@/lib/format"
import { useStoreOrder } from "../queries"
import { LOCKED_STATUSES } from "../shared/order-bits"
import { CancelOrderDialog } from "./cancel-order-dialog"
import { OrderHeaderChips, StoreOrderView } from "./store-order-view"

export function StoreOrderDetailPage({ id }: { id: string }) {
  const { data: o, isLoading, isError } = useStoreOrder(id)
  const [cancelling, setCancelling] = useState(false)

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
        {o.status === "SUBMITTED" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href={`/store-manager/orders/new?edit=${o.id}`} />}
            >
              <Pencil data-icon="inline-start" /> Edit order
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>
              <X data-icon="inline-start" /> Cancel order
            </Button>
          </div>
        )}
        {LOCKED_STATUSES.includes(o.status) && (
          <p className="max-w-xs text-xs text-muted-foreground">
            Dispatch has planned this order, so it can no longer be edited or cancelled.
            Message dispatch if something has to change.
          </p>
        )}
        {o.status === "DRAFT" && (
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/store-manager/orders/new?draft=${o.id}`} />}
          >
            <Pencil data-icon="inline-start" /> Continue editing
          </Button>
        )}
      </div>
      <StoreOrderView o={o} />
      <CancelOrderDialog order={cancelling ? { id: o.id, ref: o.ref } : null} onClose={() => setCancelling(false)} />
    </div>
  )
}
