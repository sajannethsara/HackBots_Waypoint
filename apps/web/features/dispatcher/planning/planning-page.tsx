"use client"

import { useState } from "react"
import { PageHeader } from "@/components/shared/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentPlan } from "../queries"
import { GenerateStep } from "./generate-step"
import { PublishedStep } from "./published-step"
import { ReviewStep } from "./review-step"
import { Stepper } from "./stepper"

/**
 * Planning workflow: Generate → Review & adjust → Publish.
 * The step is derived from the latest plan for the day; "Replan" opens Generate again
 * and produces a new version that supersedes the published one on publish.
 */
export function PlanningPage({ mapboxToken }: { mapboxToken?: string }) {
  const { data: plan, isLoading } = useCurrentPlan()
  // Replan is tied to the plan it started from; a newly generated draft ends it.
  const [replanFrom, setReplanFrom] = useState<string | null>(null)
  const replanning = !!plan && replanFrom === plan.id
  const setReplanning = (on: boolean) => setReplanFrom(on && plan ? plan.id : null)

  // A published plan opens on the depot gate; Review & adjust stays reachable for trips that have not gone live.
  const [view, setView] = useState<"gate" | "review">("gate")
  const published = !!plan && plan.status === "PUBLISHED" && !replanning
  const step: 1 | 2 | 3 = !plan || replanning ? 1 : plan.status === "DRAFT" || view === "review" ? 2 : 3
  const description = {
    1: "Generate an initial delivery plan from today's confirmed orders and available vehicles.",
    2: "Review trips, adjust allocations and record deferral reasons. Every change is validated against the operating rules.",
    3: "The plan is published. Replan creates a new version if conditions change.",
  }[step]
  const note = published && view === "review" ? "Published plan: live trips are locked; held and waiting trips can still be adjusted." : description

  return (
    <div className="grid gap-4">
      <PageHeader title="Planning" description={note} />
      <Stepper step={step} published={published} onStep={(n) => setView(n === 2 ? "review" : "gate")} />
      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : step === 1 ? (
        <GenerateStep onCancel={replanning ? () => setReplanning(false) : undefined} />
      ) : step === 2 && plan ? (
        <ReviewStep plan={plan} mapboxToken={mapboxToken} onOpenGate={() => setView("gate")} />
      ) : plan ? (
        <PublishedStep plan={plan} onReplan={() => setReplanning(true)} />
      ) : null}
    </div>
  )
}
