import { VehicleDetailPage } from "@/features/dispatcher/resources/vehicle-detail-page"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <VehicleDetailPage id={id} wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
