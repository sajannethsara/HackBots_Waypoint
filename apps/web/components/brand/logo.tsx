import Image from "next/image"
import { cn } from "@/lib/utils"

/** Waypoint mark + wordmark. `compact` renders the mark only. */
export function Logo({ className, compact, subtitle }: { className?: string; compact?: boolean; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Image src="/logo-icon.png" alt="" width={15} height={18} className="dark:brightness-150" priority />
      </span>
      {!compact && (
        <div className="grid leading-tight">
          <span className="text-sm font-semibold tracking-[0.2em] text-primary">WAYPOINT</span>
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
