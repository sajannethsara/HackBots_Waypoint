"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { QuantityInput } from "@/components/shared/quantity-input"
import type { StoreProduct } from "@waypoint/shared"
import { fmtNum } from "@/lib/format"
import type { OrderDraft } from "./wizard-state"

/** Step 2: search and tick products, set quantities. Totals and the Save/Continue buttons live in the wizard footer. */
export function StepProducts({
  products,
  loading,
  draft,
  onQty,
  problem,
}: {
  products?: StoreProduct[]
  loading: boolean
  draft: OrderDraft
  onQty: (id: string, qty: number) => void
  problem: string | null
}) {
  const [query, setQuery] = useState("")
  if (loading || !products) return <Skeleton className="h-80" />
  const term = query.trim().toLowerCase()
  const rows = term ? products.filter((p) => `${p.name} ${p.category} ${p.sku}`.toLowerCase().includes(term)) : products
  const suggestions = term ? rows.slice(0, 5) : []

  return (
    <div className="grid gap-3">
      <Command shouldFilter={false} className="rounded-lg! border bg-background p-0">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search products by name, category or code…" aria-label="Search products" />
        {term && (
          <CommandList className="max-h-44">
            <CommandEmpty>No product matches “{query}”.</CommandEmpty>
            {suggestions.map((p) => {
              const picked = (draft.qty[p.id] ?? 0) > 0
              return (
                <CommandItem key={p.id} value={p.id} data-checked={picked} onSelect={() => onQty(p.id, picked ? 0 : 1)}>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.category.toLowerCase()} · {p.unitLabel}
                  </span>
                </CommandItem>
              )
            })}
          </CommandList>
        )}
      </Command>

      <Card size="sm" className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-10 pl-4">
                <span className="sr-only">Select</span>
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="hidden md:table-cell text-right">Unit weight</TableHead>
              <TableHead className="pr-4 text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No products match your search.
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => {
              const q = draft.qty[p.id] ?? 0
              return (
                <TableRow key={p.id} data-state={q > 0 ? "selected" : undefined}>
                  <TableCell className="pl-4">
                    <Checkbox checked={q > 0} onCheckedChange={(c) => onQty(p.id, c ? 1 : 0)} aria-label={`Select ${p.name}`} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.sku} · {p.unitLabel}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground capitalize sm:table-cell">{p.category.toLowerCase()}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{fmtNum(p.unitWeightKg, 1)} kg</TableCell>
                  <TableCell className="pr-4 text-right">
                    <QuantityInput value={q} min={0} max={p.maxQty} label={`${p.name} quantity`} onChange={(n) => onQty(p.id, n)} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {problem && (
        <Alert variant="destructive">
          <AlertTitle>Order too large</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
