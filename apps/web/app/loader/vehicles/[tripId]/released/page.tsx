import { ReleasedPage } from "@/features/loader/released-page"

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <ReleasedPage tripId={tripId} />
}
