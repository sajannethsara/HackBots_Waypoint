import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Info } from "lucide-react"
import { ISSUE_TYPE_META, type LiveAlert } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { minToHHMM, timeAgo } from "@/lib/format"
import type { TripDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AutoBadge, IssueStatusBadge, SeverityBadge } from "../../issues/issue-badges"

/** Issues on this trip with a one-click route into the resolve page. */
export function TripIssues({ issues, action }: { issues: TripDetail["issues"]; action?: React.ReactNode }) {
  const open = issues.filter((i) => i.status !== "RESOLVED")
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Issues
          {!!open.length && <span className="rounded-full bg-destructive/10 px-1.5 text-xs text-destructive tabular-nums">{open.length} open</span>}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="grid gap-2">
        {!issues.length && <p className="py-4 text-center text-sm text-muted-foreground">No issues on this trip.</p>}
        {issues.map((i) => (
          <div key={i.id} className={cn("grid gap-1.5 rounded-lg border p-2.5", i.status === "RESOLVED" && "opacity-70")}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">{i.ref}</span>
              <span className="text-xs text-muted-foreground">{ISSUE_TYPE_META[i.type].label}</span>
              <span className="ml-auto flex items-center gap-1">
                <SeverityBadge severity={i.severity} />
                <IssueStatusBadge status={i.status} />
              </span>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{i.description}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {i.stop && <span>Stop {i.stop.seq}</span>}
              <span className="inline-flex items-center gap-1">
                {i.reportedBy.name} <AutoBadge clientId={i.clientId} />
              </span>
              <span>· {timeAgo(i.createdAt)}</span>
              <Button
                size="xs"
                variant={i.status === "RESOLVED" ? "ghost" : "default"}
                className="ml-auto"
                nativeButton={false}
                render={<Link href={`/dispatcher/issues/${i.id}`} />}
              >
                {i.status === "RESOLVED" ? "View" : "Resolve"} <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const ICON = { high: AlertTriangle, medium: Clock, low: Info, ok: CheckCircle2 }
const TONE = { high: "text-red-600", medium: "text-amber-600", low: "text-sky-600", ok: "text-emerald-600" }

export function TripAlerts({ alerts }: { alerts: LiveAlert[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Live alerts</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        {!alerts.length && <p className="py-3 text-center text-sm text-muted-foreground">No alerts for this trip.</p>}
        {alerts.map((a) => {
          const Icon = ICON[a.severity]
          return (
            <div key={a.id} className="flex items-start gap-2.5 py-1.5">
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[a.severity])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight font-medium">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">{minToHHMM(Math.floor(a.atMin))}</span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
