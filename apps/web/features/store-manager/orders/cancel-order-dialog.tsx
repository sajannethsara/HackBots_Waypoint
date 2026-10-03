"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckCircle2, CircleAlert } from "lucide-react"
import { toast } from "sonner"
import { STORE_CANCEL_REASON_LABEL, STORE_CANCEL_REASONS, type StoreCancelReason, type StoreOrderSaved } from "@waypoint/shared"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { fmtDateTime, fmtNum } from "@/lib/format"
import { useCancelOrder } from "../queries"

export interface CancelTarget {
  id: string
  ref: string
}

/**
 * Cancel a submitted order. Three states in one dialog: confirm (reason + note), an error Alert when the server
 * refuses (for example dispatch planned it a moment ago), and the cancellation receipt once it has gone through.
 */
export function CancelOrderDialog({ order, onClose }: { order: CancelTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{order && <CancelFlow key={order.id} order={order} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function CancelFlow({ order, onClose }: { order: CancelTarget; onClose: () => void }) {
  const [reason, setReason] = useState<StoreCancelReason>("ORDERED_BY_MISTAKE")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<{ saved: StoreOrderSaved; reason: StoreCancelReason; note: string; at: string } | null>(null)
  const cancel = useCancelOrder(order.id)

  if (receipt)
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" /> Order cancelled
          </DialogTitle>
          <DialogDescription>Dispatch will not plan this order. It is kept under Cancelled for reference.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <Item label="Order" value={receipt.saved.ref} />
          <Item label="Cancelled" value={fmtDateTime(receipt.at)} />
          <Item label="Items" value={`${receipt.saved.items} · ${receipt.saved.units} units · ${fmtNum(receipt.saved.weightKg)} kg`} />
          <Item label="Reason" value={STORE_CANCEL_REASON_LABEL[receipt.reason]} />
          {receipt.note && <Item className="col-span-2" label="Note" value={receipt.note} />}
        </dl>
        <DialogFooter>
          <Button variant="outline" nativeButton={false} render={<Link href="/store-manager/orders?tab=cancelled" />} onClick={onClose}>
            View cancelled orders
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    )

  const submit = () => {
    setError(null)
    cancel.mutate(
      { reason, note: note.trim() || undefined },
      {
        onSuccess: (saved) => {
          setReceipt({ saved, reason, note: note.trim(), at: new Date().toISOString() })
          toast.success(`Order ${saved.ref} cancelled`)
        },
        onError: (e) => setError(e instanceof ApiError || e instanceof Error ? e.message : "Please try again."),
      },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cancel order {order.ref}?</DialogTitle>
        <DialogDescription>Dispatch has not planned this order yet, so it can still be cancelled. This cannot be undone.</DialogDescription>
      </DialogHeader>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Order not cancelled</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel>Why are you cancelling?</FieldLabel>
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as StoreCancelReason)} className="gap-2">
          {STORE_CANCEL_REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value={r} />
              {STORE_CANCEL_REASON_LABEL[r]}
            </label>
          ))}
        </RadioGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="cancel-note">Note (optional)</FieldLabel>
        <Textarea id="cancel-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Anything dispatch should know." />
      </Field>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={cancel.isPending}>
          Keep order
        </Button>
        <Button variant="destructive" onClick={submit} disabled={cancel.isPending}>
          {cancel.isPending && <Spinner data-icon="inline-start" />} Cancel order
        </Button>
      </DialogFooter>
    </>
  )
}

function Item({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
