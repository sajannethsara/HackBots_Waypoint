import { LivePage } from "@/features/dispatcher/live/live-page"

// Runtime config (read per request, so Docker can set them without a rebuild).
export const dynamic = "force-dynamic"

export default function Page() {
  return <LivePage mapsApiKey={process.env.GOOGLE_MAPS_API_KEY || undefined} wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
