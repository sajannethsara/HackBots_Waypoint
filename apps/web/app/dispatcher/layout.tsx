import { DispatcherShell } from "@/features/dispatcher/dispatcher-shell"

// The realtime URL is a runtime setting (PUBLIC_WS_URL), so this layout must not be prerendered.
export const dynamic = "force-dynamic"

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return <DispatcherShell wsUrl={process.env.PUBLIC_WS_URL || undefined}>{children}</DispatcherShell>
}
