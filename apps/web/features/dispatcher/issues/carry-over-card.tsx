"use client"

import Link from "next/link"
import { ArrowRight, PackagePlus, Route } from "lucide-react"
import { StatusBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { fmtDate } from "@/lib/format"
import type { IssueDetail } from "@/lib/types"

/** Where this issue's missing/damaged units went: the carry-over order that re-sends them to the outlet. */
export function CarryOverCard({ issue }: { issue: IssueDetail }) {
  const carry = issue.carryOverOrder
  if (!carry) return null
  const stop = carry.stops[0] ?? null
  const others = carry.carryOverIssues.filter((i) => i.id !== issue.id)
  const outlet = issue.outlet?.name ?? "the outlet"
  const day = fmtDate(carry.deliveryDate, { weekday: "short", day: "numeric", month: "short" })

  return (
    <Card size="sm" className="gap-3 border-sky-600/25 bg-sky-500/[0.06] p-3 dark:border-sky-400/25 dark:bg-sky-400/[0.07]">
      <div className="flex items-center gap-2">
        <PackagePlus className="size-4 text-sky-600 dark:text-sky-400" />
        <p className="text-sm font-semibold">Items carried over</p>
        <span className="ml-auto">
          <StatusBadge status={carry.status} />
        </span>
      </div>

      <p className="text-sm">
        <span className="font-medium">
          {issue.quantity} × {issue.orderLine?.description ?? "item"}
        </span>{" "}
        will be re-sent to {outlet} on <span className="font-medium">{day}</span> with carry-over order{" "}
        <Link href={`/dispatcher/orders/${carry.id}`} className="font-medium hover:underline">
          {carry.ref}
        </Link>
        .
      </p>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Route className="size-3.5 shrink-0" />
        {stop ? (
          <span>
            Planned on{" "}
            <Link href={`/dispatcher/trips/${stop.trip.id}`} className="font-medium text-foreground hover:underline">
              {stop.trip.ref}
            </Link>{" "}
            (stop {stop.seq}, {stop.trip.plan.status.toLowerCase()} plan).
          </span>
        ) : (
          <span>Waiting for planning: it joins the plan for that day like any other order.</span>
        )}
      </p>

      <div className="grid gap-1.5">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          On {carry.ref} · {carry.units} units
        </p>
        <ul className="grid gap-1">
          {carry.lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-md border bg-background/60 px-2.5 py-1.5 text-xs">
              <span>{l.description}</span>
              <span className="tabular-nums">×{l.quantity}</span>
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Also re-sends units from{" "}
            {others.map((o, i) => (
              <span key={o.id}>
                {i > 0 && ", "}
                <Link href={`/dispatcher/issues/${o.id}`} className="hover:underline">
                  {o.ref}
                </Link>
              </span>
            ))}
            .
          </p>
        )}
      </div>

      <Button size="xs" variant="outline" className="w-fit" nativeButton={false} render={<Link href={`/dispatcher/orders/${carry.id}`} />}>
        Open {carry.ref} <ArrowRight data-icon="inline-end" />
      </Button>
    </Card>
  )
}
