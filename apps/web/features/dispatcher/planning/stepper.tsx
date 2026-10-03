import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = ["Generate plan", "Review & adjust", "Publish"]

export function Stepper({
  step,
  published,
  onStep,
}: {
  step: 1 | 2 | 3
  published?: boolean
  onStep?: (step: 2 | 3) => void
}) {
  return (
    <ol className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < step || (n === 3 && (step === 3 || !!published))
        const active = n === step
        return (
          <li
            key={label}
            className="flex flex-1 items-center gap-2 last:flex-none"
          >
            {published && onStep && n > 1 ? (
              <button
                type="button"
                onClick={() => onStep(n as 2 | 3)}
                className="flex items-center gap-2 rounded-md hover:opacity-80"
              >
                <StepDot n={n} done={done} active={active} />
                <span
                  className={cn(
                    "text-sm whitespace-nowrap",
                    active ? "font-medium" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </button>
            ) : (
              <>
                <StepDot n={n} done={done} active={active} />
                <span
                  className={cn(
                    "text-sm whitespace-nowrap",
                    active ? "font-medium" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </>
            )}
            {n < 3 && (
              <span
                className={cn(
                  "mx-2 h-px flex-1",
                  n < step ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StepDot({
  n,
  done,
  active,
}: {
  n: number
  done: boolean
  active: boolean
}) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
        done && "border-primary bg-primary text-primary-foreground",
        active && !done && "border-primary text-primary",
        active && done && "ring-2 ring-primary/30",
        !done && !active && "text-muted-foreground"
      )}
    >
      {done ? <Check className="size-3.5" /> : n}
    </span>
  )
}
