import { VehicleLoadPage } from "@/features/loader/vehicle-load-page"

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <VehicleLoadPage tripId={tripId} />
}
