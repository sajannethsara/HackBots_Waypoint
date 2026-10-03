"use client"

import { LogOut, Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { ROLE_LABEL } from "@waypoint/shared"
import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useLogout, useMe } from "@/hooks/use-session"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useQueueTabPref, type QueueTab } from "./prefs"

const THEMES: { id: "light" | "dark" | "system"; label: string; icon: LucideIcon }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
]

const QUEUE_TAB_LABEL: Record<QueueTab, string> = {
  all: "All vehicles",
  mine: "My vehicles",
  unclaimed: "Unclaimed",
  locked: "Locked",
  flagged: "Flagged",
}

/** The theme is only known in the browser; render the picker after hydration so it never flickers. */
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

/** Loader settings: who you are, how the app looks, and where the queue opens. */
export function LoaderSettingsPage() {
  const { data: me, isLoading } = useMe()
  const logout = useLogout()
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const [queueTab, setQueueTab] = useQueueTabPref()

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <PageHeader title="Settings" description="Your account and how the loader workspace behaves on this device." />

      <Section title="Account" hint="Managed by dispatch. Ask the dispatch desk to change your details or depot.">
        {isLoading || !me ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="size-12 rounded-xl">
              <AvatarFallback className="rounded-xl bg-primary/10 text-primary">{initials(me.name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-48 flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Fact label="Name" value={me.name} />
              <Fact label="Role" value={ROLE_LABEL[me.role]} />
              <Fact label="Email" value={me.email} />
              <Fact label="Depot" value={me.depot?.name ?? "Not assigned"} />
            </div>
          </div>
        )}
      </Section>

      <Section title="Appearance" hint="Dark mode helps on a dim loading bay.">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => {
            const on = mounted && theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm font-medium transition-colors hover:bg-muted/50 pointer-coarse:p-4",
                  on && "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                )}
              >
                <t.icon className="size-5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Loading queue" hint="Saved on this device only.">
        <p className="mb-2 text-sm">Open the queue on</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Default queue tab">
          {(Object.keys(QUEUE_TAB_LABEL) as QueueTab[]).map((t) => {
            const on = mounted && queueTab === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setQueueTab(t)}
                className={cn(
                  "h-8 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted/50 pointer-coarse:h-11",
                  on && "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                )}
              >
                {QUEUE_TAB_LABEL[t]}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Session">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Signed in as {me?.email ?? "…"}. Sign out on shared devices at the end of your shift.</p>
          <Button variant="destructive" onClick={logout}>
            <LogOut /> Sign out
          </Button>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
