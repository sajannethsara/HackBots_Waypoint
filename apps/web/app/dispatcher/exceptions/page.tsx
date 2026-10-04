import { Suspense } from "react"
import { ExceptionsPage } from "@/features/dispatcher/exceptions/exceptions-page"

export default function Page() {
  return (
    <Suspense>
      <ExceptionsPage />
    </Suspense>
  )
}
