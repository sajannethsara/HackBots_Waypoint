import { StoreShell } from "@/features/store-manager/store-shell"

// The realtime URL is a runtime setting (PUBLIC_WS_URL), so this layout must not be prerendered.
export const dynamic = "force-dynamic"

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <StoreShell wsUrl={process.env.PUBLIC_WS_URL || undefined}>{children}</StoreShell>
}
