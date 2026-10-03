"use client"

import Link from "next/link"
import { Boxes, ClipboardCheck, FileCheck2, PackageX, Repeat, Route, Scale, Store, Target, Truck, Workflow } from "lucide-react"
import { DEFERRAL_REASON_META, DOCK_LABEL, PARKING_LABEL } from "@waypoint/shared"
import { BrandBadge, ReasonBadge, StatusBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWorkspace } from "@/hooks/use-workspace"
import { fmtDate, fmtDateTime, fmtNum, minToHHMM, timeAgo } from "@/lib/format"
import { useLiveSnapshot } from "../live/use-live"
import { useOrderDetail } from "../queries"
import { BackLink, CallLink, Fact, IssueList, LiveStopBanner, MessageButton, Row, Section } from "../resources/resource-ui"
import { ScoreBreakdown } from "../shared/score-breakdown"
import { outletWindow } from "../shared/window"

const AUDIT_LABEL: Record<string, string> = {
  ORDER_SUBMITTED: "Order submitted",
  ORDER_DEFERRED: "Order deferred",
  ORDER_ASSIGNED: "Order assigned to a trip",
  DECISION_OVERRIDDEN: "Dispatcher changed the decision",
  PLAN_PUBLISHED: "Plan published",
  ISSUE_REPORTED: "Issue reported",
  ISSUE_ACKNOWLEDGED: "Issue acknowledged",
  ISSUE_RESOLVED: "Issue resolved",
}
const humanize = (a: string) => AUDIT_LABEL[a] ?? a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, " ")

export function OrderDetailPage({ id, wsUrl }: { id: string; wsUrl?: string }) {
  const { data: o, isLoading, isError } = useOrderDetail(id)
  const ws = useWorkspace()
  const { data: snap } = useLiveSnapshot(wsUrl, !!o && ws.depotId === o.depot.id)

  // The stop that carries this order: prefer the published plan over drafts and older versions.
  const stop = o?.stops.find((s) => s.trip.plan.status === "PUBLISHED") ?? o?.stops[0] ?? null
  const liveTrip = snap?.trips.find((t) => t.stops.some((x) => x.orderId === id))
  const liveStop = liveTrip?.stops.find((x) => x.orderId === id)
  const live = liveTrip && liveStop ? { trip: liveTrip, stop: liveStop } : null

  if (isError)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Order not found</EmptyTitle>
          <EmptyDescription>
            <Link href="/dispatcher/orders" className="text-primary hover:underline">
              Back to orders
            </Link>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  if (isLoading || !o) return <Skeleton className="h-[700px] rounded-xl" />

  const latest = o.decisions[0]
  // The newest planning decision left this order out: explain what happened and what the dispatcher can do.
  const deferral = latest?.decision === "DEFERRED" && latest.plan.status !== "SUPERSEDED" ? latest : null
  const manager = o.outlet.managers[0]
  const settled = ["DELIVERED", "RECEIVED", "PARTIAL", "REFUSED"].includes(o.status)
  const status = live?.stop.status === "COMPLETED" && !settled ? "DELIVERED" : o.status

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <BackLink href="/dispatcher/orders">Orders</BackLink>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{o.ref}</h1>
            <StatusBadge status={status} />
            <BrandBadge brand={o.brand} />
            <TagBadge tone={o.temp === "CHILLED" ? "blue" : "gray"}>
              <TempIcon temp={o.temp} className="size-3" /> {o.temp === "CHILLED" ? "Chilled" : "Ambient"}
            </TagBadge>
            {o.deferCount > 0 && <TagBadge tone="amber">Deferred {o.deferCount}× before</TagBadge>}
          </div>
          <p className="text-sm text-muted-foreground">
            For{" "}
            <Link href={`/dispatcher/outlets/${o.outlet.id}`} className="font-medium text-foreground hover:underline">
              {o.outlet.name}
            </Link>{" "}
            · {o.outlet.districtId} · placed by {o.createdBy.name} on {fmtDate(o.submittedAt, { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stop && (
            <Button size="sm" nativeButton={false} render={<Link href={`/dispatcher/trips/${stop.trip.id}`} />}>
              <Route data-icon="inline-start" /> Open {stop.trip.ref}
            </Button>
          )}
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dispatcher/outlets/${o.outlet.id}`} />}>
            <Store data-icon="inline-start" /> Outlet
          </Button>
          {manager && <MessageButton memberId={manager.id} label="Message store" />}
        </div>
      </div>

      {live && <LiveStopBanner trip={live.trip} stop={live.stop} subject="order" />}

      {deferral && (
        <section className="grid gap-3 rounded-xl border border-amber-600/25 bg-amber-500/[0.06] p-4 dark:border-amber-400/25 dark:bg-amber-400/[0.07]">
          <div className="flex flex-wrap items-center gap-2">
            <PackageX className="size-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-semibold">This order was deferred</h2>
            {deferral.reason && <ReasonBadge reason={deferral.reason} />}
            {deferral.source === "DISPATCHER" ? (
              <TagBadge tone="violet">Decided by {deferral.overriddenBy?.name ?? "dispatcher"}</TagBadge>
            ) : (
              <TagBadge tone={deferral.scoreBreakdown?.unavoidable === true ? "gray" : "amber"}>
                {deferral.scoreBreakdown?.unavoidable === true ? "Unavoidable" : "A trade-off"}
              </TagBadge>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              Plan v{deferral.plan.version} ({deferral.plan.status.toLowerCase()}) · {timeAgo(deferral.createdAt)}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-1.5 text-sm">
              <p>{deferral.note || deferral.explanation || "No explanation was recorded."}</p>
              {deferral.reason && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{DEFERRAL_REASON_META[deferral.reason].label}:</span> {DEFERRAL_REASON_META[deferral.reason].hint}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {deferral.source === "ENGINE" && deferral.scoreBreakdown?.unavoidable === true
                  ? "No feasible allocation could serve this order today under the operating rules, so waiting for the next run is the only option."
                  : deferral.source === "ENGINE"
                    ? "Capacity existed but went to higher-priority orders. Moving this order onto a trip in Planning shows what would break."
                    : "A dispatcher took this order off its trip. It can be put back from the Deferred orders panel in Planning."}
              </p>
              {o.deferCount > 0 && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  Already deferred {o.deferCount}× before. {o.outlet.name} has gone without a delivery on consecutive runs.
                </p>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-x-5 gap-y-2 md:grid-cols-1">
              <Fact label="Moves to" value={fmtDate(o.deliveryDate, { weekday: "short", day: "numeric", month: "short" })} />
              <Fact label="Priority score" value={deferral.priorityScore} />
              <Fact label="Store told" value={deferral.plan.status === "PUBLISHED" ? "Yes, on publish" : "On publish"} />
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
              <Workflow data-icon="inline-start" /> Open planning
            </Button>
            {manager && <MessageButton memberId={manager.id} label="Message store" />}
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Boxes} label="Units" value={o.units} hint={`${o.lines.length} line${o.lines.length === 1 ? "" : "s"}`} />
        <StatCard icon={Scale} tone="blue" label="Weight" value={`${fmtNum(o.weightKg)} kg`} hint={`${fmtNum(o.volumeM3, 2)} m³`} />
        <StatCard icon={Target} tone="violet" label="Priority score" value={latest ? latest.priorityScore : "—"} hint={latest ? `Plan v${latest.plan.version}` : "Not planned yet"} />
        <StatCard icon={Repeat} tone="amber" label="Deferrals" value={o.deferCount} hint="Pushed back" />
        <StatCard icon={Truck} tone="green" label="Run date" value={fmtDate(o.deliveryDate, { day: "numeric", month: "short" })} hint={`Asked for ${fmtDate(o.requestedDate, { day: "numeric", month: "short" })}`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-3">
          <Section title="Items" className="gap-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{l.category.toLowerCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(l.weightKg)} kg</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(l.volumeM3, 2)} m³</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="text-xs">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{o.units}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(o.weightKg)} kg</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(o.volumeM3, 2)} m³</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            {o.notes && <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs">{o.notes}</p>}
          </Section>

          <Section title="Planning decisions" aside={o.decisions.length ? `${o.decisions.length} plan${o.decisions.length === 1 ? "" : "s"}` : undefined}>
            {!o.decisions.length ? (
              <p className="text-sm text-muted-foreground">Not planned yet.</p>
            ) : (
              <div className="grid gap-3">
                {o.decisions.map((d) => (
                  <div key={d.id} className="grid gap-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={d.decision} />
                      {d.reason && <ReasonBadge reason={d.reason} />}
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        Plan v{d.plan.version} · {d.source === "DISPATCHER" ? (d.overriddenBy?.name ?? "Dispatcher") : "Engine"} · {timeAgo(d.createdAt)}
                      </span>
                    </div>
                    {d.explanation && <p className="text-xs">{d.explanation}</p>}
                    {d.note && <p className="text-xs text-muted-foreground">Note: {d.note}</p>}
                    <ScoreBreakdown score={d.priorityScore} breakdown={d.scoreBreakdown} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Activity" aside={`${o.audit.length} event${o.audit.length === 1 ? "" : "s"}`}>
            {!o.audit.length ? (
              <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
            ) : (
              <ol className="relative grid gap-4 border-l pl-5">
                {o.audit.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute top-1 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" />
                    <p className="font-medium">
                      {humanize(a.action)} <span className="font-normal text-muted-foreground">by {a.actor}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(a.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <Section title={<><Truck className="size-4 text-muted-foreground" /> Delivery</>}>
            {stop ? (
              <div className="grid gap-2">
                <Row k="Trip" v={<Link href={`/dispatcher/trips/${stop.trip.id}`} className="hover:underline">{stop.trip.ref}</Link>} />
                <Row k="Vehicle" v={<Link href={`/dispatcher/vehicles/${stop.trip.vehicleId}`} className="hover:underline">{stop.trip.vehicleId}</Link>} />
                <Row k="Stop" v={`#${stop.seq}${live ? ` of ${live.trip.stops.length}` : ""}`} />
                <Row k="Planned arrival" v={minToHHMM(stop.plannedArrivalMin)} />
                {live?.stop.status === "COMPLETED" ? (
                  <Row k="Delivered at" v={minToHHMM(live.stop.completedMin ?? live.stop.etaMin)} />
                ) : (
                  <Row k="Expected" v={minToHHMM(live?.stop.etaMin ?? stop.etaMin ?? stop.plannedArrivalMin)} />
                )}
                <Row k="Window" v={outletWindow(o.outlet)} />
                {stop.trip.driver && (
                  <div className="mt-1 flex items-center justify-between rounded-md bg-muted/50 p-2 text-xs">
                    <span className="font-medium">{stop.trip.driver.name}</span>
                    <CallLink phone={stop.trip.driver.phone} />
                  </div>
                )}
                {stop.atRisk && <TagBadge tone="red">At risk{stop.riskReason ? `: ${stop.riskReason}` : ""}</TagBadge>}
                {stop.proof && (
                  <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Signed for by {stop.proof.recipientName ?? "recipient"} · {fmtDateTime(stop.proof.capturedAt)}
                  </p>
                )}
                {stop.trip.plan.status !== "PUBLISHED" && <p className="text-xs text-muted-foreground">On a draft plan: not yet visible to drivers.</p>}
              </div>
            ) : (
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">Not on a trip yet.</p>
                <Button size="sm" variant="outline" className="w-fit" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
                  Go to planning
                </Button>
              </div>
            )}
          </Section>

          {o.receipt && (
            <Section title={<><FileCheck2 className="size-4 text-muted-foreground" /> Receipt</>}>
              <div className="grid gap-2 text-sm">
                <StatusBadge status={o.receipt.status} />
                <p className="text-xs text-muted-foreground">
                  Confirmed by {o.receipt.confirmedBy.name} · {fmtDateTime(o.receipt.confirmedAt)}
                </p>
                {o.receipt.notes && <p className="text-xs">{o.receipt.notes}</p>}
              </div>
            </Section>
          )}

          <Section title={<><Store className="size-4 text-muted-foreground" /> Outlet</>}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Fact label="Outlet" value={<Link href={`/dispatcher/outlets/${o.outlet.id}`} className="hover:underline">{o.outlet.id}</Link>} />
              <Fact label="District" value={o.outlet.districtId} />
              <Fact label="Window" value={outletWindow(o.outlet)} />
              <Fact label="Dock" value={DOCK_LABEL[o.outlet.dockType]} />
              <Fact label="Access" value={PARKING_LABEL[o.outlet.parkingConstraint]} />
              <Fact label="Last delivered" value={o.outlet.lastDeliveredOn ? fmtDate(o.outlet.lastDeliveredOn, { day: "numeric", month: "short" }) : "—"} />
            </dl>
            {o.outlet.managers.map((m) => (
              <div key={m.id} className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs">
                <ClipboardCheck className="size-3.5 text-muted-foreground" />
                <span className="flex-1 font-medium">{m.name}</span>
                <CallLink phone={m.phone} />
                <MessageButton memberId={m.id} label="Message" size="xs" />
              </div>
            ))}
          </Section>

          <Section title="Issues" aside={o.issues.filter((i) => i.status !== "RESOLVED").length ? `${o.issues.filter((i) => i.status !== "RESOLVED").length} open` : undefined}>
            <IssueList issues={o.issues} empty="No issues on this order." />
          </Section>
        </div>
      </div>
    </div>
  )
}
