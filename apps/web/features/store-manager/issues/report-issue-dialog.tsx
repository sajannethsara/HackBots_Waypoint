"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckCircle2, CircleAlert, ImagePlus, Info, X } from "lucide-react"
import { toast } from "sonner"
import { ISSUE_TYPE_META, STORE_ISSUE_TYPES, type StoreIssueType, type StoreReceivingDetail } from "@waypoint/shared"
import { QuantityInput } from "@/components/shared/quantity-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"
import { useReceivingDetail, useReportIssue } from "../queries"
import { uploadIssuePhoto } from "../lib/photo"

export interface IssueTarget {
  id: string
  ref: string
}

const TYPE_LABEL: Record<StoreIssueType, string> = {
  RECEIPT_MISSING: "Missing",
  RECEIPT_DAMAGED: "Damaged",
  RECEIPT_WRONG_ITEMS: "Wrong items",
  OTHER: "Other",
}
const WHOLE = "__order"

/** Report a problem with a delivery: what kind, which line and how many, a note and a photo. */
export function ReportIssueDialog({ order, onClose }: { order: IssueTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">{order && <ReportFlow key={order.id} order={order} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function ReportFlow({ order, onClose }: { order: IssueTarget; onClose: () => void }) {
  const { data: detail } = useReceivingDetail(order.id)
  const [type, setType] = useState<StoreIssueType>("RECEIPT_MISSING")
  const [lineId, setLineId] = useState(WHOLE)
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ id: string; ref: string } | null>(null)
  const report = useReportIssue(order.id)

  if (done)
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" /> Issue reported
          </DialogTitle>
          <DialogDescription>Dispatch has been told about {done.ref}. You can follow it and chat with them on its page.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button nativeButton={false} render={<Link href={`/store-manager/issues/${done.id}`} />}>
            View {done.ref}
          </Button>
        </DialogFooter>
      </>
    )

  const line = detail?.lines.find((l) => l.orderLineId === lineId)
  const countable = type !== "OTHER"
  const needsQty = countable && !!line
  const max = line ? Math.max(1, line.expectedQty) : 1
  const q = Math.min(qty, max)
  const tooShort = notes.trim().length < 3
  const meta = ISSUE_TYPE_META[type]

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      const photoId = photo ? await uploadIssuePhoto(photo) : undefined
      const saved = await report.mutateAsync({
        clientId: crypto.randomUUID(),
        type,
        orderLineId: line?.orderLineId,
        quantity: needsQty ? q : undefined,
        description: notes.trim(),
        photoId,
      })
      setDone(saved)
      toast.success(`Issue ${saved.ref} reported`)
    } catch (e) {
      const v = e instanceof ApiError ? e.body.violations?.[0]?.message : undefined
      setError(v ?? (e instanceof Error ? e.message : "Please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Report an issue with {order.ref}</DialogTitle>
        <DialogDescription>Tell dispatch what is wrong with this delivery. They will follow up with you.</DialogDescription>
      </DialogHeader>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Issue not reported</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel>What is the problem?</FieldLabel>
        <ToggleGroup variant="outline" value={[type]} onValueChange={(v) => v[0] && setType(v[0] as StoreIssueType)} className="flex-wrap" aria-label="Issue type">
          {STORE_ISSUE_TYPES.map((t) => (
            <ToggleGroupItem key={t} value={t}>
              {TYPE_LABEL[t]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>{meta.label}</FieldDescription>
      </Field>

      {countable && (
        <Field>
          <FieldLabel>Which item?</FieldLabel>
          {!detail ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select value={lineId} onValueChange={(v) => setLineId(String(v))}>
              <SelectTrigger className="w-full" aria-label="Which item">
                <SelectValue>{(v: string) => (v === WHOLE ? "The whole order" : (detail.lines.find((l) => l.orderLineId === v)?.description ?? "The whole order"))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE}>The whole order</SelectItem>
                {detail.lines.map((l) => (
                  <SelectItem key={l.orderLineId} value={l.orderLineId}>
                    {l.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {needsQty && line && (
        <>
          <Field orientation="horizontal">
            <FieldLabel>{type === "RECEIPT_MISSING" ? "How many are missing?" : "How many are affected?"}</FieldLabel>
            <QuantityInput value={q} min={1} max={max} onChange={setQty} label="Quantity" className="ml-auto" />
          </Field>
          <DifferenceAlert type={type} line={line} qty={q} />
        </>
      )}

      <Field>
        <FieldLabel htmlFor="issue-notes">What happened?</FieldLabel>
        <Textarea id="issue-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="For example: two bags were torn and leaking." />
      </Field>

      <Field>
        <FieldLabel>Photo (optional)</FieldLabel>
        {photo ? (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <ImagePlus className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{photo.name}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Remove photo" onClick={() => setPhoto(null)}>
              <X />
            </Button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground hover:bg-muted/50">
            <ImagePlus className="size-4" /> Add a photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </Field>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || tooShort}>
          {busy && <Spinner data-icon="inline-start" />} Submit issue
        </Button>
      </DialogFooter>
    </>
  )
}

function DifferenceAlert({ type, line, qty }: { type: StoreIssueType; line: StoreReceivingDetail["lines"][number]; qty: number }) {
  const driver = line.expectedQty
  const text =
    type === "RECEIPT_MISSING"
      ? `The driver recorded ${driver} delivered. With ${qty} missing, you actually received ${Math.max(0, driver - qty)}.`
      : `${qty} of the ${driver} delivered ${qty === 1 ? "is" : "are"} ${type === "RECEIPT_DAMAGED" ? "damaged" : "the wrong item"}.`
  return (
    <Alert>
      <Info />
      <AlertTitle>Quantity difference</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  )
}
