import { Suspense } from "react"
import { StoreOrdersPage } from "@/features/store/orders/store-orders-page"

export default function Page() {
  return (
    <Suspense>
      <StoreOrdersPage />
    </Suspense>
  )
}
