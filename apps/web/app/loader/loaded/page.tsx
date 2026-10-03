import { Construction } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/** Figma screen 8, not built yet. Finished vehicles are listed on the dashboard and in the queue meanwhile. */
export default function Page() {
  return (
    <Empty className="min-h-[60vh] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>My Loaded Vehicles is on the way</EmptyTitle>
        <EmptyDescription>Until then, vehicles you released show as “Loaded &amp; released” on the dashboard and in the queue, with their receipt.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
