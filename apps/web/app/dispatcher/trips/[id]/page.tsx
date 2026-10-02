import { TripDetailPage } from "@/features/dispatcher/trips/detail/trip-detail-page"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TripDetailPage id={id} mapboxToken={process.env.MAPBOX_ACCESS_TOKEN || undefined} wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
