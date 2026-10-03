import { DispatcherInbox } from "@/features/dispatcher/dispatcher-inbox"

export default function Page() {
  return (
    <div className="h-[calc(100svh-8.5rem)] min-h-[480px]">
      <DispatcherInbox />
    </div>
  )
}
