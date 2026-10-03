"use client"

import { Info } from "lucide-react"
import type { StoreOrderRules } from "@waypoint/shared"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate, minToHHMM } from "@/lib/format"
import { fromIso, toIso, windowSlots, type OrderDraft } from "./wizard-state"

/** Step 3: delivery date (calendar limited to operating days after the cutoff), receiving slot and notes. */
export function StepDelivery({ rules, draft, onChange }: { rules?: StoreOrderRules; draft: OrderDraft; onChange: (patch: Partial<OrderDraft>) => void }) {
  if (!rules) return <Skeleton className="h-80" />
  const slots = windowSlots(rules)
  const closed = new Set(rules.closedDates)
  const selectable = (d: Date) => {
    const iso = toIso(d)
    return iso >= rules.earliestDate && iso <= rules.latestDate && !closed.has(iso)
  }
  const tomorrow = rules.earliestDate === new Date(fromIso(rules.today).getTime() + 86_400_000).toISOString().slice(0, 10)

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
      <Card size="sm" className="w-fit max-w-full">
        <CardContent>
          <Calendar
            mode="single"
            selected={draft.deliveryDate ? fromIso(draft.deliveryDate) : undefined}
            onSelect={(d) => onChange({ deliveryDate: d ? toIso(d) : undefined })}
            defaultMonth={fromIso(draft.deliveryDate ?? rules.earliestDate)}
            disabled={(d) => !selectable(d)}
            startMonth={fromIso(rules.earliestDate)}
            endMonth={fromIso(rules.latestDate)}
          />
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Alert>
          <Info />
          <AlertTitle>Ordering cutoff is {minToHHMM(rules.cutoffMin)}</AlertTitle>
          <AlertDescription>
            Orders for a day must be placed before {minToHHMM(rules.cutoffMin)} on the day before. The earliest date you can pick is {fmtDate(rules.earliestDate, { weekday: "long", day: "numeric", month: "short" })}
            {tomorrow ? "" : " because today's cutoff has passed"}. We deliver Monday to Saturday, except holidays.
          </AlertDescription>
        </Alert>

        <FieldGroup>
          <Field>
            <FieldLabel>Delivery date</FieldLabel>
            <p className="text-sm font-medium">{draft.deliveryDate ? fmtDate(draft.deliveryDate) : <span className="text-muted-foreground">Pick a date on the calendar</span>}</p>
          </Field>
          <Field>
            <FieldLabel htmlFor="window">Preferred time</FieldLabel>
            <Select value={draft.windowPref ?? ""} onValueChange={(v) => onChange({ windowPref: String(v) || undefined })}>
              <SelectTrigger id="window" className="w-full max-w-sm">
                <SelectValue>{(v: string) => slots.find((s) => s.value === v)?.label ?? slots[0].label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {slots.map((s) => (
                  <SelectItem key={s.value || "any"} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>A preference inside your receiving window. Dispatch sets the final arrival time when planning routes.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="notes">Notes for dispatch (optional)</FieldLabel>
            <Textarea
              id="notes"
              value={draft.notes}
              maxLength={500}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Anything the driver should know, for example access or a contact person."
              className="max-w-xl"
            />
            <FieldDescription>{draft.notes.length}/500</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
    </div>
  )
}
