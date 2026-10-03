"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { CalendarDays, Plus, Search, X } from "lucide-react"
import type { StoreOrderRow, StoreOrderTab } from "@waypoint/shared"
import { BrandBadge, TempIcon } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtNum } from "@/lib/format"
import { useStoreOrders } from "../queries"
import { OrderRowMenu, shortDate } from "../shared/order-bits"
import { StoreOrderStatus, storeStatusLabel } from "../shared/order-status"
import { CancelOrderDialog, type CancelTarget } from "./cancel-order-dialog"
import { StoreOrderDialog } from "./store-order-dialog"

const TABS: { value: StoreOrderTab; label: string }[] = [
  { value: "orders", label: "My orders" },
  { value: "drafts", label: "Drafts" },
  { value: "cancelled", label: "Cancelled" },
]

// Filter values are real order statuses; labels come from the store's own wording.
const STATUS_OPTIONS = ["SUBMITTED", "PLANNED", "LOADED", "IN_TRANSIT", "DEFERRED", "DELIVERED", "PARTIAL", "REFUSED", "RECEIVED"]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const parse = (s?: string) => (s ? new Date(`${s}T00:00:00`) : undefined)

export function StoreOrdersPage() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "orders") as StoreOrderTab
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("") // debounced
  const [status, setStatus] = useState("")
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const filters = { tab, q: q || undefined, status: status || undefined, from: range.from && iso(range.from), to: range.to && iso(range.to), page }
  const { data, isLoading, isError } = useStoreOrders(filters)
  const filtered = !!(q || status || range.from)

  // Any filter change goes back to the first page.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="grid gap-4">
      <PageHeader
        title="My orders"
        description="Everything your outlet has ordered, from drafts to received deliveries."
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/store-manager/orders/new" />}>
            <Plus data-icon="inline-start" /> Create order
          </Button>
        }
      />

      <Card size="sm" className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setPage(1)
              setStatus("")
              router.replace(`/store-manager/orders?tab=${v}`)
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
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => change(setSearch)(e.target.value)}
                placeholder="Search order ref…"
                aria-label="Search orders"
                className="h-7 w-44 pl-7 text-sm"
              />
            </div>
            {tab === "orders" && (
              <Select value={status || "__all"} onValueChange={(v) => change(setStatus)(v === "__all" ? "" : String(v))}>
                <SelectTrigger size="sm" className="w-40" aria-label="Filter by status">
                  <SelectValue>{(v: string) => (v === "__all" ? "All statuses" : storeStatusLabel(v))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {storeStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" className="font-normal" />}>
                <CalendarDays data-icon="inline-start" />
                {range.from ? `${shortDate(iso(range.from))}${range.to ? ` – ${shortDate(iso(range.to))}` : ""}` : "Delivery date"}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={range.from ? { from: range.from, to: range.to } : undefined}
                  defaultMonth={range.from ?? parse(data?.items[0]?.deliveryDate)}
                  onSelect={(r) => change(setRange)({ from: r?.from, to: r?.to })}
                />
              </PopoverContent>
            </Popover>
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("")
                  setQ("")
                  setStatus("")
                  setRange({})
                  setPage(1)
                }}
              >
                <X data-icon="inline-start" /> Clear
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : isError || !data ? (
          <Empty className="m-3 border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>Could not load your orders</EmptyTitle>
              <EmptyDescription>Please refresh and try again.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : data.items.length === 0 ? (
          <EmptyState tab={tab} filtered={filtered} />
        ) : (
          <OrdersTable rows={data.items} tab={tab} onQuickView={setOpenId} onCancel={setCancelTarget} onOpen={(id) => router.push(`/store-manager/orders/${id}`)} />
        )}

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}
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
                  <span className="px-2 text-xs text-muted-foreground tabular-nums">
                    Page {data.page} of {totalPages}
                  </span>
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

      <StoreOrderDialog id={openId} onClose={() => setOpenId(null)} onCancel={setCancelTarget} />
      <CancelOrderDialog order={cancelTarget} onClose={() => setCancelTarget(null)} />
    </div>
  )
}

function EmptyState({ tab, filtered }: { tab: StoreOrderTab; filtered: boolean }) {
  const copy = filtered
    ? { title: "No orders match these filters", text: "Try a different search, status or date range." }
    : tab === "drafts"
      ? { title: "No drafts", text: "Orders you save without submitting will appear here." }
      : tab === "cancelled"
        ? { title: "No cancelled orders", text: "Orders you cancel will be kept here for reference." }
        : { title: "No orders yet", text: "Create your first order to get started." }
  return (
    <Empty className="m-3 border border-dashed py-10">
      <EmptyHeader>
        <EmptyTitle>{copy.title}</EmptyTitle>
        <EmptyDescription>{copy.text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function OrdersTable({ rows, tab, onQuickView, onCancel, onOpen }: { rows: StoreOrderRow[]; tab: StoreOrderTab; onQuickView: (id: string) => void; onCancel: (o: CancelTarget) => void; onOpen: (id: string) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead className="pl-4">Order</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Items</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead className="text-right">Weight</TableHead>
          <TableHead>{tab === "drafts" ? "Requested for" : "Delivery date"}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10 pr-4">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => (
          <TableRow key={o.id} className="cursor-pointer" onClick={() => onOpen(o.id)}>
            <TableCell className="pl-4 font-medium">
              <Link href={`/store-manager/orders/${o.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
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
            <TableCell className="text-right tabular-nums">{o.units}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.weightKg)} kg</TableCell>
            <TableCell className="tabular-nums">{shortDate(o.deliveryDate)}</TableCell>
            <TableCell>
              <StoreOrderStatus status={o.status} />
            </TableCell>
            <TableCell className="pr-4">
              <OrderRowMenu id={o.id} status={o.status} onQuickView={() => onQuickView(o.id)} onCancel={() => onCancel({ id: o.id, ref: o.ref })} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
