"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  CheckCircle2,
  CirclePause,
  Fuel,
  Hand,
  LifeBuoy,
  PackageX,
  Search,
  TimerOff,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { BrandBadge, ReasonBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtNum, fmtTime, minToHHMM, pct, timeAgo } from "@/lib/format"
import type { ExceptionsOverview } from "@/lib/types"
import { cn } from "@/lib/utils"
import { IssueTypeLabel, SeverityBadge } from "../issues/issue-badges"
import { useExceptions } from "../queries"

type TabKey = "deferred" | "atRisk" | "gate" | "deliveries" | "issues" | "fleet"

const TABS: { key: TabKey; label: string; icon: LucideIcon; hint: string }[] = [
  { key: "deferred", label: "Deferred orders", icon: PackageX, hint: "Orders the plan could not serve, with the binding constraint." },
  { key: "atRisk", label: "At-risk stops", icon: TimerOff, hint: "Stops likely to arrive after the store's window closes." },
  { key: "gate", label: "Depot gate", icon: CirclePause, hint: "Trips held, or past their departure time without a full crew." },
  { key: "deliveries", label: "Delivery problems", icon: Truck, hint: "Partial and refused deliveries reported by drivers." },
  { key: "issues", label: "Open issues", icon: LifeBuoy, hint: "Problems raised by drivers, loaders and stores that are not resolved yet." },
  { key: "fleet", label: "Fleet", icon: Wrench, hint: "Vehicles in the workshop, or close to their weekly fuel quota." },
]

export function ExceptionsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { data, isLoading } = useExceptions()
  const [q, setQ] = useState("")
  const [upcoming, setUpcoming] = useState(false)

  if (isLoading || !data) return <Skeleton className="h-[600px] rounded-xl" />

  const total = (k: TabKey) => data.counts[k]
  const requested = params.get("tab") as TabKey | null
  // Open on the first tab that has something in it.
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : (TABS.find((t) => total(t.key) > 0)?.key ?? "deferred")
  const meta = TABS.find((t) => t.key === tab)!
  const needle = q.trim().toLowerCase()
  const match = (...parts: (string | null | undefined)[]) => !needle || parts.join(" ").toLowerCase().includes(needle)
  const open = (href: string) => () => router.push(href)
  const everything = TABS.reduce((n, t) => n + total(t.key), 0)

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Exceptions"
        description={
          everything
            ? `${everything} thing${everything === 1 ? "" : "s"} need${everything === 1 ? "s" : ""} attention${data.plan ? ` on plan v${data.plan.version} (${data.plan.status.toLowerCase()})` : ""}.`
            : data.plan
              ? "Nothing needs attention. Every order is on a trip and the day is running clean."
              : "No plan for this day yet."
        }
        actions={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dispatcher/planning" />}>
            Planning <ArrowUpRight data-icon="inline-end" />
          </Button>
        }
      />

      <Card size="sm" className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <Tabs value={tab} onValueChange={(v) => router.replace(`/dispatcher/exceptions?tab=${v}`)}>
            <TabsList className="h-auto flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="text-xs">
                  <t.icon /> {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] tabular-nums",
                      total(t.key) ? "bg-destructive/10 text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {total(t.key)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative ml-auto w-56">
            <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this tab" className="h-7 pl-7 text-sm" />
          </div>
        </div>
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">{meta.hint}</p>

        {tab === "deferred" && <Deferred rows={data.deferred.filter((r) => match(r.ref, r.outlet.id, r.outlet.districtId, r.reason))} onOpen={(id) => open(`/dispatcher/orders/${id}`)()} />}
        {tab === "atRisk" && <AtRisk rows={data.atRisk.filter((r) => match(r.tripRef, r.orderRef, r.outlet.id, r.outlet.districtId, r.reason))} onOpen={(id) => open(`/dispatcher/trips/${id}`)()} />}
        {tab === "gate" && (
          <Gate
            rows={data.gate.filter((r) => (upcoming || r.overdue || r.held) && match(r.ref, r.vehicleId, r.districtId, r.driver, r.loader))}
            hidden={data.gate.filter((r) => !r.overdue && !r.held).length}
            upcoming={upcoming}
            onToggle={() => setUpcoming((v) => !v)}
            published={data.plan?.status === "PUBLISHED"}
            onOpen={open("/dispatcher/planning")}
          />
        )}
        {tab === "deliveries" && <Deliveries rows={data.deliveries.filter((r) => match(r.orderRef, r.tripRef, r.outlet.id, r.reason, r.driver))} onOpen={(id) => open(`/dispatcher/orders/${id}`)()} />}
        {tab === "issues" && <Issues rows={data.issues.filter((r) => match(r.ref, r.description, r.tripRef, r.outletId, r.orderRef))} onOpen={(id) => open(`/dispatcher/issues/${id}`)()} />}
        {tab === "fleet" && <Fleet rows={data.fleet.filter((r) => match(r.id))} onOpen={(id) => open(`/dispatcher/vehicles/${id}`)()} />}
      </Card>
    </div>
  )
}

// ── shared bits ────────────────────────────────────────────────────────────

function Clear({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-16 text-center">
      <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
      <p className="text-sm font-medium">All clear</p>
      <p className="max-w-sm text-xs text-muted-foreground">{children}</p>
    </div>
  )
}

const Head = ({ children, right }: { children: ReactNode; right?: boolean }) => <TableHead className={cn("text-xs", right && "text-right")}>{children}</TableHead>

function Rows<T>({ rows, empty, head, children }: { rows: T[]; empty: ReactNode; head: ReactNode; children: (r: T) => ReactNode }) {
  if (!rows.length) return <Clear>{empty}</Clear>
  return (
    <Table>
      <TableHeader>
        <TableRow>{head}</TableRow>
      </TableHeader>
      <TableBody>{rows.map(children)}</TableBody>
    </Table>
  )
}

const Go = () => (
  <TableCell className="w-8 pr-4 text-right">
    <ArrowUpRight className="size-3.5 text-muted-foreground" />
  </TableCell>
)

// ── tabs ───────────────────────────────────────────────────────────────────

function Deferred({ rows, onOpen }: { rows: ExceptionsOverview["deferred"]; onOpen: (orderId: string) => void }) {
  return (
    <Rows
      rows={rows}
      empty="Every order in the plan is on a trip."
      head={
        <>
          <Head>Order</Head>
          <Head>Outlet</Head>
          <Head>Brand</Head>
          <Head right>Load</Head>
          <Head>Reason</Head>
          <Head>Why</Head>
          <Head right>Score</Head>
          <Head>{null}</Head>
        </>
      }
    >
      {(r) => (
        <TableRow key={r.orderId} className="cursor-pointer" onClick={() => onOpen(r.orderId)}>
          <TableCell className="font-medium">
            <span className="inline-flex items-center gap-1.5">
              <TempIcon temp={r.temp} /> {r.ref}
              {r.deferCount > 0 && <TagBadge tone="red">↻{r.deferCount}</TagBadge>}
            </span>
          </TableCell>
          <TableCell>
            {r.outlet.id} <span className="text-muted-foreground">· {r.outlet.districtId}</span>
          </TableCell>
          <TableCell>
            <BrandBadge brand={r.brand} />
          </TableCell>
          <TableCell className="text-right text-xs tabular-nums">
            {fmtNum(r.weightKg)} kg · {fmtNum(r.volumeM3, 1)} m³
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {r.reason && <ReasonBadge reason={r.reason} />}
              {r.source === "DISPATCHER" ? <TagBadge tone="violet">Dispatcher</TagBadge> : <TagBadge tone={r.unavoidable ? "gray" : "amber"}>{r.unavoidable ? "Unavoidable" : "Choice"}</TagBadge>}
            </div>
          </TableCell>
          <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">
            <span className="line-clamp-2">{r.explanation}</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.priorityScore}</TableCell>
          <Go />
        </TableRow>
      )}
    </Rows>
  )
}

function AtRisk({ rows, onOpen }: { rows: ExceptionsOverview["atRisk"]; onOpen: (tripId: string) => void }) {
  return (
    <Rows
      rows={rows}
      empty="Every stop is expected inside its receiving window."
      head={
        <>
          <Head>Trip</Head>
          <Head right>Stop</Head>
          <Head>Outlet</Head>
          <Head>Order</Head>
          <Head right>ETA</Head>
          <Head right>Window closes</Head>
          <Head>Risk</Head>
          <Head>{null}</Head>
        </>
      }
    >
      {(r) => (
        <TableRow key={r.stopId} className="cursor-pointer" onClick={() => onOpen(r.tripId)}>
          <TableCell className="font-medium">
            <span className="inline-flex items-center gap-1.5">
              {r.tripRef} {r.live && <TagBadge tone="green">Live</TagBadge>}
            </span>
          </TableCell>
          <TableCell className="text-right tabular-nums">#{r.seq}</TableCell>
          <TableCell>
            {r.outlet.id} <span className="text-muted-foreground">· {r.outlet.districtId}</span>
          </TableCell>
          <TableCell>{r.orderRef}</TableCell>
          <TableCell className="text-right font-medium tabular-nums">{minToHHMM(r.arrivalMin)}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">{minToHHMM(r.windowCloseMin)}</TableCell>
          <TableCell className="text-xs whitespace-normal">
            <TagBadge tone="amber">{r.reason ?? "At risk"}</TagBadge>
          </TableCell>
          <Go />
        </TableRow>
      )}
    </Rows>
  )
}

function Claim({ name, at, empty }: { name: string | null; at: string | null; empty: string }) {
  return at ? (
    <TagBadge tone="green">
      {name ?? "Claimed"} · {fmtTime(at)}
    </TagBadge>
  ) : (
    <TagBadge tone="gray">
      <Hand className="size-3" /> {name ?? empty}
    </TagBadge>
  )
}

function Gate({
  rows,
  hidden,
  upcoming,
  onToggle,
  published,
  onOpen,
}: {
  rows: ExceptionsOverview["gate"]
  hidden: number
  upcoming: boolean
  onToggle: () => void
  published: boolean
  onOpen: () => void
}) {
  return (
    <div>
      {published && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <span>Trips that have not gone live yet. Overdue means the planned departure time has passed.</span>
          {hidden > 0 && (
            <Button variant="ghost" size="xs" onClick={onToggle}>
              {upcoming ? "Hide" : "Show"} {hidden} upcoming
            </Button>
          )}
        </div>
      )}
      <Rows
        rows={rows}
        empty={published ? "No trip is held or running late at the depot." : "The plan is not published yet, so the depot gate is not open."}
        head={
          <>
            <Head>Trip</Head>
            <Head>Vehicle</Head>
            <Head>District</Head>
            <Head right>Depart</Head>
            <Head>Driver</Head>
            <Head>Loader</Head>
            <Head>Status</Head>
            <Head>{null}</Head>
          </>
        }
      >
        {(r) => (
          <TableRow key={r.tripId} className="cursor-pointer" onClick={onOpen}>
            <TableCell className="font-medium">
              <span className="inline-flex items-center gap-1.5">
                {r.ref} <BrandBadge brand={r.brand} />
              </span>
            </TableCell>
            <TableCell>{r.vehicleId}</TableCell>
            <TableCell>{r.districtId}</TableCell>
            <TableCell className="text-right tabular-nums">{minToHHMM(r.departMin)}</TableCell>
            <TableCell>
              <Claim name={r.driver} at={r.driverClaimedAt} empty="Not claimed" />
            </TableCell>
            <TableCell>
              <Claim name={r.loader} at={r.loaderClaimedAt} empty="Not claimed" />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                {r.held && <TagBadge tone="amber">Held</TagBadge>}
                {r.overdue && <TagBadge tone="red">Overdue</TagBadge>}
                {!r.held && !r.overdue && <TagBadge tone="gray">Upcoming</TagBadge>}
              </div>
            </TableCell>
            <Go />
          </TableRow>
        )}
      </Rows>
    </div>
  )
}

function Deliveries({ rows, onOpen }: { rows: ExceptionsOverview["deliveries"]; onOpen: (orderId: string) => void }) {
  return (
    <Rows
      rows={rows}
      empty="No delivery has been refused or only partly accepted."
      head={
        <>
          <Head>Order</Head>
          <Head>Outlet</Head>
          <Head>Trip</Head>
          <Head>Outcome</Head>
          <Head right>Refused</Head>
          <Head>Reason</Head>
          <Head>When</Head>
          <Head>{null}</Head>
        </>
      }
    >
      {(r) => (
        <TableRow key={r.stopId} className="cursor-pointer" onClick={() => onOpen(r.orderId)}>
          <TableCell className="font-medium">{r.orderRef}</TableCell>
          <TableCell>
            {r.outlet.id} <span className="text-muted-foreground">· {r.outlet.districtId}</span>
          </TableCell>
          <TableCell>
            {r.tripRef} <span className="text-xs text-muted-foreground">{r.driver}</span>
          </TableCell>
          <TableCell>
            <TagBadge tone={r.status === "REFUSED" ? "red" : "amber"}>{r.status === "REFUSED" ? "Refused" : "Partial"}</TagBadge>
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.refusedQty || "—"}</TableCell>
          <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">{r.reason ?? "No reason recorded"}</TableCell>
          <TableCell className="text-xs text-muted-foreground">{r.at ? timeAgo(r.at) : "—"}</TableCell>
          <Go />
        </TableRow>
      )}
    </Rows>
  )
}

function Issues({ rows, onOpen }: { rows: ExceptionsOverview["issues"]; onOpen: (id: string) => void }) {
  return (
    <Rows
      rows={rows}
      empty="No open issues."
      head={
        <>
          <Head>Issue</Head>
          <Head>Type</Head>
          <Head>Severity</Head>
          <Head>Where</Head>
          <Head>Description</Head>
          <Head>Raised</Head>
          <Head>{null}</Head>
        </>
      }
    >
      {(r) => (
        <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
          <TableCell className="font-medium">{r.ref}</TableCell>
          <TableCell className="text-xs">
            <IssueTypeLabel type={r.type} />
          </TableCell>
          <TableCell>
            <SeverityBadge severity={r.severity} />
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">{[r.tripRef, r.outletId, r.orderRef].filter(Boolean).join(" · ") || "—"}</TableCell>
          <TableCell className="max-w-80 text-xs whitespace-normal">
            <span className="line-clamp-2">{r.description}</span>
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</TableCell>
          <Go />
        </TableRow>
      )}
    </Rows>
  )
}

function Fleet({ rows, onOpen }: { rows: ExceptionsOverview["fleet"]; onOpen: (id: string) => void }) {
  return (
    <Rows
      rows={rows}
      empty="Every vehicle is available and well inside its fuel quota."
      head={
        <>
          <Head>Vehicle</Head>
          <Head>Type</Head>
          <Head>Problem</Head>
          <Head>Fuel this week</Head>
          <Head>{null}</Head>
        </>
      }
    >
      {(r) => (
        <TableRow key={`${r.id}-${r.kind}`} className="cursor-pointer" onClick={() => onOpen(r.id)}>
          <TableCell className="font-medium">{r.id}</TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {r.temp === "REEFER" ? "Reefer" : "Ambient"} {r.type.toLowerCase()}
          </TableCell>
          <TableCell>
            {r.kind === "WORKSHOP" ? (
              <TagBadge tone="red">
                <Wrench className="size-3" /> In workshop
              </TagBadge>
            ) : (
              <TagBadge tone={r.usedL >= r.quotaL ? "red" : "amber"}>
                <Fuel className="size-3" /> {pct(r.usedL, r.quotaL)}% of quota
              </TagBadge>
            )}
          </TableCell>
          <TableCell className="w-64">
            {r.kind === "FUEL" ? (
              <div className="grid gap-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", r.usedL >= r.quotaL ? "bg-red-500" : "bg-amber-500")} style={{ width: `${Math.min(100, pct(r.usedL, r.quotaL))}%` }} />
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {fmtNum(r.usedL, 1)} / {fmtNum(r.quotaL, 1)} L
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Not available for trips</span>
            )}
          </TableCell>
          <Go />
        </TableRow>
      )}
    </Rows>
  )
}
