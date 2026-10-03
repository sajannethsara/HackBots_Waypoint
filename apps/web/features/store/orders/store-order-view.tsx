"use client"

import { Boxes, CalendarClock, Scale, Truck } from "lucide-react"
import type { StoreOrderDetail } from "@waypoint/shared"
import { BrandBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { StatCard } from "@/components/shared/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDateTime, fmtNum, minToHHMM } from "@/lib/format"
import { shortDate } from "../shared/order-bits"
import { StoreOrderStatus } from "../shared/order-status"

const EVENT_LABEL: Record<string, string> = {
  ORDER_SUBMITTED: "Order submitted",
  ORDER_DEFERRED: "Order deferred to a later run",
  ORDER_ASSIGNED: "Scheduled on a delivery trip",
  PLAN_PUBLISHED: "Delivery plan published",
  ISSUE_REPORTED: "Issue reported",
  ISSUE_RESOLVED: "Issue resolved",
}
const humanize = (a: string) => EVENT_LABEL[a] ?? a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, " ")

export function OrderHeaderChips({ o }: { o: StoreOrderDetail }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StoreOrderStatus status={o.status} />
      <BrandBadge brand={o.brand} />
      <TagBadge tone={o.temp === "CHILLED" ? "blue" : "gray"}>
        <TempIcon temp={o.temp} className="size-3" /> {o.temp === "CHILLED" ? "Chilled" : "Ambient"}
      </TagBadge>
      {o.deferCount > 0 && <TagBadge tone="amber">Deferred {o.deferCount}×</TagBadge>}
    </span>
  )
}

/** Read-only order body shared by the quick-view dialog and the full page. */
export function StoreOrderView({ o, columns = "wide" }: { o: StoreOrderDetail; columns?: "wide" | "narrow" }) {
  const d = o.delivery
  const eta = d ? (d.etaMin ?? d.plannedArrivalMin) : null
  return (
    <div className="grid gap-3">
      <div className={columns === "wide" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-3 sm:grid-cols-2"}>
        <StatCard icon={Boxes} label="Items" value={o.items} hint={`${o.units} units`} />
        <StatCard icon={Scale} tone="blue" label="Weight" value={`${fmtNum(o.weightKg)} kg`} hint={`${fmtNum(o.volumeM3, 2)} m³`} />
        <StatCard icon={CalendarClock} tone="violet" label="Delivery date" value={shortDate(o.deliveryDate)} hint={`Asked for ${shortDate(o.requestedDate)}`} />
        <StatCard
          icon={Truck}
          tone="green"
          label="Arrival"
          value={eta != null ? minToHHMM(eta) : "—"}
          hint={d ? `${d.vehicleId} · ${d.tripRef}` : "Not scheduled yet"}
        />
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">{l.category.toLowerCase()}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(l.weightKg, 1)} kg</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="text-xs">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{o.units}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(o.weightKg, 1)} kg</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          {o.notes && <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs">{o.notes}</p>}
        </CardContent>
      </Card>

      {d && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Fact label="Trip" value={d.tripRef} />
            <Fact label="Vehicle" value={d.vehicleId} />
            <Fact label="Driver" value={d.driver?.name ?? "Not assigned"} />
            <Fact label="Stop status" value={d.stopStatus.charAt(0) + d.stopStatus.slice(1).toLowerCase()} />
          </CardContent>
        </Card>
      )}

      {o.receipt && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Receipt</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            Confirmed by {o.receipt.confirmedBy} on {fmtDateTime(o.receipt.confirmedAt)}.
            {o.receipt.notes && <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs">{o.receipt.notes}</p>}
          </CardContent>
        </Card>
      )}

      {o.timeline.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm">
              {o.timeline.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-3">
                  <span>{humanize(t.action)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.actor} · {fmtDateTime(t.at)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
