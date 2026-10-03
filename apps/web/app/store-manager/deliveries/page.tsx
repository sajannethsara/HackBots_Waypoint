import { Suspense } from "react"
import { StoreDeliveriesPage } from "@/features/store-manager/deliveries/store-deliveries-page"

// The Mapbox token is a runtime setting (MAPBOX_ACCESS_TOKEN), so this page must not be prerendered.
export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <Suspense>
      <StoreDeliveriesPage mapboxToken={process.env.MAPBOX_ACCESS_TOKEN || undefined} />
    </Suspense>
  )
}
