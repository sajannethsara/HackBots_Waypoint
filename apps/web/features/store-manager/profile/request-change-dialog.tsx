"use client"

import { useState } from "react"
import { CheckCircle2, Info } from "lucide-react"
import { toast } from "sonner"
import { changeRequestSchema, DOCK_LABEL, DOCK_TYPES, PARKING, PARKING_LABEL, type StoreChangeKind, type StoreProfile } from "@waypoint/shared"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"
import { useRequestChange } from "../queries"
import { ErrorText, fromTimeValue, toTimeValue } from "./form-bits"

/**
 * Ask dispatch to change something the planner depends on. It is a request, not an edit: dispatch decides, and an
 * approved change applies from the next plan.
 */
export function RequestChangeDialog({ profile, open, onClose, initialKind = "WINDOW" }: { profile: StoreProfile; open: boolean; onClose: () => void; initialKind?: StoreChangeKind }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">{open && <RequestForm profile={profile} onClose={onClose} initialKind={initialKind} />}</DialogContent>
    </Dialog>
  )
}

function RequestForm({ profile, onClose, initialKind }: { profile: StoreProfile; onClose: () => void; initialKind: StoreChangeKind }) {
  const o = profile.outlet
  const [kind, setKind] = useState<StoreChangeKind>(initialKind)
  const [open, setOpen] = useState(toTimeValue(o.windowOpenMin))
  const [close, setClose] = useState(toTimeValue(o.windowCloseMin))
  const [dock, setDock] = useState(o.dockType)
  const [parking, setParking] = useState(o.parkingConstraint)
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)
  const request = useRequestChange()

  if (sent)
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" /> Request sent
          </DialogTitle>
          <DialogDescription>Dispatch has been notified. Your current setup stays in place until they approve it, and you will be told either way.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    )

  function submit() {
    const parsed = changeRequestSchema.safeParse(
      kind === "WINDOW" ? { kind, windowOpenMin: fromTimeValue(open), windowCloseMin: fromTimeValue(close), reason } : { kind, dockType: dock, parkingConstraint: parking, reason },
    )
    if (!parsed.success) {
      const e: Record<string, string> = {}
      for (const i of parsed.error.issues) e[String(i.path[0] ?? "form")] ??= i.message
      return setErrors(e)
    }
    setErrors({})
    request.mutate(parsed.data, {
      onSuccess: () => {
        setSent(true)
        toast.success("Request sent to dispatch")
      },
      onError: (e) => setErrors({ form: e instanceof ApiError ? (e.body.issues?.[0]?.message ?? e.message) : "Could not send. Please try again." }),
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Request a change</DialogTitle>
        <DialogDescription>These settings decide how your deliveries are planned, so dispatch has to approve a change.</DialogDescription>
      </DialogHeader>

      <ToggleGroup variant="outline" value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as StoreChangeKind)} aria-label="What to change">
        <ToggleGroupItem value="WINDOW">Receiving window</ToggleGroupItem>
        <ToggleGroupItem value="ACCESS">Dock and parking</ToggleGroupItem>
      </ToggleGroup>

      {kind === "WINDOW" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="win-open">Receive from</FieldLabel>
            <Input id="win-open" type="time" value={open} onChange={(e) => setOpen(e.target.value)} />
            <ErrorText>{errors.windowOpenMin}</ErrorText>
          </Field>
          <Field>
            <FieldLabel htmlFor="win-close">Receive until</FieldLabel>
            <Input id="win-close" type="time" value={close} onChange={(e) => setClose(e.target.value)} />
            <ErrorText>{errors.windowCloseMin}</ErrorText>
          </Field>
        </div>
      ) : (
        <div className="grid gap-3">
          <Field>
            <FieldLabel>Where trucks unload</FieldLabel>
            <Select value={dock} onValueChange={(v) => setDock(String(v))}>
              <SelectTrigger className="w-full" aria-label="Dock type">
                <SelectValue>{(v: string) => DOCK_LABEL[v as keyof typeof DOCK_LABEL] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DOCK_TYPES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DOCK_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ErrorText>{errors.dockType}</ErrorText>
          </Field>
          <Field>
            <FieldLabel>Vehicle access</FieldLabel>
            <Select value={parking} onValueChange={(v) => setParking(String(v))}>
              <SelectTrigger className="w-full" aria-label="Parking constraint">
                <SelectValue>{(v: string) => PARKING_LABEL[v as keyof typeof PARKING_LABEL] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PARKING.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PARKING_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ErrorText>{errors.parkingConstraint}</ErrorText>
          </Field>
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="req-reason">Why do you need this?</FieldLabel>
        <Textarea id="req-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: our receiving staff now start at 05:30." />
        <ErrorText>{errors.reason}</ErrorText>
      </Field>

      {errors.form && (
        <Alert variant="destructive">
          <Info />
          <AlertTitle>Request not sent</AlertTitle>
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={request.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={request.isPending}>
          {request.isPending && <Spinner data-icon="inline-start" />} Send request
        </Button>
      </DialogFooter>
    </>
  )
}
