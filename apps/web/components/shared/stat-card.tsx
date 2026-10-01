import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TONE, type Tone } from "./badges"

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "green",
  aside,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  tone?: Tone
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("flex-row items-center gap-3 px-4 py-3", className)}>
      {Icon && (
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", TONE[tone])}>
          <Icon className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl leading-tight font-semibold tabular-nums">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {aside}
    </Card>
  )
}
