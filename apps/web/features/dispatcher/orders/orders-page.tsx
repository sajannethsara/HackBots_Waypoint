"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { Apple, Search, Shirt, Tv, Workflow } from "lucide-react"
import { PARKING_LABEL, type Brand } from "@waypoint/shared"
import { BrandBadge, ReasonBadge, StatusBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtNum, minToHHMM, pct } from "@/lib/format"
import type { OrderRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useOrders } from "../queries"
import { outletWindow } from "../shared/window"
import { OrderSheet } from "./order-sheet"

const VIEWS = [
  { value: "all", label: "All orders" },
  { value: "unassigned", label: "Unassigned" },
  { value: "assigned", label: "Assigned" },
  { value: "deferred", label: "Deferred" },
] as const

const BRAND_ICON = { FRESH: Apple, STYLE: Shirt, TECH: Tv }
const BRAND_BAR = { FRESH: "bg-emerald-500", STYLE: "bg-pink-500", TECH: "bg-sky-500" }

export function OrdersPage() {
  const router = useRouter()
  const params = useSearchParams()
  const view = params.get("view") ?? "all"
  const [brand, setBrand] = useState<string>("")
  const [district, setDistrict] = useState<string>("")
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: all } = useOrders({}) // unfiltered: totals + district list
  const { data, isLoading } = useOrders({ view, brand: brand || undefined, district: district || undefined, q: q || undefined })
  const districts = useMemo(() => [...new Set(all?.orders.map((o) => o.outlet.districtId))].sort(), [all])

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Orders"
        description="Confirmed orders for this run, with their place in the current plan."
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
            <Workflow data-icon="inline-start" /> Go to planning
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm" className="flex-row items-center gap-3 px-4">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Total confirmed</p>
            <p className="text-xl font-semibold tabular-nums">{all?.counts.all ?? "—"}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {all?.plan ? (
              <>
                Plan v{all.plan.version}
                <br />
                <StatusBadge status={all.plan.status} />
              </>
            ) : (
              "No plan yet"
            )}
          </div>
        </Card>
        {(all?.brandTotals ?? []).map((b) => {
          const Icon = BRAND_ICON[b.brand]
          return (
            <Card key={b.brand} size="sm" className="gap-2 px-4">
              <div className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground" />
                <p className="flex-1 text-xs text-muted-foreground">{b.brand.charAt(0) + b.brand.slice(1).toLowerCase()}</p>
                {b.brand === "FRESH" && (
                  <span className="text-[11px] text-muted-foreground">
                    Dry {b.orders - b.chilled} · Chilled {b.chilled}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between">
                <p className="text-xl font-semibold tabular-nums">{b.orders}</p>
                <p className="text-[11px] text-muted-foreground">{b.assigned} assigned</p>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", BRAND_BAR[b.brand])} style={{ width: `${pct(b.assigned, b.orders)}%` }} />
              </div>
            </Card>
          )
        })}
      </div>

      <Card size="sm" className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Tabs value={view} onValueChange={(v) => router.replace(`/dispatcher/orders?view=${v}`)}>
            <TabsList>
              {VIEWS.map((v) => (
                <TabsTrigger key={v.value} value={v.value} className="gap-1.5">
                  {v.label}
                  <span className="text-[11px] text-muted-foreground tabular-nums">{all?.counts[v.value] ?? ""}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order or outlet…" className="h-7 w-44 pl-7 text-sm" />
            </div>
            <FilterSelect value={brand} onChange={setBrand} placeholder="All brands" options={["FRESH", "STYLE", "TECH"].map((b) => ({ value: b, label: b.charAt(0) + b.slice(1).toLowerCase() }))} />
            <FilterSelect value={district} onChange={setDistrict} placeholder="All districts" options={districts.map((d) => ({ value: d, label: d }))} />
          </div>
        </div>
        {isLoading || !data ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : (
          <OrdersTable rows={data.orders} onOpen={setOpenId} />
        )}
      </Card>

      <OrderSheet orderId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : String(v))}>
      <SelectTrigger size="sm" className="w-36">
        <SelectValue>{(v: string) => (v === "__all" ? placeholder : (options.find((o) => o.value === v)?.label ?? v))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function OrdersTable({ rows, onOpen }: { rows: OrderRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="p-10 text-center text-sm text-muted-foreground">No orders match these filters.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead className="pl-4">Order</TableHead>
          <TableHead>Outlet</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>District</TableHead>
          <TableHead>Temp</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead className="text-right">Weight</TableHead>
          <TableHead className="text-right">Volume</TableHead>
          <TableHead>Window</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead className="pr-4 text-right">Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => (
          <TableRow key={o.id} className="cursor-pointer" onClick={() => onOpen(o.id)}>
            <TableCell className="pl-4 font-medium">
              <div className="flex items-center gap-1.5">
                {o.ref}
                {o.deferCount > 0 && (
                  <TagBadge tone="amber" title={`Deferred ${o.deferCount}× before`}>
                    ↻{o.deferCount}
                  </TagBadge>
                )}
              </div>
            </TableCell>
            <TableCell>{o.outlet.id}</TableCell>
            <TableCell>
              <BrandBadge brand={o.brand as Brand} />
            </TableCell>
            <TableCell>{o.outlet.districtId}</TableCell>
            <TableCell>
              <TempIcon temp={o.temp} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{o.units}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.weightKg)} kg</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(o.volumeM3, 2)} m³</TableCell>
            <TableCell className="tabular-nums">{outletWindow(o.outlet)}</TableCell>
            <TableCell>
              {o.outlet.parkingConstraint !== "NORMAL" ? (
                <TagBadge tone="violet">{PARKING_LABEL[o.outlet.parkingConstraint]}</TagBadge>
              ) : (
                <span className="text-xs text-muted-foreground">Normal</span>
              )}
            </TableCell>
            <TableCell>
              {o.state === "assigned" && o.stop ? (
                <span className="text-xs">
                  <span className="font-medium">{o.stop.trip.ref}</span>{" "}
                  <span className="text-muted-foreground">
                    · {o.stop.trip.vehicleId} · {minToHHMM(o.stop.plannedArrivalMin)}
                  </span>
                </span>
              ) : o.state === "deferred" && o.decision?.reason ? (
                <ReasonBadge reason={o.decision.reason} />
              ) : (
                <StatusBadge status="unassigned" label="Unassigned" />
              )}
            </TableCell>
            <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">{o.decision?.priorityScore ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
