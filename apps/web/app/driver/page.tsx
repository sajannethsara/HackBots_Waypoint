import { DriverApp } from "@/features/driver/driver-app"

// Runtime config (read per request, so Docker can set them without a rebuild).
export const dynamic = "force-dynamic"

export default function Page() {
  return <DriverApp mapboxToken={process.env.MAPBOX_ACCESS_TOKEN || undefined} wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
