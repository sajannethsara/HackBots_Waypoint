"use client"

import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Boxes, ClipboardCheck, MapPinned, Workflow } from "lucide-react"
import type { Role } from "@waypoint/shared"
import { HOME } from "@/components/layout/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"

const DEMO = [
  { role: "Dispatcher", email: "dispatcher@waypoint.lk", icon: Workflow },
  { role: "Loader", email: "loader@waypoint.lk", icon: Boxes },
  { role: "Driver", email: "driver@waypoint.lk", icon: MapPinned },
  { role: "Store manager", email: "store@waypoint.lk", icon: ClipboardCheck },
]
const DEMO_PASSWORD = "Waypoint@2026"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: string, p: string) {
    setBusy(true)
    setError(null)
    try {
      const { user } = await api<{ user: { role: Role } }>("/auth/login", { method: "POST", json: { email: e, password: p } })
      const next = params.get("next")
      router.replace(next && next.startsWith(HOME[user.role]) ? next : HOME[user.role])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server")
      setBusy(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your Waypoint account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            signIn(email, password)
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Spinner />} Sign in
            </Button>
          </FieldGroup>
        </form>

        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">Demo accounts · password {DEMO_PASSWORD}</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <Button key={d.email} variant="outline" size="sm" className="justify-start" disabled={busy} onClick={() => signIn(d.email, DEMO_PASSWORD)}>
                <d.icon data-icon="inline-start" className="text-primary" />
                {d.role}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <Image src="/logo.png" alt="Waypoint" width={140} height={36} priority className="h-9 w-auto dark:brightness-150" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
