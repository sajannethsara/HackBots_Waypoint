import { VehiclesPage } from "@/features/dispatcher/resources/vehicles-page"

export const dynamic = "force-dynamic"

export default function Page() {
  return <VehiclesPage wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
