"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { ClipboardCheck, MoreHorizontal, TriangleAlert } from "lucide-react"
import { STORE_DELIVERY_TABS, type StoreDeliveryItem, type StoreDeliveryTab } from "@waypoint/shared"
import { TempIcon } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { minToHHMM } from "@/lib/format"
import { ReportIssueDialog, type IssueTarget } from "../issues/report-issue-dialog"
import { useStoreDeliveries } from "../queries"
import { shortDate } from "../shared/order-bits"
import { StoreOrderStatus } from "../shared/order-status"
import { OnTheWayCard } from "./on-the-way-card"

const TABS: { value: StoreDeliveryTab; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "history", label: "History" },
]

export function StoreDeliveriesPage({ mapboxToken }: { mapboxToken?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const tab = (STORE_DELIVERY_TABS.find((t) => t === params.get("tab")) ?? "today") as StoreDeliveryTab
  const [page, setPage] = useState(1)
  const [report, setReport] = useState<IssueTarget | null>(null)
  const { data, isLoading, isError } = useStoreDeliveries(tab, page)

  const onTheWay = tab === "today" ? (data?.onTheWay ?? null) : null
  // The card already covers that order, so the table below lists the rest of today's deliveries.
  const rows = (data?.items ?? []).filter((d) => !(onTheWay && d.orderId === onTheWay.orderId))
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const toReceive = data?.items.filter((d) => d.canReceive).length ?? 0

  return (
    <div className="grid gap-4">
      <PageHeader title="Deliveries" description="Follow deliveries on their way to your outlet and count them in when they arrive." />

      {toReceive > 0 && (
        <Card size="sm" className="flex-row items-center gap-3 border-amber-300/60 bg-amber-50 px-4 dark:bg-amber-500/10">
          <TriangleAlert className="size-4 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm">
            {toReceive} {toReceive === 1 ? "delivery is" : "deliveries are"} waiting for you to count in.
          </p>
        </Card>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setPage(1)
          router.replace(`/store-manager/deliveries?tab=${v}`)
        }}
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              {t.label}
              <span className="text-[11px] text-muted-foreground tabular-nums">{data?.counts[t.value] ?? ""}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {onTheWay && <OnTheWayCard d={onTheWay} mapboxToken={mapboxToken} />}

      <Card size="sm" className="gap-0 py-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">{tab === "today" ? (onTheWay ? "Other deliveries today" : "Today’s deliveries") : tab === "upcoming" ? "Upcoming deliveries" : "Past deliveries"}</h2>
        </div>
        {isLoading ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : isError || !data ? (
          <Empty className="m-3 border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>Could not load deliveries</EmptyTitle>
              <EmptyDescription>Please refresh and try again.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : rows.length === 0 ? (
          <Empty className="m-3 border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>{emptyCopy(tab, !!onTheWay).title}</EmptyTitle>
              <EmptyDescription>{emptyCopy(tab, !!onTheWay).text}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DeliveriesTable rows={rows} onOpen={(id) => router.push(`/store-manager/orders/${id}`)} onReport={setReport} />
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              Page {data.page} of {totalPages}
            </p>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={page <= 1}
                    className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      setPage((p) => Math.max(1, p - 1))
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={page >= totalPages}
                    className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      setPage((p) => Math.min(totalPages, p + 1))
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </Card>

      <ReportIssueDialog order={report} onClose={() => setReport(null)} />
    </div>
  )
}

function emptyCopy(tab: StoreDeliveryTab, hasCard: boolean) {
  if (tab === "today") return hasCard ? { title: "No other deliveries today", text: "The delivery above is the only one scheduled for today." } : { title: "Nothing scheduled for today", text: "Deliveries planned for today will appear here." }
  if (tab === "upcoming") return { title: "No upcoming deliveries", text: "Orders you place for later days will appear here once planned." }
  return { title: "No past deliveries yet", text: "Deliveries you have received will be kept here." }
}

function DeliveriesTable({ rows, onOpen, onReport }: { rows: StoreDeliveryItem[]; onOpen: (id: string) => void; onReport: (t: IssueTarget) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead className="pl-4">Order</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead>Vehicle</TableHead>
          <TableHead>Arrival</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="pr-4 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => {
          const eta = d.etaMin ?? d.plannedArrivalMin
          const canReport = ["DELIVERED", "PARTIAL", "RECEIVED", "REFUSED"].includes(d.status)
          return (
            <TableRow key={d.orderId} className="cursor-pointer" onClick={() => onOpen(d.orderId)}>
              <TableCell className="pl-4 font-medium">
                <Link href={`/store-manager/orders/${d.orderId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                  {d.orderRef}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{shortDate(d.deliveryDate)}</TableCell>
              <TableCell>
                <TempIcon temp={d.temp} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{d.units}</TableCell>
              <TableCell>
                {d.vehicleId ?? "—"}
                {d.driverName && <span className="block text-xs text-muted-foreground">{d.driverName}</span>}
              </TableCell>
              <TableCell className="tabular-nums">{eta != null ? minToHHMM(eta) : "—"}</TableCell>
              <TableCell>
                <StoreOrderStatus status={d.status} />
              </TableCell>
              <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {d.canReceive && (
                    <Button size="xs" nativeButton={false} render={<Link href={`/store-manager/orders/${d.orderId}/receive`} />}>
                      <ClipboardCheck data-icon="inline-start" /> Receive
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Delivery actions" />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem render={<Link href={`/store-manager/orders/${d.orderId}`} />}>Open order</DropdownMenuItem>
                      {canReport && <DropdownMenuItem onClick={() => onReport({ id: d.orderId, ref: d.orderRef })}>Report an issue</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
