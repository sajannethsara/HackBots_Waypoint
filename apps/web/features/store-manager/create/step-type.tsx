"use client"

import { Check, Lock, Package, Snowflake } from "lucide-react"
import type { StoreOrderRules, StoreTemp } from "@waypoint/shared"
import { BrandBadge } from "@/components/shared/badges"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const TYPES: { value: StoreTemp; title: string; text: string; icon: typeof Package; tone: string }[] = [
  { value: "AMBIENT", title: "Ambient", text: "Dry goods and anything that travels at room temperature.", icon: Package, tone: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
  { value: "CHILLED", title: "Chilled", text: "Dairy, meat and produce that need a refrigerated vehicle.", icon: Snowflake, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400" },
]

/** Step 1: the brand is fixed to the outlet, the order type is the only choice (and only Fresh has one). */
export function StepType({ rules, value, onChange }: { rules?: StoreOrderRules; value: StoreTemp | null; onChange: (t: StoreTemp) => void }) {
  if (!rules) return <Skeleton className="h-48" />
  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Brand <BrandBadge brand={rules.brand} />
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Lock className="size-3" /> Your outlet orders from one brand, so this is set for you.
          </CardDescription>
        </CardHeader>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium">What are you ordering?</h2>
        <div role="radiogroup" aria-label="Order type" className="grid gap-3 sm:grid-cols-2">
          {TYPES.map((t) => {
            const allowed = rules.tempOptions.includes(t.value)
            const selected = value === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!allowed}
                onClick={() => onChange(t.value)}
                className="text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Card size="sm" className={cn("h-full transition-colors", selected ? "ring-2 ring-primary" : allowed && "hover:bg-muted/50")}>
                  <CardContent className="flex items-start gap-3">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t.tone)}>
                      <t.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{allowed ? t.text : `${t.title} orders are only available to Fresh outlets.`}</p>
                    </div>
                    {selected && <Check className="size-4 text-primary" />}
                  </CardContent>
                </Card>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
