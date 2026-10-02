import { MemberWorkspace } from "@/features/chat/member-workspace"

export const dynamic = "force-dynamic"

export default function Page() {
  return <MemberWorkspace wsUrl={process.env.PUBLIC_WS_URL || undefined} />
}
