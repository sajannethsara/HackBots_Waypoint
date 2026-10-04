import { Package } from "lucide-react"
import { SectionPlaceholder } from "@/features/store-manager/shared/section-placeholder"

export default function Page() {
  return <SectionPlaceholder title="Inventory" description="Stock levels for your outlet." icon={Package} note="Inventory is a stretch goal." />
}
