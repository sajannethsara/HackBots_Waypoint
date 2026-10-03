import { Settings } from "lucide-react"
import { SectionPlaceholder } from "@/features/store/shared/section-placeholder"

export default function Page() {
  return <SectionPlaceholder title="Settings" description="Notification preferences and password." icon={Settings} note="Settings arrive in a later phase." />
}
