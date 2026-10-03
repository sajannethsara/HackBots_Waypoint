"use client"

import { useEffect, useState } from "react"
import { Bell, KeyRound, UserRound } from "lucide-react"
import { toast } from "sonner"
import { changePasswordSchema, NOTIFICATION_GROUPS, NOTIFICATION_GROUP_META, type NotificationGroup, type NotificationPrefs } from "@waypoint/shared"
import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import { useChangePassword, useSavePrefs, useStoreSettings } from "../queries"
import { apiFieldErrors, ErrorText, fieldErrors } from "../profile/form-bits"

export function StoreSettingsPage() {
  const { data, isLoading } = useStoreSettings()
  return (
    <div className="grid gap-4">
      <PageHeader title="Settings" description="Choose what you hear about, and keep your account secure." />
      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <div className="grid gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound className="size-4" /> Account
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-muted-foreground">Name</p>
                  <p className="font-medium">{data.account.name}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Sign-in email</p>
                  <p className="font-medium">{data.account.email}</p>
                </div>
              </CardContent>
            </Card>
            <Notifications initial={data.notifications} />
          </div>
          <PasswordCard />
        </div>
      )}
    </div>
  )
}

/** Each switch saves as soon as it is flipped, so there is no Save button to forget. */
function Notifications({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial)
  const save = useSavePrefs()
  useEffect(() => setPrefs(initial), [initial])

  function toggle(group: NotificationGroup, on: boolean) {
    const previous = prefs
    const next = { ...prefs, [group]: on }
    setPrefs(next)
    save.mutate(next, {
      onSuccess: () => toast.success(`${NOTIFICATION_GROUP_META[group].label} notifications ${on ? "on" : "off"}`),
      onError: () => {
        setPrefs(previous)
        toast.error("Could not save that change")
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" /> Notifications
        </CardTitle>
        <CardDescription>Choose what appears in your bell. Switched-off kinds are hidden, not deleted.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-4">
          {NOTIFICATION_GROUPS.map((g) => (
            <li key={g}>
              <Field orientation="horizontal">
                <div className="grid gap-0.5">
                  <FieldLabel htmlFor={`pref-${g}`}>{NOTIFICATION_GROUP_META[g].label}</FieldLabel>
                  <FieldDescription>{NOTIFICATION_GROUP_META[g].description}</FieldDescription>
                </div>
                <Switch id={`pref-${g}`} checked={prefs[g]} onCheckedChange={(on) => toggle(g, on)} className="ml-auto" />
              </Field>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const change = useChangePassword()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next })
    const found = parsed.success ? {} : fieldErrors(parsed.error)
    if (confirm !== next) found.confirm = "The two passwords do not match"
    if (Object.keys(found).length) return setErrors(found)
    setErrors({})
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent("")
          setNext("")
          setConfirm("")
          toast.success("Password changed")
        },
        onError: (err) => setErrors(err instanceof ApiError ? { ...apiFieldErrors(err.body.issues), form: err.body.issues?.length ? "" : err.message } : { form: "Could not change the password. Please try again." }),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Password
        </CardTitle>
        <CardDescription>Use at least 8 characters. You stay signed in on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pw-current">Current password</FieldLabel>
              <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              <ErrorText>{errors.currentPassword}</ErrorText>
            </Field>
            <Field>
              <FieldLabel htmlFor="pw-new">New password</FieldLabel>
              <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              <ErrorText>{errors.newPassword}</ErrorText>
            </Field>
            <Field>
              <FieldLabel htmlFor="pw-confirm">Confirm new password</FieldLabel>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <ErrorText>{errors.confirm}</ErrorText>
            </Field>
            {errors.form && (
              <Alert variant="destructive">
                <AlertDescription>{errors.form}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-fit" disabled={change.isPending || !current || !next || !confirm}>
              {change.isPending && <Spinner data-icon="inline-start" />} Change password
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
