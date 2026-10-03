"use client"

import { CircleAlert } from "lucide-react"
import type { StoreOrderRules, StoreProduct } from "@waypoint/shared"
import { BrandBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Violation } from "@/lib/api"
import { fmtDate, fmtNum } from "@/lib/format"
import { sizeProblem, totals, type OrderDraft } from "./wizard-state"

/** Step 4: read-only preview of the order before it is submitted, plus anything the server refused. */
export function StepReview({
  rules,
  products,
  draft,
  violations,
}: {
  rules: StoreOrderRules
  products: StoreProduct[]
  draft: OrderDraft
  violations: Violation[]
}) {
  const t = totals(draft, products)
  const problem = sizeProblem(t, draft.temp, rules)
  const issues = [...violations.map((v) => v.message), ...(problem && !violations.some((v) => v.rule === "SIZE") ? [problem] : [])]

  return (
    <div className="grid gap-3">
      {issues.length > 0 && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>This order can’t be submitted yet</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Brand" value={<BrandBadge brand={rules.brand} />} />
          <Fact
            label="Type"
            value={
              <TagBadge tone={draft.temp === "CHILLED" ? "blue" : "gray"}>
                <TempIcon temp={draft.temp ?? "AMBIENT"} className="size-3" /> {draft.temp === "CHILLED" ? "Chilled" : "Ambient"}
              </TagBadge>
            }
          />
          <Fact label="Delivery date" value={draft.deliveryDate ? fmtDate(draft.deliveryDate) : "—"} />
          <Fact label="Preferred time" value={draft.windowPref ? draft.windowPref.replace("-", "–") : "Any time in window"} />
          {draft.notes.trim() && (
            <div className="col-span-full rounded-md bg-muted/50 p-2 text-xs">
              <span className="text-muted-foreground">Notes: </span>
              {draft.notes.trim()}
            </div>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.picked.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.unitLabel}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{draft.qty[p.id]}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(p.unitWeightKg * draft.qty[p.id], 1)} kg</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="text-xs">
                <TableCell>
                  {t.items} item{t.items === 1 ? "" : "s"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.units}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(t.weightKg, 1)} kg · {fmtNum(t.volumeM3, 2)} m³
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-[11px] text-muted-foreground">{label}</p>
      <div className="font-medium">{value}</div>
    </div>
  )
}
