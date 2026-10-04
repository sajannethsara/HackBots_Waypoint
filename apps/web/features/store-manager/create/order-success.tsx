"use client"

import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import type { StoreOrderSaved } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { fmtDate, fmtNum } from "@/lib/format"

/** Shown after a successful submit, with the order reference the dispatcher will also see. */
export function OrderSuccess({ order, onAnother }: { order: StoreOrderSaved; onAnother: () => void }) {
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardContent className="grid justify-items-center gap-3 py-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
          <CheckCircle2 className="size-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Order submitted</h2>
          <p className="text-sm text-muted-foreground">Dispatch can now see it and will plan it for your delivery date.</p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div>
            <p className="text-[11px] text-muted-foreground">Reference</p>
            <p className="font-semibold">{order.ref}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Delivery</p>
            <p className="font-medium">{fmtDate(order.deliveryDate, { day: "numeric", month: "short" })}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Load</p>
            <p className="font-medium">
              {order.units} units · {fmtNum(order.weightKg)} kg
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button nativeButton={false} render={<Link href={`/store-manager/orders/${order.id}`} />}>
            View order
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/store-manager/orders" />}>
            My orders
          </Button>
          <Button variant="ghost" onClick={onAnother}>
            Create another
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
