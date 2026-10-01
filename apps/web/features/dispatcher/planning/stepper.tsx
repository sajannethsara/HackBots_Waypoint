import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = ["Generate plan", "Review & adjust", "Publish"]

export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < step || (n === 3 && step === 3)
        const active = n === step
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                done && "border-primary bg-primary text-primary-foreground",
                active && !done && "border-primary text-primary",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : n}
            </span>
            <span className={cn("text-sm whitespace-nowrap", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {n < 3 && <span className={cn("mx-2 h-px flex-1", n < step ? "bg-primary" : "bg-border")} />}
          </li>
        )
      })}
    </ol>
  )
}
