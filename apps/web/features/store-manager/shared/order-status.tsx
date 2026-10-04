import { Chip, TONE, type Tone } from "@/components/shared/badges"

/**
 * How the store manager sees an order. The planner's statuses are collapsed into the words
 * used in the design: Scheduled, Deferred, Completed (delivered, not yet confirmed), Received.
 */
const VIEW: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "amber" },
  SUBMITTED: { label: "Scheduled", tone: "blue" },
  PLANNED: { label: "Scheduled", tone: "blue" },
  LOADED: { label: "Scheduled", tone: "blue" },
  IN_TRANSIT: { label: "On the way", tone: "violet" },
  DEFERRED: { label: "Deferred", tone: "red" },
  DELIVERED: { label: "Completed", tone: "green" },
  PARTIAL: { label: "Partly delivered", tone: "amber" },
  REFUSED: { label: "Refused", tone: "red" },
  RECEIVED: { label: "Received", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
}

export const storeStatusLabel = (status: string) => VIEW[status]?.label ?? status

export function StoreOrderStatus({ status }: { status: string }) {
  const v = VIEW[status] ?? { label: status, tone: "gray" as Tone }
  return <Chip className={TONE[v.tone]}>{v.label}</Chip>
}
