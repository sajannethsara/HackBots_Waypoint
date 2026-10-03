"use client"

import { Fragment, useState } from "react"
import { BrandBadge, ReasonBadge, TagBadge, TempIcon, TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtNum } from "@/lib/format"
import type { Decision } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ScoreBreakdown } from "../shared/score-breakdown"

/** Tab 3: the deferred orders as a table with the binding constraint and score breakdown per order. */
export function DeferredQueue({ deferred, onAssign, onDefer }: { deferred: Decision[]; onAssign: (d: Decision) => void; onDefer: (d: Decision) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <p className="text-sm font-semibold">Deferred orders</p>
        <TagBadge tone="red">{deferred.length}</TagBadge>
        <span className="text-xs text-muted-foreground">Every deferral carries the binding constraint and whether it was avoidable.</span>
      </div>
      {!deferred.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Every order is allocated.</p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Load</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-[38%]">Why</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {deferred.map((d) => {
              const unavoidable = d.scoreBreakdown?.unavoidable === true
              return (
                <Fragment key={d.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(open === d.id ? null : d.id)}>
                    <TableCell className="pl-4 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <TempIcon temp={d.order.temp} /> {d.order.ref}
                        {d.order.deferCount > 0 && <TagBadge tone="red">↻{d.order.deferCount}</TagBadge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {d.order.outlet.id} <span className="text-muted-foreground">· {d.order.outlet.districtId}</span>
                    </TableCell>
                    <TableCell>
                      <BrandBadge brand={d.order.brand} />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmtNum(d.order.weightKg)} kg · {fmtNum(d.order.volumeM3, 1)} m³
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {d.reason && <ReasonBadge reason={d.reason} />}
                        {d.source === "DISPATCHER" ? (
                          <TagBadge tone="violet">Dispatcher</TagBadge>
                        ) : (
                          <TagBadge tone={unavoidable ? "gray" : "amber"}>{unavoidable ? "Unavoidable" : "Choice"}</TagBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal text-muted-foreground">{d.note || d.explanation}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.priorityScore}</TableCell>
                    <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="xs" onClick={() => onAssign(d)}>
                          Assign
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => onDefer(d)}>
                          Reason
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {open === d.id && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="bg-muted/30 px-4 py-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          <ScoreBreakdown score={d.priorityScore} breakdown={d.scoreBreakdown} />
                          <div className={cn("rounded-lg p-3 text-xs ring-1 ring-inset", unavoidable ? TONE.gray : TONE.amber)}>
                            {unavoidable
                              ? "No feasible allocation could serve this order today under the operating rules."
                              : "This deferral was a trade-off: capacity existed but went to other orders. Try Assign to see what would break."}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
        </ScrollArea>
      )}
    </div>
  )
}
