import { randomUUID } from "node:crypto"
import { ApiError, FunctionCallingConfigMode, GoogleGenAI, type Content, type FunctionCall, type Part } from "@google/genai"
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common"
import type { Prisma } from "@waypoint/db"
import {
  agentStepPayloadSchemas,
  issueActionSchema,
  ISSUE_TYPE_META,
  minToHHMM,
  ROLE_LABEL,
  toDateOnly,
  type AgentApproveInput,
  type AgentSessionDto,
  type AgentStatus,
  type AgentStepKind,
  type AgentUpdateEvent,
  type IssueActionOption,
  type Role,
} from "@waypoint/shared"
import bcrypt from "bcryptjs"
import type { SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { ChatGateway } from "../chat/chat.gateway"
import { IssueChatService } from "../issue-chat/issue-chat.module"
import { IssueActionsService } from "../issues/issue-actions"
import { IssuesService } from "../issues/issues.service"
import { AGENT_SYSTEM_PROMPT } from "./agent.prompt"
import { AGENT_TOOLS, toolInput } from "./agent.tools"

export const AGENT_EMAIL = "agent@waypoint.lk"
/** Gemini model. The "-latest" alias follows Google's current Flash model, so retirements don't break it; GEMINI_MODEL pins one. */
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest"
/** Used for a whole run when the main model is overloaded as the run starts (free-tier demand spikes). */
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash"
/** Busy (503) and rate-limited (429) answers are usually brief: retry this many times with backoff. */
const RETRIES = 2
/** Model calls per run; a run normally needs 2-4. */
const MAX_TURNS = 10
/** Chat messages the agent may post in one run. */
const MAX_CHAT_PER_RUN = 2
/** Replies arriving close together wake the agent once. */
const WAKE_DEBOUNCE_MS = 12_000

type Issue = Awaited<ReturnType<IssuesService["get"]>>
type Session = Prisma.IssueAgentGetPayload<{ include: { steps: true; notes: true } }>

/** Everything one run needs, gathered up front. */
interface RunContext {
  issue: Issue
  options: IssueActionOption[]
  candidates: { id: string; name: string; role: Role; relation: string }[]
  chatId: string | null
  chatPosts: number
}

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly log = new Logger("IssueAgent")
  private readonly client: GoogleGenAI | null
  private agentUser: SessionUser | null = null
  private readonly running = new Set<string>()
  private readonly rerun = new Map<string, string>()
  private readonly wakeTimers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
    private readonly issues: IssuesService,
    private readonly actions: IssueActionsService,
    private readonly issueChat: IssueChatService,
    private readonly gateway: ChatGateway,
  ) {
    // The key comes from the environment (GEMINI_API_KEY). Without it the agent is simply off.
    // GEMINI_BASE_URL only points the SDK at a test double; leave it unset.
    const apiKey = process.env.GEMINI_API_KEY
    this.client = apiKey ? new GoogleGenAI({ apiKey, ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}) }) : null
  }

  async onModuleInit() {
    // The account the agent posts as. Inactive: it cannot sign in and never appears in people lists.
    const user = await this.db.user.upsert({
      where: { email: AGENT_EMAIL },
      update: {},
      create: { email: AGENT_EMAIL, name: "Waypoint Agent", role: "DISPATCHER", isActive: false, passwordHash: await bcrypt.hash(randomUUID(), 4) },
    })
    this.agentUser = { sub: user.id, role: "DISPATCHER", name: user.name, depotId: user.depotId, outletId: null, vehicleId: null }
    // A run cut short by a restart is not running any more.
    await this.db.issueAgent.updateMany({ where: { status: "THINKING" }, data: { status: "FAILED", error: "The server restarted during a run. Ask the agent to continue." } })
    this.issueChat.onMemberMessage((e) => this.onReply(e))
    if (!this.client) this.log.warn("GEMINI_API_KEY is not set: the issue agent is turned off")
  }

  // ───────────────────────────── Reading ─────────────────────────────

  async get(issueId: string): Promise<AgentSessionDto> {
    const issue = await this.db.issue.findUnique({ where: { id: issueId }, select: { status: true } })
    if (!issue) throw new NotFoundException("Issue not found")
    let session = await this.session(issueId)
    // Resolved by hand: the agent's work is over too.
    if (session && issue.status === "RESOLVED" && session.status !== "DONE" && session.status !== "THINKING") {
      await this.db.issueAgent.update({ where: { id: session.id }, data: { status: "DONE", waitingFor: null } })
      session = await this.session(issueId)
    }
    return this.toDto(session)
  }

  // ───────────────────────────── Dispatcher controls ─────────────────────────────

  /** "Ask agent", "Continue" and "Re-plan": run now, optionally with what the dispatcher wants. */
  async start(user: SessionUser, issueId: string, feedback?: string) {
    this.requireClient()
    const issue = await this.db.issue.findUnique({ where: { id: issueId }, select: { status: true } })
    if (!issue) throw new NotFoundException("Issue not found")
    if (issue.status === "RESOLVED") throw new ConflictException("The issue is already resolved")
    const session = await this.ensureSession(issueId, user)
    if (feedback) await this.db.issueAgentNote.create({ data: { agentId: session.id, kind: "FEEDBACK", body: feedback, authorId: user.sub } })
    // Show it working straight away; the run itself starts in the background.
    await this.db.issueAgent.update({ where: { id: session.id }, data: { status: "THINKING", error: null } })
    void this.run(issueId, feedback ? `The dispatcher (${user.name}) wrote to you: "${feedback}"` : session.runs ? `The dispatcher (${user.name}) asked you to continue.` : `The dispatcher (${user.name}) asked you to work on this issue.`)
    return this.get(issueId)
  }

  /** Stop waiting or working; the dispatcher takes it from here (the plan stays visible). */
  async stop(user: SessionUser, issueId: string) {
    const session = await this.session(issueId)
    if (!session) throw new NotFoundException("The agent has not worked on this issue")
    clearTimeout(this.wakeTimers.get(issueId))
    this.wakeTimers.delete(issueId)
    await this.db.$transaction([
      this.db.issueAgent.update({ where: { id: session.id }, data: { status: "IDLE", waitingFor: null, waitingSince: null } }),
      this.db.issueAgentNote.create({ data: { agentId: session.id, kind: "RUN", body: `${user.name} stopped the agent.`, authorId: user.sub } }),
    ])
    this.emit(issueId, "IDLE")
    return this.get(issueId)
  }

  async approve(user: SessionUser, issueId: string, stepId: string, input: AgentApproveInput, opts: { follow?: boolean } = {}) {
    const { session, step } = await this.openStep(issueId, stepId)
    const kind = step.kind as AgentStepKind
    const merged = { ...(step.payload as Record<string, unknown>), ...(input.payload ?? {}) }
    const parsed = agentStepPayloadSchemas[kind].safeParse(merged)
    if (!parsed.success) throw new BadRequestException(`That ${kind} step is not valid: ${parsed.error.issues.map((i) => i.message).join("; ")}`)
    const edited = !!input.payload && JSON.stringify(parsed.data) !== JSON.stringify(step.payload)

    let status: "DONE" | "FAILED" = "DONE"
    let result: string
    try {
      result = await this.execute(user, issueId, kind, parsed.data as Record<string, unknown>)
    } catch (e) {
      status = "FAILED"
      result = e instanceof Error ? e.message : "The step could not be carried out"
    }
    await this.db.issueAgentStep.update({
      where: { id: step.id },
      data: { status, result, edited, payload: parsed.data as Prisma.InputJsonValue, decidedById: user.sub, decidedAt: new Date() },
    })
    this.emit(issueId, session.status as AgentStatus)
    if (opts.follow !== false) await this.afterDecision(issueId)
    return { status, result }
  }

  async skip(user: SessionUser, issueId: string, stepId: string, reason?: string) {
    const { step } = await this.openStep(issueId, stepId)
    await this.db.issueAgentStep.update({ where: { id: step.id }, data: { status: "SKIPPED", result: reason?.trim() || "Skipped by the dispatcher", decidedById: user.sub, decidedAt: new Date() } })
    await this.afterDecision(issueId)
    return this.get(issueId)
  }

  /** Approve the latest plan's open steps in order, stopping at the first that fails. */
  async approveAll(user: SessionUser, issueId: string) {
    const session = await this.session(issueId)
    if (!session) throw new NotFoundException("The agent has not worked on this issue")
    const open = session.steps.filter((s) => s.plan === session.plan && s.status === "PROPOSED").sort((a, b) => a.seq - b.seq)
    if (!open.length) throw new ConflictException("There are no steps waiting for approval")
    for (const s of open) {
      const r = await this.approve(user, issueId, s.id, {}, { follow: false })
      if (r.status === "FAILED") break
    }
    await this.afterDecision(issueId)
    return this.get(issueId)
  }

  /** The agent learns what dispatch did: carry on when the plan is used up or a step failed. */
  private async afterDecision(issueId: string) {
    const [issue, session] = await Promise.all([this.db.issue.findUniqueOrThrow({ where: { id: issueId }, select: { status: true } }), this.session(issueId)])
    if (!session) return
    if (issue.status === "RESOLVED") {
      await this.db.issueAgent.update({ where: { id: session.id }, data: { status: "DONE", waitingFor: null, waitingSince: null } })
      this.emit(issueId, "DONE")
      return
    }
    const latest = session.steps.filter((s) => s.plan === session.plan)
    const failed = latest.find((s) => s.status === "FAILED")
    if (failed) return void this.run(issueId, `A step failed: "${failed.title}" (${failed.result}). Find out why and propose how to continue.`)
    if (latest.length && latest.every((s) => s.status !== "PROPOSED")) void this.run(issueId, "The dispatcher has acted on every step of your plan. Continue from the outcome.")
    else this.emit(issueId, session.status as AgentStatus)
  }

  /** Carry out an approved step as the approving dispatcher, through the same services as the manual buttons. */
  private async execute(user: SessionUser, issueId: string, kind: AgentStepKind, payload: Record<string, unknown>): Promise<string> {
    switch (kind) {
      case "acknowledge": {
        const issue = await this.db.issue.findUniqueOrThrow({ where: { id: issueId }, select: { status: true, ref: true } })
        if (issue.status !== "OPEN") return `${issue.ref} was already ${issue.status.toLowerCase()}.`
        await this.issues.acknowledge(user, issueId)
        return `${issue.ref} acknowledged.`
      }
      case "invite": {
        const chatId = await this.issueChat.ensure(issueId)
        if (!chatId) throw new ConflictException("This issue has no chat")
        const detail = await this.issueChat.invite(user, chatId, { userId: String(payload.userId) })
        const who = detail.chat.members.find((m) => m.id === payload.userId)
        return `${who?.name ?? "They"} added to the issue chat.`
      }
      case "decision": {
        const input = issueActionSchema.parse(payload.decision)
        const r = await this.actions.run(user, issueId, input)
        return r.summary
      }
      case "resolve": {
        const p = agentStepPayloadSchemas.resolve.parse(payload)
        await this.issues.resolve(user, issueId, { actions: p.playbook, resolution: p.resolution })
        return "Issue resolved and the chat closed."
      }
    }
  }

  // ───────────────────────────── Waking on replies ─────────────────────────────

  private onReply(e: { issueId: string; senderName: string; body: string }) {
    void this.db.issueAgent.findUnique({ where: { issueId: e.issueId }, select: { status: true } }).then((s) => {
      if (s?.status !== "WAITING") return
      clearTimeout(this.wakeTimers.get(e.issueId))
      this.wakeTimers.set(
        e.issueId,
        setTimeout(() => {
          this.wakeTimers.delete(e.issueId)
          void this.run(e.issueId, `${e.senderName} replied in the issue chat.`)
        }, WAKE_DEBOUNCE_MS),
      )
    })
  }

  // ───────────────────────────── The run ─────────────────────────────

  /** One turn of the agent: read everything, maybe talk in the chat, end by planning or waiting. */
  private async run(issueId: string, trigger: string) {
    if (!this.client || !this.agentUser) return
    if (this.running.has(issueId)) {
      this.rerun.set(issueId, trigger) // run again once this one is done
      return
    }
    this.running.add(issueId)
    const session = await this.ensureSession(issueId)
    await this.db.issueAgent.update({ where: { id: session.id }, data: { status: "THINKING", error: null, runs: { increment: 1 }, lastRunAt: new Date() } })
    this.emit(issueId, "THINKING")

    let outcome: { status: AgentStatus; error?: string } = { status: "FAILED", error: "The agent stopped without a plan." }
    try {
      const ctx = await this.context(issueId)
      const contents: Content[] = [{ role: "user", parts: [{ text: await this.brief(ctx, session.id, trigger) }] }]
      let nudged = false
      let model = MODEL
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        let res: Awaited<ReturnType<AgentService["generate"]>>
        try {
          res = await this.generate(contents, model)
        } catch (e) {
          // Only switch before the conversation has model turns: thought signatures are tied to the model.
          if (turn > 0 || model === FALLBACK_MODEL || !(e instanceof ApiError && (e.status === 503 || e.status === 429))) throw e
          this.log.warn(`${model} is busy; using ${FALLBACK_MODEL} for this run`)
          model = FALLBACK_MODEL
          res = await this.generate(contents, model)
        }
        const candidate = res.candidates?.[0]
        const u = res.usageMetadata
        this.log.log(`${ctx.issue.ref} turn ${turn + 1}: ${candidate?.finishReason ?? "no candidate"} · in ${u?.promptTokenCount ?? 0} (cached ${u?.cachedContentTokenCount ?? 0}) · out ${u?.candidatesTokenCount ?? 0}`)

        if (!candidate?.content) {
          outcome = { status: "FAILED", error: res.promptFeedback?.blockReason ? `Gemini blocked the request (${res.promptFeedback.blockReason}). Handle it manually.` : "Gemini returned no answer. Try again." }
          break
        }
        if (candidate.finishReason === "SAFETY" || candidate.finishReason === "PROHIBITED_CONTENT" || candidate.finishReason === "BLOCKLIST") {
          outcome = { status: "FAILED", error: "Gemini declined to work on this issue. Handle it manually." }
          break
        }
        // Keep the model's turn exactly as returned (it may carry thought signatures Gemini needs back).
        contents.push(candidate.content)
        const calls = res.functionCalls ?? []
        if (!calls.length) {
          if (candidate.finishReason === "MAX_TOKENS") {
            outcome = { status: "FAILED", error: "The agent's answer was cut off. Ask it to continue." }
            break
          }
          if (nudged) break
          nudged = true
          contents.push({ role: "user", parts: [{ text: "Finish this turn by calling propose_plan or wait_for_replies." }] })
          continue
        }

        const results: Part[] = []
        let ended: AgentStatus | null = null
        for (const call of calls) {
          const r = await this.tool(ctx, session.id, call)
          results.push({ functionResponse: { id: call.id, name: call.name, response: r.error ? { error: r.content } : { output: r.content } } })
          if (r.ended) ended = r.ended
        }
        if (ended) {
          outcome = { status: ended }
          break
        }
        contents.push({ role: "user", parts: results })
      }
    } catch (e) {
      outcome = { status: "FAILED", error: this.describe(e) }
      this.log.error(`run failed for ${issueId}: ${outcome.error}`)
    } finally {
      if (outcome.status === "FAILED") {
        await this.db.issueAgent.update({ where: { id: session.id }, data: { status: "FAILED", error: outcome.error } })
        await this.db.issueAgentNote.create({ data: { agentId: session.id, kind: "RUN", body: outcome.error ?? "The run failed." } })
      }
      this.emit(issueId, outcome.status)
      this.running.delete(issueId)
      const next = this.rerun.get(issueId)
      if (next) {
        this.rerun.delete(issueId)
        void this.run(issueId, next)
      }
    }
  }

  /** One model call, retried briefly when Gemini is busy or rate-limiting. */
  private async generate(contents: Content[], model: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client!.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: AGENT_SYSTEM_PROMPT,
            tools: [{ functionDeclarations: AGENT_TOOLS }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            maxOutputTokens: 8192,
          },
        })
      } catch (e) {
        const busy = e instanceof ApiError && (e.status === 503 || e.status === 429)
        if (!busy || attempt >= RETRIES) throw e
        this.log.warn(`Gemini ${e.status}; retrying (${attempt + 1}/${RETRIES})`)
        await new Promise((r) => setTimeout(r, 3_000 * 2 ** attempt))
      }
    }
  }

  private describe(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 400 && /api key/i.test(e.message)) return "The Gemini API key was rejected. Check GEMINI_API_KEY."
      if (e.status === 401 || e.status === 403) return "The Gemini API key was rejected or cannot use this model. Check GEMINI_API_KEY."
      if (e.status === 404) return `Gemini has no model "${MODEL}" for this key. Set GEMINI_MODEL to a model your key can use.`
      if (e.status === 429) return "The Gemini free-tier limit was reached. Try again in a minute."
      if (e.status === 503) return "Gemini is overloaded right now. Try again in a minute."
      if (e.status >= 500) return `Gemini is having problems right now (${e.status}). Try again shortly.`
      return `Gemini returned an error (${e.status}): ${e.message.slice(0, 200)}`
    }
    if (e instanceof TypeError && /fetch/i.test(e.message)) return "Could not reach Gemini. Check the server's internet connection."
    return e instanceof Error ? e.message : "Unexpected error"
  }

  // ───────────────────────────── Tools ─────────────────────────────

  private async tool(ctx: RunContext, agentId: string, use: FunctionCall): Promise<{ content: string; error?: boolean; ended?: AgentStatus }> {
    const schema = toolInput[use.name as keyof typeof toolInput]
    if (!schema) return { content: `Unknown tool ${use.name}`, error: true }
    const parsed = schema.safeParse(use.args ?? {})
    if (!parsed.success) return { content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, error: true }
    const input = parsed.data as Record<string, unknown>
    try {
      switch (use.name) {
        case "get_outlet_orders":
          return { content: await this.outletOrders(String(input.outletId ?? ctx.issue.outlet?.id ?? ctx.issue.outletId ?? "")) }
        case "get_trip_status":
          return { content: await this.tripStatus(String(input.tripId ?? ctx.issue.trip?.id ?? "")) }
        case "send_chat_message": {
          if (ctx.chatPosts >= MAX_CHAT_PER_RUN) return { content: "You have already posted enough this turn. Wait for replies or propose a plan.", error: true }
          const text = String(input.text)
          await this.issueChat.postAs(this.agentUser!.sub, ctx.issue.id, text)
          ctx.chatPosts++
          await this.db.issueAgentNote.create({ data: { agentId, kind: "CHAT", body: text } })
          return { content: "Posted in the issue chat." }
        }
        case "wait_for_replies": {
          const i = input as { waitingFor: string; question: string; diagnosis: string }
          await this.db.$transaction([
            this.db.issueAgent.update({ where: { id: agentId }, data: { status: "WAITING", waitingFor: `${i.waitingFor}: ${i.question}`, waitingSince: new Date(), diagnosis: i.diagnosis } }),
            this.db.issueAgentNote.create({ data: { agentId, kind: "RUN", body: `Waiting for ${i.waitingFor}.` } }),
          ])
          return { content: "Waiting. You will be run again when someone replies.", ended: "WAITING" }
        }
        case "propose_plan":
          return await this.proposePlan(ctx, agentId, input as { diagnosis: string; steps: { kind: string; title: string; rationale: string; payload: Record<string, unknown> }[] })
      }
    } catch (e) {
      return { content: e instanceof Error ? e.message : "The tool failed", error: true }
    }
    return { content: `Unknown tool ${use.name}`, error: true }
  }

  /** Check every step against what is possible right now, then make it the current plan. */
  private async proposePlan(ctx: RunContext, agentId: string, input: { diagnosis: string; steps: { kind: string; title: string; rationale: string; payload: Record<string, unknown> }[] }) {
    const problems: string[] = []
    const steps = input.steps.map((s, i) => {
      const kind = s.kind as AgentStepKind
      const parsed = agentStepPayloadSchemas[kind].safeParse(s.payload)
      if (!parsed.success) {
        problems.push(`Step ${i + 1} (${kind}): ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`)
        return null
      }
      const payload = parsed.data as Record<string, unknown>
      if (kind === "acknowledge" && ctx.issue.status !== "OPEN") problems.push(`Step ${i + 1}: the issue is already ${ctx.issue.status.toLowerCase()}, leave acknowledge out.`)
      if (kind === "invite") {
        const who = ctx.candidates.find((c) => c.id === payload.userId)
        if (!who) problems.push(`Step ${i + 1}: ${String(payload.userId)} is not in the list of people who can be invited.`)
        else Object.assign(payload, { name: who.name, relation: who.relation })
      }
      if (kind === "decision") {
        const action = (payload.decision as { action: string }).action
        const option = ctx.options.find((o) => o.id === action)
        const acknowledges = input.steps.some((x) => x.kind === "acknowledge")
        if (!option) problems.push(`Step ${i + 1}: ${action} is not a decision this issue offers.`)
        else if (!option.available && !(acknowledges && /acknowledge/i.test(option.unavailableReason ?? ""))) problems.push(`Step ${i + 1}: ${action} is unavailable: ${option.unavailableReason}`)
      }
      if (kind === "resolve") {
        const known = new Set(ctx.issue.playbook.map((p) => p.id))
        const unknown = (payload.playbook as string[]).filter((p) => !known.has(p))
        if (unknown.length) problems.push(`Step ${i + 1}: unknown playbook ids ${unknown.join(", ")}. Use: ${[...known].join(", ")}.`)
        if (i !== input.steps.length - 1) problems.push(`Step ${i + 1}: resolve closes the issue, so it must be the last step.`)
      }
      return { kind, title: s.title, rationale: s.rationale, payload }
    })
    if (problems.length) return { content: `The plan was not saved. Fix these and call propose_plan again:\n- ${problems.join("\n- ")}`, error: true }

    await this.db.$transaction(async (tx) => {
      const agent = await tx.issueAgent.update({ where: { id: agentId }, data: { plan: { increment: 1 }, status: "PLAN_READY", diagnosis: input.diagnosis, waitingFor: null, waitingSince: null } })
      await tx.issueAgentStep.updateMany({ where: { agentId, status: "PROPOSED", plan: { lt: agent.plan } }, data: { status: "SUPERSEDED" } })
      await tx.issueAgentStep.createMany({
        data: steps.map((s, seq) => ({ agentId, plan: agent.plan, seq: seq + 1, kind: s!.kind, title: s!.title, rationale: s!.rationale, payload: s!.payload as Prisma.InputJsonValue })),
      })
      await tx.issueAgentNote.create({ data: { agentId, kind: "RUN", body: steps.length ? `Proposed plan ${agent.plan} with ${steps.length} step${steps.length === 1 ? "" : "s"}.` : `Shared its view (plan ${agent.plan}); nothing to approve.` } })
    })
    return { content: "Plan saved for the dispatcher.", ended: "PLAN_READY" as const }
  }

  private async outletOrders(outletId: string) {
    if (!outletId) return "This issue has no outlet."
    // "Yesterday" on the operating calendar (the demo runs on its own date, not the wall clock).
    const from = new Date(new Date(`${await this.clock.operatingDate()}T00:00:00Z`).getTime() - 86_400_000)
    const orders = await this.db.order.findMany({
      where: { outletId, deliveryDate: { gte: from }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      orderBy: { deliveryDate: "asc" },
      take: 12,
      select: { ref: true, status: true, deliveryDate: true, units: true, temp: true, carriedFrom: { select: { ref: true } }, lines: { select: { description: true, quantity: true } } },
    })
    if (!orders.length) return `No orders for ${outletId} from yesterday onwards.`
    return orders
      .map((o) => `${o.ref} · ${o.status} · ${toDateOnly(o.deliveryDate)} · ${o.units} units · ${o.temp}${o.carriedFrom ? ` · carry-over of ${o.carriedFrom.ref}` : ""} · ${o.lines.map((l) => `${l.quantity}×${l.description}`).join(", ")}`)
      .join("\n")
  }

  private async tripStatus(tripId: string) {
    if (!tripId) return "This issue has no trip."
    const t = await this.db.trip.findUnique({
      where: { id: tripId },
      select: {
        ref: true,
        status: true,
        plannedDepartMin: true,
        vehicle: { select: { id: true, type: true, temp: true, status: true } },
        driver: { select: { name: true } },
        stops: { orderBy: { seq: "asc" }, select: { seq: true, status: true, plannedArrivalMin: true, etaMin: true, atRisk: true, riskReason: true, order: { select: { ref: true, outlet: { select: { id: true, name: true } } } } } },
      },
    })
    if (!t) return "Trip not found."
    const head = `${t.ref} · ${t.status} · ${t.vehicle.id} (${t.vehicle.type}, ${t.vehicle.temp}, ${t.vehicle.status}) · driver ${t.driver?.name ?? "none"} · departs ${minToHHMM(t.plannedDepartMin)}`
    const stops = t.stops.map(
      (s) => `  stop ${s.seq}: ${s.order.outlet.id} ${s.order.outlet.name} · ${s.order.ref} · ${s.status} · planned ${minToHHMM(s.plannedArrivalMin)}${s.etaMin != null ? ` · ETA ${minToHHMM(s.etaMin)}` : ""}${s.atRisk ? ` · AT RISK: ${s.riskReason ?? ""}` : ""}`,
    )
    return [head, ...stops].join("\n")
  }

  // ───────────────────────────── Context ─────────────────────────────

  private async context(issueId: string): Promise<RunContext> {
    const issue = await this.issues.get(issueId)
    const [actions, chatId] = await Promise.all([this.actions.options(this.agentUser!, issueId), this.issueChat.ensure(issueId, { notify: false })])
    const candidates = chatId ? await this.issueChat.candidates(this.agentUser!, chatId).catch(() => []) : []
    return { issue, options: actions.actions, candidates, chatId, chatPosts: 0 }
  }

  /** The situation as text: the issue, what can be done, the people, the chat and what happened so far. */
  private async brief(ctx: RunContext, agentId: string, trigger: string): Promise<string> {
    const { issue: i } = ctx
    const [chat, session, today] = await Promise.all([
      ctx.chatId
        ? this.db.issueChat.findUnique({
            where: { id: ctx.chatId },
            select: {
              closedAt: true,
              members: { select: { relation: true, user: { select: { id: true, name: true, role: true } } } },
              messages: { orderBy: { createdAt: "desc" }, take: 40, select: { kind: true, body: true, createdAt: true, sender: { select: { name: true, role: true, email: true } } } },
            },
          })
        : null,
      this.db.issueAgent.findUniqueOrThrow({ where: { id: agentId }, include: { steps: { orderBy: [{ plan: "desc" }, { seq: "asc" }], take: 24 }, notes: { orderBy: { createdAt: "asc" }, take: 30 } } }),
      this.clock.operatingDate(),
    ])

    const lines: string[] = []
    const add = (s = "") => lines.push(s)
    add(`Operating date: ${today}. Now: ${new Date().toISOString()}.`)
    add(`Why you are running now: ${trigger}`)
    add()
    add(`# Issue ${i.ref}: ${ISSUE_TYPE_META[i.type].label} [${i.type}]`)
    add(`Status ${i.status} · severity ${i.severity} · stage ${i.stage} · raised ${i.createdAt.toISOString()} by ${i.reportedBy.name} (${ROLE_LABEL[i.reportedBy.role as Role] ?? i.reportedBy.role})`)
    add(`Report: ${i.description}`)
    if (i.quantity != null) add(`Quantity reported: ${i.quantity}`)
    add(`Photos attached: ${i.photos.length}`)
    if (i.orderLine) add(`Affected line: ${i.orderLine.quantity} × ${i.orderLine.description} (${i.orderLine.category}), ${i.orderLine.weightKg} kg`)
    if (i.order) add(`Order ${i.order.ref} · ${i.order.temp} · ${i.order.units} units · ${i.order.weightKg} kg · lines: ${i.order.lines.map((l) => `${l.quantity}×${l.description}`).join(", ")}`)
    if (i.trip) add(`Trip ${i.trip.ref} · ${i.trip.status} · vehicle ${i.trip.vehicleId} · driver ${i.trip.driver?.name ?? "none"} · departs ${minToHHMM(i.trip.plannedDepartMin)} · plan v${i.trip.plan.version} ${i.trip.plan.status} for ${toDateOnly(i.trip.plan.date)}`)
    if (i.stop) add(`Stop ${i.stop.seq} · ${i.stop.status} · planned ${minToHHMM(i.stop.plannedArrivalMin)}`)
    if (i.outlet) add(`Outlet ${i.outlet.id} ${i.outlet.name} · ${i.outlet.districtId} · receiving ${minToHHMM(i.outlet.windowOpenMin)}-${minToHHMM(i.outlet.windowCloseMin)}`)
    if (i.vehicle) add(`Vehicle ${i.vehicle.id} · ${i.vehicle.type} · ${i.vehicle.temp} · ${i.vehicle.status}`)
    if (i.carryOverOrder) add(`Already carried over on ${i.carryOverOrder.ref} (${i.carryOverOrder.status}, ${toDateOnly(i.carryOverOrder.deliveryDate)})`)
    if (i.resolution) add(`Resolution: ${i.resolution}`)
    add(`History: ${i.history.map((h) => `${h.action}${h.actor ? ` by ${h.actor.name}` : ""} at ${h.createdAt.toISOString()}`).join("; ")}`)
    add(`Playbook follow-ups for resolve: ${i.playbook.map((p) => `${p.id} (${p.label})`).join(", ")}`)

    add()
    add("# Decisions this issue offers right now")
    if (!ctx.options.length) add("None: the issue is not linked to an order, trip or vehicle.")
    for (const o of ctx.options)
      add(`- ${o.id}: ${o.label} · target ${o.target ?? "-"} · ${o.available ? "available" : `UNAVAILABLE (${o.unavailableReason})`}${o.defaultReason ? ` · suggested reason ${o.defaultReason}` : ""}${o.canShortShip != null ? ` · can also ship short: ${o.canShortShip}` : ""}${o.pendingStops != null ? ` · pending stops ${o.pendingStops}` : ""}`)

    add()
    add("# Issue chat")
    if (!chat) add("There is no chat for this issue.")
    else {
      if (chat.closedAt) add("The chat is CLOSED: you cannot post.")
      add(`Members: ${chat.members.map((m) => `${m.user.name} (${ROLE_LABEL[m.user.role as Role]}; ${m.relation})`).join(", ") || "none"}`)
      const msgs = [...chat.messages].reverse()
      if (!msgs.length) add("No messages yet.")
      for (const m of msgs) {
        const who = m.kind === "SYSTEM" ? "system" : m.sender?.email === AGENT_EMAIL ? "you (Waypoint Agent)" : `${m.sender?.name ?? "?"} (${ROLE_LABEL[m.sender?.role as Role] ?? m.sender?.role})`
        add(`[${m.createdAt.toISOString()}] ${who}: ${m.body}`)
      }
    }
    add(`People who can be invited (use the id): ${ctx.candidates.length ? ctx.candidates.map((c) => `${c.id} = ${c.name} (${ROLE_LABEL[c.role]}; ${c.relation})`).join("; ") : "nobody"}`)

    if (session.steps.length) {
      add()
      add("# Your earlier plans and what the dispatcher did")
      for (const s of session.steps)
        add(`- plan ${s.plan} step ${s.seq} [${s.kind}] "${s.title}": ${s.status}${s.edited ? " (edited by the dispatcher)" : ""}${s.result ? ` · ${s.result}` : ""} · payload ${JSON.stringify(s.payload)}`)
    }
    const feedback = session.notes.filter((n) => n.kind === "FEEDBACK")
    if (feedback.length) {
      add()
      add("# What the dispatcher told you (follow this)")
      for (const n of feedback) add(`- [${n.createdAt.toISOString()}] ${n.body}`)
    }
    if (session.diagnosis) {
      add()
      add(`Your previous diagnosis: ${session.diagnosis}`)
    }
    if (session.waitingFor) add(`You were waiting for: ${session.waitingFor} (since ${session.waitingSince?.toISOString()})`)
    return lines.join("\n")
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private requireClient() {
    if (!this.client) throw new ConflictException("The issue agent is not configured: set GEMINI_API_KEY on the server.")
  }

  private session(issueId: string): Promise<Session | null> {
    return this.db.issueAgent.findUnique({ where: { issueId }, include: { steps: { orderBy: [{ plan: "desc" }, { seq: "asc" }] }, notes: { orderBy: { createdAt: "asc" } } } })
  }

  private async ensureSession(issueId: string, by?: SessionUser) {
    return this.db.issueAgent.upsert({ where: { issueId }, update: {}, create: { issueId, startedById: by?.sub } })
  }

  private async openStep(issueId: string, stepId: string) {
    const session = await this.session(issueId)
    const step = session?.steps.find((s) => s.id === stepId)
    if (!session || !step) throw new NotFoundException("Step not found")
    if (step.status !== "PROPOSED") throw new ConflictException(`That step is already ${step.status.toLowerCase()}`)
    if (step.plan !== session.plan) throw new ConflictException("That step belongs to an older plan")
    if (session.status === "THINKING") throw new ConflictException("The agent is still working; wait for it to finish")
    return { session, step }
  }

  private emit(issueId: string, status: AgentStatus) {
    this.gateway.publishTo("", [], "agent:update", { issueId, status } satisfies AgentUpdateEvent)
  }

  private async toDto(s: Session | null): Promise<AgentSessionDto> {
    const configured = !!this.client
    if (!s) return { configured, status: "IDLE", diagnosis: null, waitingFor: null, waitingSince: null, error: null, plan: 0, runs: 0, lastRunAt: null, steps: [], notes: [] }
    const ids = [...new Set([...s.steps.map((x) => x.decidedById), ...s.notes.map((n) => n.authorId)].filter((x): x is string => !!x))]
    const names = new Map((await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
    return {
      configured,
      status: s.status,
      diagnosis: s.diagnosis,
      waitingFor: s.waitingFor,
      waitingSince: s.waitingSince?.toISOString() ?? null,
      error: s.error,
      plan: s.plan,
      runs: s.runs,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      steps: s.steps.map((x) => ({
        id: x.id,
        plan: x.plan,
        seq: x.seq,
        kind: x.kind as AgentStepKind,
        title: x.title,
        rationale: x.rationale,
        payload: x.payload as Record<string, unknown>,
        status: x.status,
        edited: x.edited,
        result: x.result,
        decidedBy: x.decidedById ? (names.get(x.decidedById) ?? null) : null,
        decidedAt: x.decidedAt?.toISOString() ?? null,
      })),
      notes: s.notes.map((n) => ({ id: n.id, kind: n.kind as "FEEDBACK" | "CHAT" | "RUN", body: n.body, author: n.authorId ? (names.get(n.authorId) ?? null) : null, createdAt: n.createdAt.toISOString() })),
    }
  }
}
