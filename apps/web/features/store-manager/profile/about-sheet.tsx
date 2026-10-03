"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { updateAboutSchema, type StoreProfile } from "@waypoint/shared"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { useSaveAbout } from "../queries"
import { apiFieldErrors, ErrorText, fieldErrors, fromTimeValue, toTimeValue } from "./form-bits"

type Dept = { name: string; areaM2: string }

/** Edit the about details and the department footprint together: the departments must fit inside the floor area. */
export function AboutSheet({ profile, open, onClose }: { profile: StoreProfile; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-lg">{open && <AboutForm key="about" profile={profile} onClose={onClose} />}</SheetContent>
    </Sheet>
  )
}

function AboutForm({ profile, onClose }: { profile: StoreProfile; onClose: () => void }) {
  const a = profile.about
  const [address, setAddress] = useState(a.address ?? "")
  const [phone, setPhone] = useState(a.phone ?? "")
  const [email, setEmail] = useState(a.email ?? "")
  const [open, setOpen] = useState(toTimeValue(a.tradingOpenMin ?? 540))
  const [close, setClose] = useState(toTimeValue(a.tradingCloseMin ?? 1260))
  const [floor, setFloor] = useState(String(a.floorAreaM2 ?? ""))
  const [depts, setDepts] = useState<Dept[]>(profile.departments.map((d) => ({ name: d.name, areaM2: String(d.areaM2) })))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useSaveAbout()

  const used = depts.reduce((s, d) => s + (Number(d.areaM2) || 0), 0)
  const setDept = (i: number, p: Partial<Dept>) => setDepts((ds) => ds.map((d, k) => (k === i ? { ...d, ...p } : d)))

  function submit() {
    const parsed = updateAboutSchema.safeParse({
      address,
      phone,
      email,
      tradingOpenMin: fromTimeValue(open),
      tradingCloseMin: fromTimeValue(close),
      floorAreaM2: Number(floor),
      departments: depts.map((d) => ({ name: d.name, areaM2: Number(d.areaM2) || 0 })),
    })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success("Outlet details saved")
        onClose()
      },
      onError: (e) => setErrors(e instanceof ApiError ? apiFieldErrors(e.body.issues) : { form: "Could not save. Please try again." }),
    })
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit outlet details</SheetTitle>
        <SheetDescription>Address, contact, opening hours and how your floor is divided between departments.</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="address">Address</FieldLabel>
            <Input id="address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
            <ErrorText>{errors.address}</ErrorText>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input id="phone" type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
              <ErrorText>{errors.phone}</ErrorText>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} />
              <ErrorText>{errors.email}</ErrorText>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="open">Opens</FieldLabel>
              <Input id="open" type="time" value={open} onChange={(e) => setOpen(e.target.value)} />
              <ErrorText>{errors.tradingOpenMin}</ErrorText>
            </Field>
            <Field>
              <FieldLabel htmlFor="close">Closes</FieldLabel>
              <Input id="close" type="time" value={close} onChange={(e) => setClose(e.target.value)} />
              <ErrorText>{errors.tradingCloseMin}</ErrorText>
            </Field>
            <Field>
              <FieldLabel htmlFor="floor">Floor area (m²)</FieldLabel>
              <Input id="floor" inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value.replace(/\D/g, ""))} />
              <ErrorText>{errors.floorAreaM2}</ErrorText>
            </Field>
          </div>

          <div className="grid gap-2">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-medium">Departments</p>
                <FieldDescription>
                  {used} of {Number(floor) || 0} m² used
                </FieldDescription>
              </div>
              <Button type="button" size="xs" variant="outline" disabled={depts.length >= 12} onClick={() => setDepts((d) => [...d, { name: "", areaM2: "" }])}>
                <Plus data-icon="inline-start" /> Add
              </Button>
            </div>
            {depts.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label={`Department ${i + 1} name`} placeholder="Name" value={d.name} maxLength={40} onChange={(e) => setDept(i, { name: e.target.value })} />
                <Input aria-label={`Department ${i + 1} area in square metres`} className="w-24" inputMode="numeric" placeholder="m²" value={d.areaM2} onChange={(e) => setDept(i, { areaM2: e.target.value.replace(/\D/g, "") })} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove department ${i + 1}`} onClick={() => setDepts((ds) => ds.filter((_, k) => k !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <ErrorText>{errors.departments}</ErrorText>
            {Object.entries(errors)
              .filter(([k]) => k.startsWith("departments."))
              .slice(0, 1)
              .map(([k, m]) => (
                <ErrorText key={k}>{m}</ErrorText>
              ))}
          </div>
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
