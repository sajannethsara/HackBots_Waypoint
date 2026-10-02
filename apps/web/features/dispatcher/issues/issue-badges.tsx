import { AlertOctagon, AlertTriangle, Bot, Info } from "lucide-react"
import { ISSUE_STAGE_LABEL, ISSUE_TYPE_META, type IssueSeverity, type IssueStage, type IssueStatus, type IssueType } from "@waypoint/shared"
import { TagBadge, type Tone } from "@/components/shared/badges"

const SEVERITY: Record<IssueSeverity, { tone: Tone; label: string; icon: typeof Info }> = {
  HIGH: { tone: "red", label: "High", icon: AlertOctagon },
  MEDIUM: { tone: "amber", label: "Medium", icon: AlertTriangle },
  LOW: { tone: "blue", label: "Low", icon: Info },
}

const STATUS: Record<IssueStatus, { tone: Tone; label: string }> = {
  OPEN: { tone: "red", label: "Open" },
  ACKNOWLEDGED: { tone: "amber", label: "Acknowledged" },
  RESOLVED: { tone: "green", label: "Resolved" },
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const s = SEVERITY[severity]
  return (
    <TagBadge tone={s.tone}>
      <s.icon className="size-3" />
      {s.label}
    </TagBadge>
  )
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return <TagBadge tone={STATUS[status].tone}>{STATUS[status].label}</TagBadge>
}

export function IssueTypeLabel({ type }: { type: IssueType }) {
  return <>{ISSUE_TYPE_META[type].label}</>
}

export function StageBadge({ stage }: { stage: IssueStage }) {
  return <TagBadge tone="gray">{ISSUE_STAGE_LABEL[stage]}</TagBadge>
}

/** Issues raised by live monitoring carry a `sim-…` client id. */
export function AutoBadge({ clientId }: { clientId: string | null }) {
  if (!clientId?.startsWith("sim-")) return null
  return (
    <TagBadge tone="violet" title="Raised automatically by live monitoring">
      <Bot className="size-3" /> Auto
    </TagBadge>
  )
}

export const SEVERITY_ICON_TONE: Record<IssueSeverity, string> = {
  HIGH: "text-red-600",
  MEDIUM: "text-amber-600",
  LOW: "text-sky-600",
}
export { SEVERITY }
