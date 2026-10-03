import { Suspense } from "react"
import { LoaderQueuePage } from "@/features/loader/queue-page"

export default function Page() {
  return (
    <Suspense>
      <LoaderQueuePage />
    </Suspense>
  )
}
