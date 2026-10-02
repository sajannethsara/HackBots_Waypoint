"use client"

import { ArrowLeft, Check, CircleAlert, CircleCheck, CircleX, Minus, PackageCheck, PackageMinus, PackageX, Plus, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import type { DriverStop } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useDriver, type Outcome } from "../lib/driver-provider"
import { stopTiming } from "../lib/model"
import { ChilledChip, clock, fmt, NavigateButton, StopStatusChip } from "../ui"
import { PhotoField } from "./photo-field"
import { SignaturePad } from "./signature-pad"

type Step = "details" | "outcome" | "partial" | "refuse" | "proof"

const PARTIAL_REASONS = ["Items damaged", "Items missing from load", "Store refused some items", "Wrong items"]
const REFUSE_REASONS = ["Outlet closed", "Store refused delivery", "No access / parking", "Goods damaged", "Temperature problem", "Other"]

export function StopFlow({ stopId, onClose, onReport }: { stopId: string; onClose: () => void; onReport: () => void }) {
  const { bundle, trip, running, arrive, finishStop, gps, nowMin } = useDriver()
  const stop = useMemo(() => bundle.trips.flatMap((t) => t.stops).find((s) => s.id === stopId), [bundle, stopId])
  const [step, setStep] = useState<Step>("details")
  const [outcome, setOutcome] = useState<Outcome>("DELIVERED")
  const [qty, setQty] = useState<Record<string, number>>({})
  const [reason, setReason] = useState("")
  const [reasonText, setReasonText] = useState("")
  const [recipient, setRecipient] = useState("")
  const [notes, setNotes] = useState("")
  const [signature, setSignature] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)

  if (!stop) return null
  const done = stop.status === "DELIVERED" || stop.status === "PARTIAL" || stop.status === "REFUSED" || stop.status === "SKIPPED"
  const index = (trip?.stops ?? []).findIndex((s) => s.id === stop.id)
  const deliveredOf = (l: DriverStop["lines"][number]) => Math.max(0, Math.min(l.quantity, qty[l.id] ?? l.quantity))
  const short = stop.lines.some((l) => deliveredOf(l) < l.quantity)
  const why = [reason, reasonText.trim()].filter(Boolean).join(": ")

  const back = () => {
    if (step === "details" || (step === "outcome" && !done)) return onClose()
    if (step === "proof") return setStep(outcome === "PARTIAL" ? "partial" : "outcome")
    setStep(step === "partial" || step === "refuse" ? "outcome" : "details")
  }

  const submit = () => {
    const lines = stop.lines.map((l) => {
      const delivered = outcome === "REFUSED" ? 0 : deliveredOf(l)
      return { orderLineId: l.id, deliveredQty: delivered, refusedQty: l.quantity - delivered, reason: delivered < l.quantity ? why || undefined : undefined }
    })
    finishStop({ stop, outcome, lines, recipientName: recipient, notes, reason: why || undefined, signature, photo })
    toast.success(outcome === "REFUSED" ? "Recorded as not delivered" : "Delivery recorded", { description: "Saved on this phone. It syncs automatically." })
    onClose()
  }

  const needsReason = outcome === "REFUSED" ? !reason : short && !reason
  const proofOk = recipient.trim().length > 0 && !!signature

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 pt-[env(safe-area-inset-top)]">
        <Button variant="ghost" size="icon-lg" onClick={back} aria-label="Back">
          {step === "details" ? <X /> : <ArrowLeft />}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{stop.outlet.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {index >= 0 ? `Stop ${index + 1} of ${trip?.stops.length} · ` : ""}
            {stop.outlet.district}
          </p>
        </div>
        <StopStatusChip status={stop.status} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {step === "details" && (
          <div className="grid gap-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Info label="Receiving window" value={`${fmt(stop.windowOpenMin)}–${fmt(stop.windowCloseMin)}`} />
              <Info label={done ? "Completed" : "Planned arrival"} value={done && stop.completedAt ? clock(stop.completedAt) : fmt(stopTiming(stop, nowMin, gps.position).etaMin)} />
            </div>
            {stop.outlet.access && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {stop.outlet.access}
              </p>
            )}
            {stop.note && <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm">Store note: {stop.note}</p>}

            <section className="grid gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Hand over · {stop.units} items</h2>
                {stop.chilled && <ChilledChip />}
              </div>
              <ul className="divide-y rounded-xl border bg-card">
                {stop.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.description}</p>
                      <p className="text-xs text-muted-foreground capitalize">{l.category.toLowerCase()}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">× {l.quantity}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Order {stop.orderRef}</p>
            </section>
          </div>
        )}

        {step === "outcome" && (
          <div className="grid gap-3 p-4">
            <h2 className="text-base font-semibold">How did it go?</h2>
            <Choice
              icon={PackageCheck}
              tone="green"
              title="Delivered in full"
              hint={`All ${stop.units} items handed over`}
              onClick={() => {
                setOutcome("DELIVERED")
                setStep("proof")
              }}
            />
            <Choice
              icon={PackageMinus}
              tone="amber"
              title="Partly delivered"
              hint="Some items short, damaged or refused"
              onClick={() => {
                setOutcome("PARTIAL")
                setStep("partial")
              }}
            />
            <Choice
              icon={PackageX}
              tone="red"
              title="Could not deliver"
              hint="Closed, refused or no access"
              onClick={() => {
                setOutcome("REFUSED")
                setStep("refuse")
              }}
            />
          </div>
        )}

        {step === "partial" && (
          <div className="grid gap-4 p-4">
            <div>
              <h2 className="text-base font-semibold">What was handed over?</h2>
              <p className="text-sm text-muted-foreground">Set the quantity the store accepted for each item.</p>
            </div>
            <ul className="divide-y rounded-xl border bg-card">
              {stop.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.description}</p>
                    <p className="text-xs text-muted-foreground">Ordered {l.quantity}</p>
                  </div>
                  <Stepper value={deliveredOf(l)} max={l.quantity} onChange={(v) => setQty((q) => ({ ...q, [l.id]: v }))} />
                </li>
              ))}
            </ul>
            <ReasonPicker title="Why is it short?" options={PARTIAL_REASONS} value={reason} onChange={setReason} text={reasonText} onText={setReasonText} />
          </div>
        )}

        {step === "refuse" && (
          <div className="grid gap-4 p-4">
            <h2 className="text-base font-semibold">Why could it not be delivered?</h2>
            <ReasonPicker options={REFUSE_REASONS} value={reason} onChange={setReason} text={reasonText} onText={setReasonText} />
            <section className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="refuser">
                Who told you? <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input id="refuser" className="h-11" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Name at the outlet" />
              <PhotoField value={photo} onChange={setPhoto} label="Photo of the outlet" />
            </section>
          </div>
        )}

        {step === "proof" && (
          <div className="grid gap-4 p-4">
            <div>
              <h2 className="text-base font-semibold">Proof of delivery</h2>
              <p className="text-sm text-muted-foreground">Ask the person receiving to sign.</p>
            </div>
            <section className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="recipient">
                Received by
              </label>
              <Input id="recipient" className="h-11" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Full name" autoComplete="off" />
            </section>
            <section className="grid gap-1.5">
              <span className="text-sm font-medium">Signature</span>
              <SignaturePad onChange={setSignature} />
            </section>
            <section className="grid gap-1.5">
              <span className="text-sm font-medium">
                Photo <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <PhotoField value={photo} onChange={setPhoto} label="Photo of goods at the door" />
            </section>
            <section className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything dispatch or the store should know" />
            </section>
          </div>
        )}
      </div>

      <footer className="grid shrink-0 gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {step === "details" && !done && stop.status === "PENDING" && (
          <div className="grid grid-cols-2 gap-2">
            <NavigateButton stop={stop} />
            <Button
              className="h-12 text-[15px]"
              disabled={!running}
              onClick={() => {
                arrive(stop)
                setStep("outcome")
              }}
            >
              I&apos;ve arrived
            </Button>
          </div>
        )}
        {step === "details" && !done && stop.status === "ARRIVED" && (
          <Button className="h-12 text-[15px]" onClick={() => setStep("outcome")}>
            <PackageCheck data-icon="inline-start" /> Record delivery
          </Button>
        )}
        {step === "details" && !done && !running && <p className="text-center text-xs text-muted-foreground">Start the trip to record stops.</p>}
        {step === "details" && done && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            {stop.status === "REFUSED" ? <CircleX className="size-4 text-red-500" /> : <CircleCheck className="size-4 text-emerald-600" />} Recorded. Nothing more to do here.
          </p>
        )}
        {step === "details" && !done && (
          <Button variant="ghost" className="h-10" onClick={onReport}>
            Report a problem at this stop
          </Button>
        )}

        {step === "partial" && (
          <Button className="h-12 text-[15px]" disabled={!short || needsReason} onClick={() => setStep("proof")}>
            Continue
          </Button>
        )}
        {step === "refuse" && (
          <Button variant="destructive" className="h-12 text-[15px]" disabled={needsReason} onClick={submit}>
            Confirm not delivered
          </Button>
        )}
        {step === "proof" && (
          <Button className={cn("h-12 text-[15px]")} disabled={!proofOk} onClick={submit}>
            <Check data-icon="inline-start" /> Save delivery
          </Button>
        )}
      </footer>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Choice({ icon: Icon, tone, title, hint, onClick }: { icon: typeof Check; tone: "green" | "amber" | "red"; title: string; hint: string; onClick: () => void }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  }
  return (
    <button type="button" onClick={onClick} className="flex min-h-20 items-center gap-3.5 rounded-2xl border bg-card p-3.5 text-left transition-colors active:bg-muted">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-5" />
      </span>
      <span className="grid gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="icon-lg" className="size-10" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="Less">
        <Minus />
      </Button>
      <span className="w-8 text-center text-base font-semibold tabular-nums">{value}</span>
      <Button type="button" variant="outline" size="icon-lg" className="size-10" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More">
        <Plus />
      </Button>
    </div>
  )
}

function ReasonPicker({
  title,
  options,
  value,
  onChange,
  text,
  onText,
}: {
  title?: string
  options: string[]
  value: string
  onChange: (v: string) => void
  text: string
  onText: (v: string) => void
}) {
  return (
    <section className="grid gap-2">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(value === o ? "" : o)}
            className={cn("h-10 rounded-full border px-3.5 text-sm transition-colors", value === o ? "border-primary bg-primary/10 font-medium text-primary" : "bg-card active:bg-muted")}
          >
            {o}
          </button>
        ))}
      </div>
      <Textarea rows={2} value={text} onChange={(e) => onText(e.target.value)} placeholder="Add detail (optional)" />
    </section>
  )
}
