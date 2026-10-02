import { ArrowDown } from "lucide-react"
import { TagBadge, TempIcon } from "@/components/shared/badges"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtNum } from "@/lib/format"
import type { TripDetail } from "@/lib/types"

/** Load in reverse stop order: the last drop goes in first, so the first drop sits at the door. */
export function TripManifest({ detail }: { detail: TripDetail }) {
  const stops = [...detail.trip.stops].sort((a, b) => b.seq - a.seq)
  const lines = stops.flatMap((s) => s.order.lines.map((l) => ({ ...l, stop: s })))
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-1.5 px-4 pt-3 text-xs text-muted-foreground">
        <ArrowDown className="size-3.5" /> Loading sequence: first row goes in first (deepest), last row sits by the door.
        {detail.trip.loadedBy ? ` Loaded by ${detail.trip.loadedBy.name}.` : " Not yet released by the loader."}
      </p>
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="pl-4">Load #</TableHead>
            <TableHead>For stop</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead className="pr-4 text-right">Volume</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow key={l.id}>
              <TableCell className="pl-4 tabular-nums">{i + 1}</TableCell>
              <TableCell>
                <TagBadge>
                  #{l.stop.seq} · {l.stop.order.outlet.id}
                </TagBadge>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <TempIcon temp={l.stop.order.temp} /> {l.stop.order.ref}
                </span>
              </TableCell>
              <TableCell>{l.description}</TableCell>
              <TableCell className="text-xs text-muted-foreground capitalize">{l.category.toLowerCase()}</TableCell>
              <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtNum(l.weightKg)} kg</TableCell>
              <TableCell className="pr-4 text-right tabular-nums">{fmtNum(l.volumeM3, 2)} m³</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/30 font-medium hover:bg-muted/30">
            <TableCell className="pl-4" colSpan={5}>
              Total
            </TableCell>
            <TableCell className="text-right tabular-nums">{lines.reduce((s, l) => s + l.quantity, 0)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtNum(detail.trip.loadWeightKg)} kg</TableCell>
            <TableCell className="pr-4 text-right tabular-nums">{fmtNum(detail.trip.loadVolumeM3, 2)} m³</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
