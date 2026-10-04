import { Suspense } from "react"
import { CreateOrderWizard } from "@/features/store-manager/create/create-order-wizard"

export default function Page() {
  return (
    <Suspense>
      <CreateOrderWizard />
    </Suspense>
  )
}
