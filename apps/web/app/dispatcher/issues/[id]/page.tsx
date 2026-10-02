import { IssueDetailPage } from "@/features/dispatcher/issues/issue-detail-page"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <IssueDetailPage id={id} mapboxToken={process.env.MAPBOX_ACCESS_TOKEN || undefined} />
}
