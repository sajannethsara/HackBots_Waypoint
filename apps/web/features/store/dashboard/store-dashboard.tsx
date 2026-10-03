"use client"

import Link from "next/link"
import { CheckCircle2, CircleAlert, Clock, Plus, ShoppingCart } from "lucide-react"
import type { StoreDeliveryRow, StoreOrderRow } from "@waypoint/shared"
import { BrandBadge, TempIcon } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMe } from "@/hooks/use-session"
import { minToHHMM } from "@/lib/format"
import { useStoreDashboard } from "../queries"
import { shortDate } from "../shared/order-bits"
import { StoreOrderStatus } from "../shared/order-status"

export function StoreDashboard() {
  const { data: me } = useMe()
  const { data, isLoading, isError } = useStoreDashboard()
  const k = data?.kpis
  const num = (n: number | undefined) => (n === undefined ? "—" : n)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description={me?.outlet ? `Overview of orders for ${me.outlet.name}.` : "Overview of your orders at a glance."}
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/store/orders/new" />}>
            <Plus data-icon="inline-start" /> Create order
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total orders" value={num(k?.totalOrders)} hint="Submitted, excluding drafts" icon={ShoppingCart} tone="green" />
        <StatCard label="Incoming deliveries" value={num(k?.incoming)} hint="Planned or on the way" icon={Clock} tone="blue" />
        <StatCard
          label="Received deliveries"
          value={num(k?.received)}
          hint={k?.awaitingReceipt ? `${k.awaitingReceipt} awaiting your confirmation` : "All confirmed"}
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard label="Open issues" value={num(k?.openIssues)} hint="Reported for your outlet" icon={CircleAlert} tone="red" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
          <CardAction>
            <Button variant="link" size="xs" nativeButton={false} render={<Link href="/store/orders" />}>
              View all orders
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Section loading={isLoading} error={isError} empty={!data?.recentOrders.length} emptyTitle="No orders yet" emptyText="Orders you place will be listed here.">
            <RecentOrders rows={data?.recentOrders ?? []} />
          </Section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
          <CardAction>
            <Button variant="link" size="xs" nativeButton={false} render={<Link href="/store/deliveries" />}>
              View all deliveries
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Section
            loading={isLoading}
            error={isError}
            empty={!data?.recentDeliveries.length}
            emptyTitle="No deliveries yet"
            emptyText="Deliveries scheduled for your outlet will be listed here once a plan is published."
          >
            <RecentDeliveries rows={data?.recentDeliveries ?? []} />
          </Section>
        </CardContent>
      </Card>
    </div>
  )
}

function Section({
  loading,
  error,
  empty,
  emptyTitle,
  emptyText,
  children,
}: {
  loading: boolean
  error: boolean
  empty: boolean
  emptyTitle: string
  emptyText: string
  children: React.ReactNode
}) {
  if (loading)
    return (
      <div className="grid gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    )
  if (error || empty)
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>{error ? "Could not load this section" : emptyTitle}</EmptyTitle>
          <EmptyDescription>{error ? "Please try again in a moment." : emptyText}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return <>{children}</>
}

function RecentOrders({ rows }: { rows: StoreOrderRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Order</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Items</TableHead>
          <TableHead>Delivery date</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="font-medium">
              <Link href={`/store/orders/${o.id}`} className="hover:underline">
                {o.ref}
              </Link>
            </TableCell>
            <TableCell>
              <BrandBadge brand={o.brand} />
            </TableCell>
            <TableCell>
              <TempIcon temp={o.temp} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{o.items}</TableCell>
            <TableCell className="tabular-nums">{shortDate(o.deliveryDate)}</TableCell>
            <TableCell>
              <StoreOrderStatus status={o.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RecentDeliveries({ rows }: { rows: StoreDeliveryRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Order</TableHead>
          <TableHead>Delivery date</TableHead>
          <TableHead>Vehicle</TableHead>
          <TableHead>Arrival</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => {
          const eta = d.etaMin ?? d.plannedArrivalMin
          return (
            <TableRow key={d.orderId}>
              <TableCell className="font-medium">
                <Link href={`/store/orders/${d.orderId}`} className="hover:underline">
                  {d.orderRef}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{shortDate(d.deliveryDate)}</TableCell>
              <TableCell>{d.vehicleId ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{eta != null ? `${d.etaMin != null ? "ETA " : ""}${minToHHMM(eta)}` : "—"}</TableCell>
              <TableCell>
                <StoreOrderStatus status={d.status} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
