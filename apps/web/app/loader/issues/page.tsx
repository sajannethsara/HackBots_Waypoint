import { Suspense } from "react"
import { LoaderIssuesPage } from "@/features/loader/issues-page"

export default function Page() {
  return (
    <Suspense>
      <LoaderIssuesPage />
    </Suspense>
  )
}
