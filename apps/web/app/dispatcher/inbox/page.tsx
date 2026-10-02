import { Suspense } from "react"
import { Inbox } from "@/features/chat/inbox"

export default function Page() {
  return (
    <div className="h-[calc(100svh-8.5rem)] min-h-[480px]">
      <Suspense>
        <Inbox />
      </Suspense>
    </div>
  )
}
