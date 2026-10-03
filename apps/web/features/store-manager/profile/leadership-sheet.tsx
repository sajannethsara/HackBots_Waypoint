"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { updateLeadershipSchema, type StoreProfile } from "@waypoint/shared"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { useSaveLeadership } from "../queries"
import { apiFieldErrors, ErrorText, fieldErrors } from "./form-bits"

type Row = { role: string; name: string; phone: string; email: string }

export function LeadershipSheet({ profile, open, onClose }: { profile: StoreProfile; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-lg">{open && <LeadershipForm profile={profile} onClose={onClose} />}</SheetContent>
    </Sheet>
  )
}

function LeadershipForm({ profile, onClose }: { profile: StoreProfile; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>(profile.leadership.map((l) => ({ role: l.role, name: l.name, phone: l.phone ?? "", email: l.email ?? "" })))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useSaveLeadership()
  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)))

  function submit() {
    const parsed = updateLeadershipSchema.safeParse({ leadership: rows })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success("Leadership saved")
        onClose()
      },
      onError: (e) => setErrors(e instanceof ApiError ? apiFieldErrors(e.body.issues) : { form: "Could not save. Please try again." }),
    })
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit leadership</SheetTitle>
        <SheetDescription>The people dispatch and drivers can contact at your outlet.</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid gap-3">
          {rows.map((r, i) => (
            <Card key={i} size="sm" className="gap-3 px-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`role-${i}`}>Role</FieldLabel>
                  <Input id={`role-${i}`} value={r.role} maxLength={40} onChange={(e) => set(i, { role: e.target.value })} />
                  <ErrorText>{errors[`leadership.${i}.role`]}</ErrorText>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`name-${i}`}>Name</FieldLabel>
                  <Input id={`name-${i}`} value={r.name} maxLength={60} onChange={(e) => set(i, { name: e.target.value })} />
                  <ErrorText>{errors[`leadership.${i}.name`]}</ErrorText>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`phone-${i}`}>Phone</FieldLabel>
                  <Input id={`phone-${i}`} type="tel" value={r.phone} maxLength={30} onChange={(e) => set(i, { phone: e.target.value })} />
                  <ErrorText>{errors[`leadership.${i}.phone`]}</ErrorText>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`email-${i}`}>Email</FieldLabel>
                  <Input id={`email-${i}`} type="email" value={r.email} maxLength={120} onChange={(e) => set(i, { email: e.target.value })} />
                  <ErrorText>{errors[`leadership.${i}.email`]}</ErrorText>
                </Field>
              </div>
              <Button type="button" variant="ghost" size="xs" className="w-fit text-muted-foreground" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                <Trash2 data-icon="inline-start" /> Remove
              </Button>
            </Card>
          ))}
          <Button type="button" variant="outline" disabled={rows.length >= 8} onClick={() => setRows((rs) => [...rs, { role: "", name: "", phone: "", email: "" }])}>
            <Plus data-icon="inline-start" /> Add a person
          </Button>
          <ErrorText>{errors.leadership}</ErrorText>
          {errors.form && (
            <Alert variant="destructive">
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          )}
        </div>
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
