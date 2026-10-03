import { ItemChecklistPage } from "@/features/loader/item-checklist-page"

export default async function Page({ params }: { params: Promise<{ tripId: string; stopId: string }> }) {
  const { tripId, stopId } = await params
  return <ItemChecklistPage tripId={tripId} stopId={stopId} />
}
