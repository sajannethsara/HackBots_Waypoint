import { LivePage } from "@/features/dispatcher/live/live-page"

// Runtime config (read per request, so Docker can set them without a rebuild).
export const dynamic = "force-dynamic"

export default function Page() {
  return <LivePage mapboxToken={process.env.MAPBOX_ACCESS_TOKEN || undefined} wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
