"use client"

import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Number field with − / + buttons, clamped to [min, max]. */
export function QuantityInput({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  disabled,
  className,
  label = "Quantity",
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  label?: string
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min)))
  return (
    <div className={cn("inline-flex items-center rounded-lg border bg-background", className)}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Decrease ${label.toLowerCase()}`} disabled={disabled || value <= min} onClick={() => set(value - step)}>
        <Minus />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => set(e.target.valueAsNumber)}
        className="h-7 w-12 [appearance:textfield] bg-transparent text-center text-sm tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Increase ${label.toLowerCase()}`} disabled={disabled || value >= max} onClick={() => set(value + step)}>
        <Plus />
      </Button>
    </div>
  )
}
