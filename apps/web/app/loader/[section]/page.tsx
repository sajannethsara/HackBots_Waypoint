import { Construction } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/** Loader screens from the design that are not built yet (Dashboard, My Loaded Vehicles). */
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const title = section.charAt(0).toUpperCase() + section.slice(1)
  return (
    <Empty className="min-h-[60vh] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>{title} is on the way</EmptyTitle>
        <EmptyDescription>This screen is part of the next build milestone.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
