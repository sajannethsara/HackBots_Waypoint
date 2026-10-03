import { Suspense } from "react"
import { StoreDeliveriesPage } from "@/features/store-manager/deliveries/store-deliveries-page"

export default function Page() {
  return (
    <Suspense>
      <StoreDeliveriesPage />
    </Suspense>
  )
}
