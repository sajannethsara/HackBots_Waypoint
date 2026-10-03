import Link from "next/link"
import { Eye, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { fmtDate } from "@/lib/format"

export const shortDate = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric" })

/** Row menu. Edit and cancel join it in a later phase (store managers cannot defer); read-only actions only for now. */
export function OrderRowMenu({ id, onQuickView }: { id: string; onQuickView?: () => void }) {
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
        <DropdownMenuItem render={<Link href={`/store/orders/${id}`} />}>Open full page</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
