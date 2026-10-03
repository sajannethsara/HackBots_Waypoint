import Link from "next/link"
import { Eye, MoreHorizontal, Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { fmtDate } from "@/lib/format"

export const shortDate = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric" })

/** Row menu. Edit and Cancel show while dispatch has not planned the order (store managers cannot defer). */
export function OrderRowMenu({ id, status, onQuickView, onCancel }: { id: string; status?: string; onQuickView?: () => void; onCancel?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Order actions" onClick={(e) => e.stopPropagation()} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {onQuickView && (
          <DropdownMenuItem onClick={onQuickView}>
            <Eye /> Quick view
          </DropdownMenuItem>
        )}
        {status === "SUBMITTED" && (
          <DropdownMenuItem render={<Link href={`/store-manager/orders/new?edit=${id}`} />}>
            <Pencil /> Edit order
          </DropdownMenuItem>
        )}
        {status === "DRAFT" && (
          <DropdownMenuItem render={<Link href={`/store-manager/orders/new?draft=${id}`} />}>
            <Pencil /> Continue editing
          </DropdownMenuItem>
        )}
        <DropdownMenuItem render={<Link href={`/store-manager/orders/${id}`} />}>Open full page</DropdownMenuItem>
        {status === "SUBMITTED" && onCancel && (
          <DropdownMenuItem variant="destructive" onClick={onCancel}>
            <X /> Cancel order
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Orders dispatch has taken: the store can no longer change them here. */
export const LOCKED_STATUSES = ["PLANNED", "LOADED", "IN_TRANSIT"]
