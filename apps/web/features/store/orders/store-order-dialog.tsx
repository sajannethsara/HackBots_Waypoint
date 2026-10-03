"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useStoreOrder } from "../queries"
import { OrderHeaderChips, StoreOrderView } from "./store-order-view"

/** Quick view opened from the orders list; the same content lives at /store/orders/[id]. */
export function StoreOrderDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: o, isError } = useStoreOrder(id)
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{o?.ref ?? "Order"}</DialogTitle>
          <DialogDescription render={<div />}>{o ? <OrderHeaderChips o={o} /> : isError ? "This order could not be loaded." : "Loading order…"}</DialogDescription>
        </DialogHeader>
        {o ? <StoreOrderView o={o} columns="narrow" /> : !isError && <Skeleton className="h-72" />}
        {o && (
          <DialogFooter>
            <Button variant="outline" nativeButton={false} render={<Link href={`/store/orders/${o.id}`} />}>
              Open full page
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
