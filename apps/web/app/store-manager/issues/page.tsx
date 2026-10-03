import { Suspense } from "react"
import { StoreIssuesPage } from "@/features/store-manager/issues/store-issues-page"

export default function Page() {
  return (
    <Suspense>
      <StoreIssuesPage />
    </Suspense>
  )
}
