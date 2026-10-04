"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, CircleAlert, ImagePlus, Info, X } from "lucide-react"
import { toast } from "sonner"
import { ISSUE_TYPE_META, MAX_ISSUE_PHOTOS, STORE_ISSUE_TYPES, type StoreIssueType, type StoreReceivingDetail } from "@waypoint/shared"
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
  const [photos, setPhotos] = useState<File[]>([])
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
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
      const photoIds = photos.length ? await Promise.all(photos.map(uploadIssuePhoto)) : undefined
      const saved = await report.mutateAsync({
        clientId: crypto.randomUUID(),
        type,
        orderLineId: line?.orderLineId,
        quantity: needsQty ? q : undefined,
        description: notes.trim(),
        photoIds,
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
        <FieldLabel>
          Photos (optional, up to {MAX_ISSUE_PHOTOS})
        </FieldLabel>
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative aspect-square overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              <Button variant="secondary" size="icon-xs" className="absolute right-1 top-1" aria-label={`Remove photo ${i + 1}`} disabled={busy} onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))}>
                <X />
              </Button>
            </div>
          ))}
          {photos.length < MAX_ISSUE_PHOTOS && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/50">
              <ImagePlus className="size-4" /> Add
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  setPhotos((p) => [...p, ...picked].slice(0, MAX_ISSUE_PHOTOS))
                  e.target.value = ""
                }}
              />
            </label>
          )}
        </div>
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
