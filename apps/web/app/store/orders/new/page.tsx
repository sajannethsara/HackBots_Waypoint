import { PackagePlus } from "lucide-react"
import { SectionPlaceholder } from "@/features/store/shared/section-placeholder"

export default function Page() {
  return <SectionPlaceholder title="Create order" description="Build a new order for your outlet." icon={PackagePlus} note="The order wizard arrives in the next phase." />
}
