import { StoreIssueDetailPage } from "@/features/store-manager/issues/store-issue-detail-page"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StoreIssueDetailPage id={id} />
}
