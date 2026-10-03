"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate } from "@/lib/format"
import { useStoreOrder } from "../queries"
import { OrderHeaderChips, StoreOrderView } from "./store-order-view"

export function StoreOrderDetailPage({ id }: { id: string }) {
  const { data: o, isLoading, isError } = useStoreOrder(id)

  if (isError)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Order not found</EmptyTitle>
          <EmptyDescription>It may belong to another outlet or no longer exist.</EmptyDescription>
        </EmptyHeader>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/store/orders" />}>
          Back to orders
        </Button>
      </Empty>
    )
  if (isLoading || !o) return <Skeleton className="h-[640px] rounded-xl" />

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Button variant="link" size="xs" className="w-fit px-0 text-muted-foreground" nativeButton={false} render={<Link href="/store/orders" />}>
          <ArrowLeft data-icon="inline-start" /> My orders
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{o.ref}</h1>
          <OrderHeaderChips o={o} />
        </div>
        <p className="text-sm text-muted-foreground">
          Placed by {o.createdBy} on {fmtDate(o.submittedAt, { day: "numeric", month: "short", year: "numeric" })} for {o.outlet.name}.
        </p>
      </div>
      <StoreOrderView o={o} />
    </div>
  )
}
