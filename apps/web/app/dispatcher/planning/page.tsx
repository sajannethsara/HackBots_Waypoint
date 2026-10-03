import { PlanningPage } from "@/features/dispatcher/planning/planning-page"

export default function Page() {
  return <PlanningPage mapboxToken={process.env.MAPBOX_ACCESS_TOKEN || undefined} />
}
