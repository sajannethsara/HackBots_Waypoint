import { cn } from "@/lib/utils"

const FACTOR_LABEL: Record<string, string> = {
  base: "Base",
  deferredYesterday: "Deferred on last run",
  daysSinceLastServed: "Days since last served",
  chilled: "Chilled / perishable",
  brand: "Brand urgency",
  festivalRamp: "Festival ramp",
  payday: "Payday",
}

/** Explains a priority score as a stacked list of contributing factors. */
export function ScoreBreakdown({ score, breakdown, className }: { score: number; breakdown: Record<string, unknown>; className?: string }) {
  const rows = Object.entries(breakdown).filter(([k, v]) => typeof v === "number" && k in FACTOR_LABEL) as [string, number][]
  return (
    <div className={cn("grid gap-1.5", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span className="w-40 shrink-0 text-muted-foreground">{FACTOR_LABEL[k]}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (v / Math.max(score, 1)) * 100)}%` }} />
          </div>
          <span className="w-8 text-right font-medium tabular-nums">+{v}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t pt-1.5 text-xs">
        <span className="text-muted-foreground">Priority score</span>
        <span className="font-semibold tabular-nums">{score}</span>
      </div>
    </div>
  )
}
