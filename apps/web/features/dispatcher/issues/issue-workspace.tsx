"use client"

import { useState } from "react"
import { Ban, Bell, CalendarClock, Check, CheckCircle2, ChevronRight, Eye, PackageMinus, Truck, Wrench } from "lucide-react"
import { DEFERRAL_REASONS, DEFERRAL_REASON_META, ISSUE_TYPE_META, type DeferralReason, type IssueActionOption } from "@waypoint/shared"
import { TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { IssueChatCard } from "@/features/issue-chat/issue-chat-card"
import { useIssueChatId, useIssueChatThread } from "@/features/issue-chat/use-issue-chat"
import { fmtDateTime, timeAgo } from "@/lib/format"
import type { IssueDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAcknowledgeIssue, useResolveIssue } from "../queries"
import { useIssueActions, useRunIssueAction } from "./use-issue-workflow"

/**
 * Where an issue gets solved. The people involved talk in the Chat tab; dispatch takes decisions that
 * change the system (Decisions) and, once it is sorted, writes the final note and closes it (Resolve).
 */
export function IssueWorkspace({ issue }: { issue: IssueDetail }) {
  const actions = useIssueActions(issue.id)
  const available = actions.data?.actions.filter((a) => a.available).length ?? 0
  const resolved = issue.status === "RESOLVED"
  // Controlled: the issue flips to resolved while this is mounted.
  const [tab, setTab] = useState(() => (resolved ? "resolve" : "chat"))

  return (
    <Card size="sm" className="h-fit gap-0 overflow-hidden p-0 xl:sticky xl:top-18">
      <StatusSteps issue={issue} />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-0">
        <div className="border-b px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="decisions" className="gap-1.5">
              Decisions
              {!resolved && available > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">{available}</span>}
            </TabsTrigger>
            <TabsTrigger value="resolve">{resolved ? "Outcome" : "Resolve"}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="chat" className="p-3">
          <IssueChatCard issueId={issue.id} bare />
        </TabsContent>
        <TabsContent value="decisions" className="p-3">
          <Decisions issue={issue} />
        </TabsContent>
        <TabsContent value="resolve" className="p-3">
          <ResolveTab issue={issue} />
        </TabsContent>
      </Tabs>
    </Card>
  )
}

// ───────────────────────────── Status ─────────────────────────────

function StatusSteps({ issue }: { issue: IssueDetail }) {
  const ack = useAcknowledgeIssue(issue.id)
  const at = (action: string) => issue.history.find((h) => h.action === action)?.createdAt
  const idx = issue.status === "OPEN" ? 0 : issue.status === "ACKNOWLEDGED" ? 1 : 2
  const steps = [
    { label: "Reported", at: issue.createdAt },
    { label: "Acknowledged", at: at("ISSUE_ACKNOWLEDGED") },
    { label: "Resolved", at: issue.resolvedAt ?? at("ISSUE_RESOLVED") },
  ]
  return (
    <div className="grid gap-2.5 border-b p-3">
      <ol className="flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium", i <= idx ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
              {i <= idx ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="grid leading-tight">
              <span className={cn("text-xs font-medium", i > idx && "text-muted-foreground")}>{s.label}</span>
              <span className="text-[10px] text-muted-foreground">{i <= idx && s.at ? timeAgo(s.at) : "Pending"}</span>
            </span>
            {i < steps.length - 1 && <span className={cn("h-px min-w-3 flex-1", i < idx ? "bg-primary" : "bg-border")} />}
          </li>
        ))}
      </ol>
      {issue.status === "OPEN" && (
        <div className={cn("flex items-center gap-3 rounded-lg p-2.5 text-xs ring-1 ring-inset", TONE.amber)}>
          <span className="flex-1">Let the people involved know someone is on it.</span>
          <Button size="xs" variant="outline" disabled={ack.isPending} onClick={() => ack.mutate()}>
            {ack.isPending ? <Spinner /> : <Eye data-icon="inline-start" />} Acknowledge
          </Button>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Decisions ─────────────────────────────

const ACTION_ICON = { "defer-order": CalendarClock, "vehicle-out-of-service": Wrench, "vehicle-return": Truck, "short-ship": PackageMinus } as const

function Decisions({ issue }: { issue: IssueDetail }) {
  const { data, isLoading, isError, refetch } = useIssueActions(issue.id)
  const [selected, setSelected] = useState<IssueActionOption | null>(null)

  if (isError)
    return (
      <div className="grid gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <p>Decisions could not be loaded.</p>
        <Button size="xs" variant="outline" className="mx-auto" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  if (isLoading || !data) return <Skeleton className="h-40" />
  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">Decisions change trips, orders and vehicles for real. Everyone in the chat is told what you decided.</p>

      {!data.actions.length ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">This issue is not linked to an order, trip or vehicle, so there is nothing to change in the system. Talk it through in the chat, then resolve it with a note.</p>
      ) : (
        <ul className="grid gap-2">
          {data.actions.map((a) => {
            const Icon = ACTION_ICON[a.id] ?? Ban
            return (
              <li key={a.id} className={cn("grid gap-2 rounded-lg border p-3", !a.available && "bg-muted/30")}>
                <div className="flex items-start gap-2.5">
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", a.available ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-4" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="text-sm font-medium">{a.label}</p>
                    {a.target && <p className="text-xs font-medium text-foreground/80">{a.target}</p>}
                    <p className="text-xs text-muted-foreground">{a.available ? a.effect : a.unavailableReason}</p>
                  </div>
                  <Button size="xs" variant={a.available ? "default" : "outline"} disabled={!a.available} onClick={() => setSelected(a)}>
                    Review <ChevronRight data-icon="inline-end" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {data.taken.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Decided so far</p>
          <ol className="grid gap-2">
            {data.taken.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1">
                  {t.summary}
                  <span className="block text-[11px] text-muted-foreground">
                    {t.actor} · {fmtDateTime(t.at)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <DecisionDialog issue={issue} action={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function DecisionDialog({ issue, action, onClose }: { issue: IssueDetail; action: IssueActionOption | null; onClose: () => void }) {
  const run = useRunIssueAction(issue.id)
  const [reason, setReason] = useState<DeferralReason | null>(null)
  const [note, setNote] = useState("")
  const [deferRemaining, setDeferRemaining] = useState(false)
  const chosen = reason ?? action?.defaultReason ?? "OTHER"

  const close = () => {
    setReason(null)
    setNote("")
    setDeferRemaining(false)
    onClose()
  }

  const confirm = () => {
    if (!action) return
    const n = note.trim() || undefined
    const input =
      action.id === "defer-order"
        ? ({ action: "defer-order", reason: chosen, note: n } as const)
        : action.id === "vehicle-out-of-service"
          ? ({ action: "vehicle-out-of-service", deferRemaining, note: n } as const)
          : action.id === "vehicle-return"
            ? ({ action: "vehicle-return", note: n } as const)
            : ({ action: "short-ship", note: n } as const)
    run.mutate(input, { onSuccess: close })
  }

  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-4 sm:max-w-md">
        {action && (
          <>
            <DialogHeader>
              <DialogTitle>{action.label}</DialogTitle>
              <DialogDescription>{action.target}</DialogDescription>
            </DialogHeader>
            <p className="rounded-lg bg-muted/50 p-3 text-xs">{action.effect}</p>

            {action.id === "defer-order" && (
              <div className="grid gap-2">
                <p className="text-xs font-medium">Reason</p>
                <Select value={chosen} onValueChange={(v) => setReason(v as DeferralReason)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => DEFERRAL_REASON_META[v as DeferralReason]?.label ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DEFERRAL_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {DEFERRAL_REASON_META[r].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Suggested from the issue type ({ISSUE_TYPE_META[issue.type].label}). The store and the driver see this.</p>
              </div>
            )}

            {action.id === "vehicle-out-of-service" && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
                <Checkbox checked={deferRemaining} onCheckedChange={(c) => setDeferRemaining(c === true)} className="mt-0.5" />
                <span className="grid text-sm">
                  <span className="font-medium">Also defer its remaining stops</span>
                  <span className="text-xs text-muted-foreground">
                    {action.pendingStops ? `${action.pendingStops} stop${action.pendingStops === 1 ? "" : "s"} not served yet move to the next run and leave the trips.` : "No pending stops on the plan."}
                  </span>
                </span>
              </label>
            )}

            <div className="grid gap-1.5">
              <p className="text-xs font-medium">Note (optional)</p>
              <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Anything the store or the driver should know" />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={run.isPending}>
                Cancel
              </Button>
              <Button onClick={confirm} disabled={run.isPending} variant={action.id === "vehicle-return" ? "default" : "destructive"}>
                {run.isPending && <Spinner />}
                {action.id === "defer-order" ? "Defer and remove from trip" : action.id === "vehicle-out-of-service" ? "Take out of service" : action.id === "vehicle-return" ? "Return to service" : "Ship short"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────── Resolve ─────────────────────────────

function ResolveTab({ issue }: { issue: IssueDetail }) {
  const resolve = useResolveIssue(issue.id)
  const { data: actionData } = useIssueActions(issue.id)
  const chatId = useIssueChatId(issue.id)
  const thread = useIssueChatThread(chatId.data ?? null)
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [confirming, setConfirming] = useState(false)
  const taken = actionData?.taken ?? []

  if (issue.status === "RESOLVED")
    return (
      <div className="grid gap-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-4 text-emerald-600" /> Resolved
        </div>
        <p className="rounded-lg bg-muted/50 p-3">{issue.resolution}</p>
        <p className="text-xs text-muted-foreground">
          {issue.resolvedBy?.name ?? "Dispatcher"} · {issue.resolvedAt ? fmtDateTime(issue.resolvedAt) : ""}
        </p>
        {taken.length > 0 && (
          <ul className="grid gap-1.5 border-t pt-3">
            {taken.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> {t.summary}
              </li>
            ))}
          </ul>
        )}
      </div>
    )

  const toggle = (id: string) => setPicked((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  const notifies = issue.playbook.filter((p) => picked.includes(p.id) && p.effect)
  const people = thread.data?.chat.members.length ?? 0
  const useDecisions = () => setNote((n) => [n.trim(), ...taken.map((t) => t.summary)].filter(Boolean).join(" ").slice(0, 1000))

  return (
    <div className="grid gap-4 text-sm">
      {taken.length > 0 && (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Decided so far</p>
          <ul className="grid gap-1.5">
            {taken.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> {t.summary}
              </li>
            ))}
          </ul>
          <Button size="xs" variant="outline" className="w-fit" onClick={useDecisions}>
            Add to the note
          </Button>
        </div>
      )}

      <div className="grid gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Follow-ups · {ISSUE_TYPE_META[issue.type].label}</p>
        {issue.playbook.map((p) => (
          <label key={p.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-muted/50", picked.includes(p.id) && "border-primary bg-primary/5")}>
            <Checkbox checked={picked.includes(p.id)} onCheckedChange={() => toggle(p.id)} className="mt-0.5" />
            <span className="grid">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {p.label}
                {p.effect && <Bell className="size-3 text-muted-foreground" />}
              </span>
              <span className="text-xs text-muted-foreground">{p.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Resolution note</p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={4} placeholder="What was decided and what happens next. This is what the store and the driver will read." />
      </div>

      {!!notifies.length && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bell className="size-3" /> Will notify {notifies.map((n) => (n.effect === "NOTIFY_STORE" ? "the store manager" : "the driver")).join(" and ")}.
        </p>
      )}

      <Button disabled={note.trim().length < 3 || resolve.isPending} onClick={() => setConfirming(true)}>
        <Check data-icon="inline-start" /> Mark as resolved
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="gap-4 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve {issue.ref}?</DialogTitle>
            <DialogDescription>This is the final word. It cannot be reopened.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Resolution note</p>
              {note.trim()}
            </div>
            <ul className="grid gap-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Check className="size-3" /> Posts the note in the issue chat and closes it{people ? ` (${people} ${people === 1 ? "person" : "people"} notified)` : ""}
              </li>
              {taken.length > 0 && (
                <li className="flex items-center gap-1.5">
                  <Check className="size-3" /> Keeps {taken.length} decision{taken.length === 1 ? "" : "s"} already applied
                </li>
              )}
              {notifies.length > 0 && (
                <li className="flex items-center gap-1.5">
                  <Check className="size-3" /> Notifies {notifies.map((n) => (n.effect === "NOTIFY_STORE" ? "the store manager" : "the driver")).join(" and ")}
                </li>
              )}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={resolve.isPending}>
              Keep working
            </Button>
            <Button disabled={resolve.isPending} onClick={() => resolve.mutate({ actions: picked, resolution: note.trim() }, { onSuccess: () => setConfirming(false) })}>
              {resolve.isPending ? <Spinner /> : <Check data-icon="inline-start" />} Mark as resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
