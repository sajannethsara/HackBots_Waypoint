"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { CircleAlert, ClipboardList, MapPin, PackageCheck, Repeat, Scale, Store, User } from "lucide-react"
import { DOCK_LABEL, PARKING_LABEL } from "@waypoint/shared"
import { BrandBadge, StatusBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { StatCard } from "@/components/shared/stat-card"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWorkspace } from "@/hooks/use-workspace"
import { fmtDate, fmtNum, minToHHMM } from "@/lib/format"
import { useLiveSnapshot } from "../live/use-live"
import { useOutletDetail } from "../queries"
import { outletWindow } from "../shared/window"
import { BackLink, CallLink, Fact, IssueList, LiveStopBanner, MessageButton, Section } from "./resource-ui"

export function OutletDetailPage({ id, wsUrl }: { id: string; wsUrl?: string }) {
  const router = useRouter()
  const { data, isLoading, isError } = useOutletDetail(id)
  const ws = useWorkspace()
  const { data: snap } = useLiveSnapshot(wsUrl, !!data && ws.depotId === data.outlet.depotId)

  // Today's deliveries to this outlet, straight from the live snapshot.
  const liveStops = useMemo(
    () => (snap?.trips ?? []).flatMap((trip) => trip.stops.filter((s) => s.outletId === id).map((stop) => ({ trip, stop }))),
    [snap, id],
  )

  if (isError)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Outlet not found</EmptyTitle>
          <EmptyDescription>
            <Link href="/dispatcher/outlets" className="text-primary hover:underline">
              Back to outlets
            </Link>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  if (isLoading || !data) return <Skeleton className="h-[640px] rounded-xl" />

  const { outlet: o, stats, orders, issues } = data
  const liveByOrder = new Map(liveStops.map(({ trip, stop }) => [stop.orderId, { trip, stop }]))
  // The replay clock finishes stops before the order status is written back, so count those as delivered too.
  const settled = new Set(["DELIVERED", "RECEIVED", "PARTIAL"])
  const deliveredLive = orders.filter((r) => !settled.has(r.status) && liveByOrder.get(r.id)?.stop.status === "COMPLETED").length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <BackLink href="/dispatcher/outlets">Outlets</BackLink>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{o.name}</h1>
            <span className="text-lg text-muted-foreground">· {o.id}</span>
            <BrandBadge brand={o.brand} />
            {o.parkingConstraint !== "NORMAL" && <TagBadge tone="violet">{PARKING_LABEL[o.parkingConstraint]}</TagBadge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {o.districtId} · served from {o.depot.name} · receives {outletWindow(o)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.managers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
              <User className="size-4 text-muted-foreground" />
              <div className="grid leading-tight">
                <span className="text-sm font-medium">{m.name}</span>
                <span className="text-[11px] text-muted-foreground">Store manager</span>
                <CallLink phone={m.phone} />
              </div>
              <MessageButton memberId={m.id} label="Message" />
            </div>
          ))}
        </div>
      </div>

      {liveStops.map(({ trip, stop }) => (
        <LiveStopBanner key={stop.id} trip={trip} stop={stop} subject="outlet" />
      ))}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={ClipboardList} label="Orders" value={stats.orders} hint={`${fmtNum(stats.units)} units`} />
        <StatCard icon={PackageCheck} tone="blue" label="Delivered" value={stats.delivered + deliveredLive} hint={stats.refused ? `${stats.refused} refused` : "None refused"} />
        <StatCard icon={Repeat} tone="amber" label="Deferrals" value={stats.deferrals} hint="Orders pushed back" />
        <StatCard icon={Scale} tone="violet" label="Volume" value={`${fmtNum(stats.weightKg)} kg`} hint="Across all orders" />
        <StatCard icon={CircleAlert} tone={stats.openIssues ? "red" : "green"} label="Open issues" value={stats.openIssues} hint={stats.openIssues ? "Needs attention" : "All clear"} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card size="sm" className="min-w-0 gap-0 py-0">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            Order history <span className="text-xs font-normal text-muted-foreground">newest first</span>
          </div>
          {!orders.length ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">Order</TableHead>
                  <TableHead>Run date</TableHead>
                  <TableHead>Temp</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((r) => {
                  const live = liveByOrder.get(r.id)
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/dispatcher/orders/${r.id}`)}>
                      <TableCell className="pl-4">
                        <Link href={`/dispatcher/orders/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.ref}
                        </Link>
                        {r.deferCount > 0 && (
                          <span className="ml-1.5 align-middle">
                            <TagBadge tone="amber" title={`Deferred ${r.deferCount}×`}>
                              ↻{r.deferCount}
                            </TagBadge>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(r.deliveryDate, { day: "numeric", month: "short", year: "numeric" })}
                        {r.requestedDate !== r.deliveryDate && <span className="block text-[11px] text-muted-foreground">asked {fmtDate(r.requestedDate, { day: "numeric", month: "short" })}</span>}
                      </TableCell>
                      <TableCell>
                        <TempIcon temp={r.temp} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.units}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.weightKg)} kg</TableCell>
                      <TableCell className="text-xs">
                        {r.stop ? (
                          <Link href={`/dispatcher/trips/${r.stop.trip.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            <span className="font-medium">{r.stop.trip.ref}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {r.stop.trip.vehicleId} · {minToHHMM(live?.stop.etaMin ?? r.stop.plannedArrivalMin)}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        {live?.stop.status === "COMPLETED" ? <TagBadge tone="green">Delivered</TagBadge> : live?.stop.status === "IN_PROGRESS" ? <TagBadge tone="blue">At outlet</TagBadge> : <StatusBadge status={r.status} />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="grid min-w-0 content-start gap-3">
          <Section title={<><Store className="size-4 text-muted-foreground" /> Receiving</>}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Fact label="Window" value={outletWindow(o)} />
              <Fact label="Dock" value={DOCK_LABEL[o.dockType]} />
              <Fact label="Access" value={PARKING_LABEL[o.parkingConstraint]} />
              <Fact label="Last delivered" value={o.lastDeliveredOn ? fmtDate(o.lastDeliveredOn, { day: "numeric", month: "short", year: "numeric" }) : "—"} />
              <Fact label="District" value={o.districtId} />
              <Fact label="Depot" value={o.depot.name} />
            </dl>
            {o.mallWindowOpenMin != null && o.mallWindowCloseMin != null && (
              <p className="mt-3 rounded-md bg-violet-50 p-2 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                Mall dock restricts deliveries to {minToHHMM(o.mallWindowOpenMin)}–{minToHHMM(o.mallWindowCloseMin)}.
              </p>
            )}
            {o.lat != null && o.lng != null && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <MapPin className="size-3" /> Open location in maps
              </a>
            )}
          </Section>

          <Section title="Issues" aside={stats.openIssues ? `${stats.openIssues} open` : undefined}>
            <IssueList issues={issues} empty="No issues at this outlet." />
          </Section>
        </div>
      </div>
    </div>
  )
}
