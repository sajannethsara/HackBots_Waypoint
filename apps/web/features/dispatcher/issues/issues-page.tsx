"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertOctagon, CheckCircle2, CircleAlert, Eye, Search } from "lucide-react"
import { ISSUE_STAGES, ISSUE_STAGE_LABEL, ISSUE_TYPE_META } from "@waypoint/shared"
import { BrandBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { timeAgo } from "@/lib/format"
import { useIssues } from "../queries"
import { AutoBadge, IssueStatusBadge, SeverityBadge, StageBadge } from "./issue-badges"

const TABS = [
  { value: "active", label: "Needs action" },
  { value: "OPEN", label: "Open" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "all", label: "All" },
]

export function IssuesPage() {
  const router = useRouter()
  const [tab, setTab] = useState("active")
  const [stage, setStage] = useState("all")
  const [severity, setSeverity] = useState("all")
  const [q, setQ] = useState("")
  const { data, isLoading } = useIssues({
    status: tab === "active" || tab === "all" ? undefined : tab,
    stage: stage === "all" ? undefined : stage,
    severity: severity === "all" ? undefined : severity,
    q: q || undefined,
  })
  const rows = (data?.issues ?? []).filter((i) => tab !== "active" || i.status !== "RESOLVED")
  const c = data?.counts

  return (
    <div className="grid gap-4">
      <PageHeader title="Issues" description="Every exception from planning, loading, delivery and receipt — in one queue, with who raised it and what was done." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CircleAlert} tone="red" label="Open" value={c?.open ?? "—"} hint="Waiting for a dispatcher" />
        <StatCard icon={AlertOctagon} tone="red" label="High severity" value={c?.highOpen ?? "—"} hint="Open or acknowledged" />
        <StatCard icon={Eye} tone="amber" label="Acknowledged" value={c?.acknowledged ?? "—"} hint="Being handled" />
        <StatCard icon={CheckCircle2} tone="green" label="Resolved" value={c?.resolved ?? "—"} hint={`${c?.all ?? 0} issues on record`} />
      </div>

      <Card size="sm" className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  {t.value === "active" && c && <span className="text-[11px] text-muted-foreground tabular-nums">{c.open + c.acknowledged}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ref, outlet, vehicle, text…" className="h-7 w-52 pl-7 text-sm" />
            </div>
            <Filter value={stage} onChange={setStage} options={[{ value: "all", label: "All stages" }, ...ISSUE_STAGES.map((s) => ({ value: s, label: ISSUE_STAGE_LABEL[s] }))]} />
            <Filter
              value={severity}
              onChange={setSeverity}
              options={[
                { value: "all", label: "All severities" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
              ]}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !rows.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No issues here. Everything is under control.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Issue</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="w-[34%]">What happened</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Linked to</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id} className="cursor-pointer" onClick={() => router.push(`/dispatcher/issues/${i.id}`)}>
                  <TableCell className="pl-4">
                    <div className="grid leading-tight">
                      <span className="font-medium">{i.ref}</span>
                      <span className="text-xs text-muted-foreground">{ISSUE_TYPE_META[i.type].label}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={i.severity} />
                  </TableCell>
                  <TableCell className="text-xs whitespace-normal text-muted-foreground">
                    <span className="line-clamp-2">{i.description}</span>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={i.stage} />
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap items-center gap-1">
                      {i.trip && (
                        <Link href={`/dispatcher/trips/${i.trip.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-primary hover:underline">
                          {i.trip.ref}
                        </Link>
                      )}
                      {i.trip && <BrandBadge brand={i.trip.brand} />}
                      {i.outlet && <span>{i.outlet.id}</span>}
                      {i.vehicleId && !i.trip && <span>{i.vehicleId}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="grid leading-tight">
                      <span className="inline-flex items-center gap-1">
                        {i.reportedBy.name} <AutoBadge clientId={i.clientId} />
                      </span>
                      <span className="text-muted-foreground">{timeAgo(i.createdAt)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <IssueStatusBadge status={i.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button
                      size="xs"
                      variant={i.status === "RESOLVED" ? "ghost" : "outline"}
                      nativeButton={false}
                      render={<Link href={`/dispatcher/issues/${i.id}`} onClick={(e) => e.stopPropagation()} />}
                    >
                      {i.status === "RESOLVED" ? "View" : "Resolve"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function Filter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger size="sm" className="w-36">
        <SelectValue>{(v: string) => options.find((o) => o.value === v)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
