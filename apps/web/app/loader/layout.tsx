import { LoaderShell } from "@/features/loader/loader-shell"

// The realtime URL is a runtime setting (PUBLIC_WS_URL), so this layout must not be prerendered.
export const dynamic = "force-dynamic"

export default function LoaderLayout({ children }: { children: React.ReactNode }) {
  return <LoaderShell wsUrl={process.env.PUBLIC_WS_URL || undefined}>{children}</LoaderShell>
}
