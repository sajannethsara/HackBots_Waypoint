"use client"

import { useState } from "react"
import { AlertTriangle, Bot, Check, CheckCheck, CheckCircle2, CircleSlash, Clock, Eye, Gavel, MessageSquare, Pencil, RotateCcw, Send, Sparkles, Square, UserPlus, X, XCircle } from "lucide-react"
import {
  AGENT_STATUS_LABEL,
  DEFERRAL_REASONS,
  DEFERRAL_REASON_META,
  type AgentSessionDto,
  type AgentStepDto,
  type AgentStepKind,
  type DeferralReason,
} from "@waypoint/shared"
import { TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { fmtDateTime, timeAgo } from "@/lib/format"
import type { IssueDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAgentFeedback, useApproveAll, useApproveStep, useIssueAgent, useSkipStep, useStartAgent, useStopAgent } from "./use-issue-agent"

const KIND_ICON: Record<AgentStepKind, typeof Check> = { acknowledge: Eye, invite: UserPlus, decision: Gavel, resolve: CheckCircle2 }
const KIND_LABEL: Record<AgentStepKind, string> = { acknowledge: "Acknowledge", invite: "Invite", decision: "Decision", resolve: "Resolve" }
const DECISION_LABEL: Record<string, string> = {
  "defer-order": "Defer order to the next run",
  "short-ship": "Ship short and credit the store",
  "carry-over": "Carry over to the next run",
  "vehicle-out-of-service": "Take vehicle out of service",
  "vehicle-return": "Return vehicle to service",
}

type Decision = { action: string; reason?: DeferralReason; note?: string; shortShip?: boolean; deferRemaining?: boolean }

/**
 * The AI agent's workspace on an issue. It investigates (asking people in the issue chat when it must),
 * then proposes steps; the dispatcher approves, edits or skips each one, or tells it what it got wrong.
 */
export function AgentPanel({ issue }: { issue: IssueDetail }) {
  const { data: a, isLoading, isError, refetch } = useIssueAgent(issue.id)
  const start = useStartAgent(issue.id)

  if (isError)
    return (
      <div className="grid gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <p>The agent could not be loaded.</p>
        <Button size="xs" variant="outline" className="mx-auto" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  if (isLoading || !a) return <Skeleton className="h-48" />

  if (!a.configured)
    return (
      <div className="grid gap-2 rounded-lg border border-dashed p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Bot className="size-4 text-muted-foreground" /> The issue agent is turned off
        </p>
        <p className="text-xs text-muted-foreground">
          Add a Gemini API key to the server&apos;s <code className="rounded bg-muted px-1">.env</code> as <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> and restart the API to turn it on.
        </p>
      </div>
    )

  const resolved = issue.status === "RESOLVED"
  if (a.runs === 0 && a.status === "IDLE")
    return (
      <div className="grid gap-3 text-sm">
        <div className="grid gap-2 rounded-lg border bg-gradient-to-br from-primary/[0.06] to-transparent p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" /> Let the agent handle this issue
          </p>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            <li>• Reads the report, order, trip, photos and chat</li>
            <li>• Asks the people involved in the issue chat when facts are missing, and waits for their answers</li>
            <li>• Proposes the decisions and the resolution as steps you approve, edit or skip</li>
          </ul>
          <p className="text-[11px] text-muted-foreground">Nothing changes in the system until you approve it.</p>
        </div>
        <Button disabled={resolved || start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? <Spinner /> : <Sparkles data-icon="inline-start" />} {resolved ? "The issue is resolved" : "Ask agent"}
        </Button>
      </div>
    )

  const current = a.steps.filter((s) => s.plan === a.plan)
  const earlier = a.steps.filter((s) => s.plan !== a.plan && s.status !== "SUPERSEDED")
  const open = current.filter((s) => s.status === "PROPOSED")
  const busy = a.status === "THINKING"

  return (
    <div className="grid gap-4 text-sm">
      <StatusBar a={a} issueId={issue.id} resolved={resolved} />

      {a.diagnosis && (
        <div className="grid gap-1 rounded-lg bg-muted/50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Bot className="size-3.5" /> Agent&apos;s read
          </p>
          <p className="text-sm leading-relaxed">{a.diagnosis}</p>
        </div>
      )}

      {current.length > 0 && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Proposed plan {a.plan > 1 && `· v${a.plan}`}</p>
            {open.length > 1 && <ApproveAll issueId={issue.id} count={open.length} disabled={busy} />}
          </div>
          <ol className="grid gap-2">
            {current.map((s) => (
              <StepCard key={s.id} step={s} issue={issue} disabled={busy} />
            ))}
          </ol>
        </div>
      )}

      {!resolved && <Feedback issueId={issue.id} disabled={busy} />}

      {earlier.length > 0 && (
        <details className="group rounded-lg border p-2.5">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Earlier plans ({earlier.length} steps)</summary>
          <ul className="mt-2 grid gap-1.5">
            {earlier.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-xs">
                <StepStatusIcon status={s.status} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.title}</span>
                  {s.result && <span className="block text-muted-foreground">{s.result}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Activity a={a} />
    </div>
  )
}

// ───────────────────────────── Status ─────────────────────────────

function StatusBar({ a, issueId, resolved }: { a: AgentSessionDto; issueId: string; resolved: boolean }) {
  const start = useStartAgent(issueId)
  const stop = useStopAgent(issueId)
  const tone = a.status === "FAILED" ? TONE.red : a.status === "WAITING" ? TONE.amber : a.status === "PLAN_READY" ? TONE.blue : a.status === "DONE" ? TONE.green : TONE.gray
  const Icon = a.status === "THINKING" ? null : a.status === "WAITING" ? Clock : a.status === "FAILED" ? AlertTriangle : a.status === "DONE" ? CheckCircle2 : a.status === "PLAN_READY" ? Sparkles : Bot

  return (
    <div className={cn("grid gap-2 rounded-lg p-3 ring-1 ring-inset", tone)}>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-4 shrink-0" /> : <Spinner className="size-4" />}
        <span className="font-medium">{a.status === "THINKING" ? "Working on it…" : AGENT_STATUS_LABEL[a.status]}</span>
        {a.lastRunAt && <span className="ml-auto text-[11px] opacity-80">{timeAgo(a.lastRunAt)}</span>}
      </div>
      {a.status === "WAITING" && a.waitingFor && (
        <p className="text-xs">
          {a.waitingFor}
          {a.waitingSince && <span className="opacity-80"> · asked {timeAgo(a.waitingSince)}</span>}
          <span className="mt-0.5 block opacity-80">It continues on its own when they reply in the chat.</span>
        </p>
      )}
      {a.status === "FAILED" && a.error && <p className="text-xs">{a.error}</p>}
      {!resolved && a.status !== "THINKING" && (
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" className="bg-background" disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? <Spinner /> : <RotateCcw data-icon="inline-start" />}
            {a.status === "WAITING" ? "Continue without waiting" : a.status === "FAILED" ? "Try again" : "Re-plan"}
          </Button>
          {(a.status === "WAITING" || a.status === "PLAN_READY") && (
            <Button size="xs" variant="ghost" disabled={stop.isPending} onClick={() => stop.mutate()}>
              <Square data-icon="inline-start" /> Stop agent
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function ApproveAll({ issueId, count, disabled }: { issueId: string; count: number; disabled: boolean }) {
  const all = useApproveAll(issueId)
  return (
    <Button size="xs" className="ml-auto" disabled={disabled || all.isPending} onClick={() => all.mutate()}>
      {all.isPending ? <Spinner /> : <CheckCheck data-icon="inline-start" />} Approve all ({count})
    </Button>
  )
}

// ───────────────────────────── Steps ─────────────────────────────

function StepStatusIcon({ status }: { status: AgentStepDto["status"] }) {
  if (status === "DONE") return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
  if (status === "FAILED") return <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
  if (status === "SKIPPED") return <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  return <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
}

function StepCard({ step, issue, disabled }: { step: AgentStepDto; issue: IssueDetail; disabled: boolean }) {
  const approve = useApproveStep(issue.id)
  const skip = useSkipStep(issue.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>(step.payload)
  const Icon = KIND_ICON[step.kind] ?? Gavel
  const proposed = step.status === "PROPOSED"
  const editable = step.kind === "decision" || step.kind === "resolve"
  const pending = approve.isPending || skip.isPending

  return (
    <li
      className={cn(
        "grid gap-2 rounded-lg border p-3",
        step.status === "DONE" && "border-emerald-600/25 bg-emerald-500/[0.04]",
        step.status === "FAILED" && "border-red-600/30 bg-red-500/[0.04]",
        step.status === "SKIPPED" && "bg-muted/30 opacity-75",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", proposed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          {step.seq}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Icon className="size-3" /> {KIND_LABEL[step.kind]}
            {step.edited && <span className="rounded bg-muted px-1">edited</span>}
          </p>
          <p className="text-sm font-medium">{step.title}</p>
          <p className="text-xs text-muted-foreground">{step.rationale}</p>
        </div>
      </div>

      {editing ? (
        <StepEditor step={step} issue={issue} draft={draft} onChange={setDraft} />
      ) : (
        <PayloadSummary step={step} />
      )}

      {step.result && (
        <p className={cn("flex items-start gap-1.5 text-xs", step.status === "FAILED" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
          <StepStatusIcon status={step.status} />
          <span>
            {step.result}
            {step.decidedBy && step.decidedAt && <span className="block text-[11px] opacity-80">{step.decidedBy} · {fmtDateTime(step.decidedAt)}</span>}
          </span>
        </p>
      )}

      {proposed && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            disabled={disabled || pending}
            onClick={() => approve.mutate({ stepId: step.id, payload: editing ? draft : undefined }, { onSuccess: () => setEditing(false) })}
          >
            {approve.isPending ? <Spinner /> : <Check data-icon="inline-start" />} {editing ? "Approve edited" : "Approve"}
          </Button>
          {editable &&
            (editing ? (
              <Button size="xs" variant="ghost" disabled={pending} onClick={() => (setEditing(false), setDraft(step.payload))}>
                <X data-icon="inline-start" /> Cancel edit
              </Button>
            ) : (
              <Button size="xs" variant="outline" disabled={disabled || pending} onClick={() => setEditing(true)}>
                <Pencil data-icon="inline-start" /> Edit
              </Button>
            ))}
          <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" disabled={disabled || pending} onClick={() => skip.mutate({ stepId: step.id })}>
            {skip.isPending ? <Spinner /> : <CircleSlash data-icon="inline-start" />} Skip
          </Button>
        </div>
      )}
    </li>
  )
}

/** What the step will actually do, in plain words. */
function PayloadSummary({ step }: { step: AgentStepDto }) {
  const p = step.payload
  if (step.kind === "invite") return <Detail label="Person">{String(p.name ?? p.userId)}{p.relation ? ` · ${String(p.relation)}` : ""}</Detail>
  if (step.kind === "decision") {
    const d = (p.decision ?? {}) as Decision
    return (
      <Detail label={DECISION_LABEL[d.action] ?? d.action}>
        {d.reason && <span className="block">Reason: {DEFERRAL_REASON_META[d.reason]?.label ?? d.reason}</span>}
        {d.action === "carry-over" && <span className="block">{d.shortShip ? "Also ships the original order short" : "Original order unchanged"}</span>}
        {d.action === "vehicle-out-of-service" && <span className="block">{d.deferRemaining ? "Also defers its remaining stops" : "Remaining stops stay on the trip"}</span>}
        {d.note && <span className="block">Note: {d.note}</span>}
      </Detail>
    )
  }
  if (step.kind === "resolve") {
    const playbook = (p.playbook as string[] | undefined) ?? []
    return (
      <Detail label="Resolution note (the store and driver read this)">
        <span className="block whitespace-pre-wrap">{String(p.resolution ?? "")}</span>
        {playbook.length > 0 && <span className="mt-1 block text-[11px] opacity-80">Follow-ups: {playbook.join(", ")}</span>}
      </Detail>
    )
  }
  return null
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/50 px-2.5 py-2 text-xs">
      <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/** Dispatch's own version of a step: change the reason, the note, the options or the resolution text. */
function StepEditor({ step, issue, draft, onChange }: { step: AgentStepDto; issue: IssueDetail; draft: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  if (step.kind === "decision") {
    const d = (draft.decision ?? {}) as Decision
    const set = (patch: Partial<Decision>) => onChange({ ...draft, decision: { ...d, ...patch } })
    return (
      <div className="grid gap-2 rounded-md border p-2.5">
        <p className="text-xs font-medium">{DECISION_LABEL[d.action] ?? d.action}</p>
        {d.action === "defer-order" && (
          <Select value={d.reason ?? "OTHER"} onValueChange={(v) => set({ reason: v as DeferralReason })}>
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
        )}
        {d.action === "carry-over" && (
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={!!d.shortShip} onCheckedChange={(c) => set({ shortShip: c === true })} /> Also ship the original order short
          </label>
        )}
        {d.action === "vehicle-out-of-service" && (
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={!!d.deferRemaining} onCheckedChange={(c) => set({ deferRemaining: c === true })} /> Also defer its remaining stops
          </label>
        )}
        <Textarea rows={2} value={d.note ?? ""} onChange={(e) => set({ note: e.target.value.slice(0, 500) || undefined })} placeholder="Note for the store and driver (optional)" />
      </div>
    )
  }
  if (step.kind === "resolve") {
    const playbook = (draft.playbook as string[] | undefined) ?? []
    const toggle = (id: string) => onChange({ ...draft, playbook: playbook.includes(id) ? playbook.filter((x) => x !== id) : [...playbook, id] })
    return (
      <div className="grid gap-2 rounded-md border p-2.5">
        <Textarea rows={4} value={String(draft.resolution ?? "")} onChange={(e) => onChange({ ...draft, resolution: e.target.value.slice(0, 1000) })} placeholder="Resolution note" />
        <div className="grid gap-1">
          {issue.playbook.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-xs">
              <Checkbox checked={playbook.includes(p.id)} onCheckedChange={() => toggle(p.id)} /> {p.label}
            </label>
          ))}
        </div>
      </div>
    )
  }
  return null
}

// ───────────────────────────── Talking to the agent ─────────────────────────────

function Feedback({ issueId, disabled }: { issueId: string; disabled: boolean }) {
  const send = useAgentFeedback(issueId)
  const [text, setText] = useState("")
  const submit = () => text.trim().length >= 2 && send.mutate(text.trim(), { onSuccess: () => setText("") })
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tell the agent</p>
      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder="What it missed or what you want instead, e.g. “Don't defer, the store can receive until 9.”"
          className="min-h-0"
        />
        <Button size="icon" disabled={disabled || send.isPending || text.trim().length < 2} onClick={submit} aria-label="Send to the agent">
          {send.isPending ? <Spinner /> : <Send />}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">The agent re-plans from what you write. Ctrl+Enter sends.</p>
    </div>
  )
}

function Activity({ a }: { a: AgentSessionDto }) {
  if (!a.notes.length) return null
  const notes = [...a.notes].reverse().slice(0, 12)
  return (
    <div className="grid gap-2 border-t pt-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Activity</p>
      <ol className="grid gap-2">
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-2 text-xs">
            {n.kind === "CHAT" ? (
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-primary" />
            ) : n.kind === "FEEDBACK" ? (
              <Pencil className="mt-0.5 size-3.5 shrink-0 text-violet-600" />
            ) : (
              <Bot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-medium">{n.kind === "CHAT" ? "Agent in the chat: " : n.kind === "FEEDBACK" ? `${n.author ?? "Dispatch"}: ` : ""}</span>
              {n.kind === "CHAT" ? <span className="italic">“{n.body}”</span> : n.body}
              <span className="block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
