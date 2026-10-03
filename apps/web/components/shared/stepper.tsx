import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Step {
  key: string
  label: string
}

/**
 * Horizontal progress for multi-step flows (Create Order, Receive Delivery).
 * Steps before `current` show a check, the current one is filled, later ones are muted.
 */
export function Stepper({ steps, current, className }: { steps: Step[]; current: number; className?: string }) {
  return (
    <ol className={cn("flex items-center", className)} aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s.key} className={cn("flex items-start", i < steps.length - 1 && "flex-1")} aria-current={active ? "step" : undefined}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ring-1 ring-inset",
                  done || active ? "bg-primary text-primary-foreground ring-primary" : "bg-muted text-muted-foreground ring-border",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-xs whitespace-nowrap", active ? "font-medium text-foreground" : "text-muted-foreground max-sm:sr-only")}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span aria-hidden className={cn("mx-2 mt-3.5 h-px flex-1", done ? "bg-primary" : "bg-border")} />}
          </li>
        )
      })}
    </ol>
  )
}
