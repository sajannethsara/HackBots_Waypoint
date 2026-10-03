"use client"

import { useState } from "react"
import { toast } from "sonner"
import { updateReceivingSchema, type StoreProfile } from "@waypoint/shared"
import { QuantityInput } from "@/components/shared/quantity-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { useSaveReceiving } from "../queries"
import { apiFieldErrors, ErrorText, fieldErrors } from "./form-bits"

/** How deliveries are received at the door. The receiving window itself is dispatch's call, so it is not here. */
export function ReceivingSheet({ profile, open, onClose }: { profile: StoreProfile; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-md">{open && <ReceivingForm profile={profile} onClose={onClose} />}</SheetContent>
    </Sheet>
  )
}

function ReceivingForm({ profile, onClose }: { profile: StoreProfile; onClose: () => void }) {
  const r = profile.receiving
  const [name, setName] = useState(r.contactName ?? "")
  const [phone, setPhone] = useState(r.contactPhone ?? "")
  const [staff, setStaff] = useState(r.staff ?? 2)
  const [forklift, setForklift] = useState(r.hasForklift)
  const [coldRoom, setColdRoom] = useState(r.hasColdRoom)
  const [notes, setNotes] = useState(r.notes ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useSaveReceiving()

  function submit() {
    const parsed = updateReceivingSchema.safeParse({ contactName: name, contactPhone: phone, staff, hasForklift: forklift, hasColdRoom: coldRoom, notes })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success("Receiving details saved")
        onClose()
      },
      onError: (e) => setErrors(e instanceof ApiError ? apiFieldErrors(e.body.issues) : { form: "Could not save. Please try again." }),
    })
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit receiving details</SheetTitle>
        <SheetDescription>What drivers should know when they arrive. Dispatch sees this when planning.</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rc-name">Contact at the door</FieldLabel>
            <Input id="rc-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <ErrorText>{errors.contactName}</ErrorText>
          </Field>
          <Field>
            <FieldLabel htmlFor="rc-phone">Contact phone</FieldLabel>
            <Input id="rc-phone" type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
            <ErrorText>{errors.contactPhone}</ErrorText>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="rc-staff">People who receive deliveries</FieldLabel>
            <QuantityInput value={staff} min={0} max={50} label="Receiving staff" onChange={setStaff} className="ml-auto" />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="rc-forklift">Forklift or pallet jack on site</FieldLabel>
            <Switch id="rc-forklift" checked={forklift} onCheckedChange={setForklift} className="ml-auto" />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="rc-cold">Cold room for chilled goods</FieldLabel>
            <Switch id="rc-cold" checked={coldRoom} onCheckedChange={setColdRoom} className="ml-auto" />
          </Field>
          <Field>
            <FieldLabel htmlFor="rc-notes">Instructions for the driver</FieldLabel>
            <Textarea id="rc-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Where to park, which door, who to ask for." />
            <FieldDescription>{notes.length}/500</FieldDescription>
            <ErrorText>{errors.notes}</ErrorText>
          </Field>
          {errors.form && (
            <Alert variant="destructive">
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" />} Save changes
        </Button>
      </SheetFooter>
    </>
  )
}
