import { Suspense } from "react"
import { LoaderInbox } from "@/features/loader/loader-inbox"

export default function Page() {
  return (
    <Suspense>
      <LoaderInbox />
    </Suspense>
  )
}
