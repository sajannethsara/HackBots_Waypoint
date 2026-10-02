import { OutletsPage } from "@/features/dispatcher/resources/outlets-page"

export const dynamic = "force-dynamic"

export default function Page() {
  return <OutletsPage wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
