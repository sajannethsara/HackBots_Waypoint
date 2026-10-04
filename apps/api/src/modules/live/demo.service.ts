import { Body, Controller, Get, Injectable, Logger, Post, Query, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { z } from "zod"
import { dateOnly, type DemoFeedItem, type DemoState, type IssueStage, type IssueType } from "@waypoint/shared"
import { Roles } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"
import { IssuesService, type SystemIssue } from "../issues/issues.service"
import { DemoService } from "./demo-state.service"
import { LiveClockService } from "./live-clock.service"
import { LiveService } from "./live.service"

interface Ev {
  id: string
  at: number
  tone: DemoFeedItem["tone"]
  title: string
  body: string
  /** Happens, but is not worth a line in the storyline. */
  quiet?: boolean
  run?: () => Promise<void>
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`

/**
 * The demo day. Once a plan is published and the clock runs, a dispatcher's morning plays out around it:
 * loaders and drivers arrive and claim their trips (the gate opens a simulated minute later), a vehicle
 * will not start, a loader runs late, stock turns up short or damaged, a store is shut, a road is blocked
 * and a reefer alarms. Everything is raised as the people involved would raise it (claims, issues), so
 * the dispatcher works the day from the normal screens. Only the dispatcher side is touched.
 */
@Injectable()
export class DemoDirector implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DemoDirector.name)
  private timer?: NodeJS.Timeout
  private busy = false

  constructor(
    private readonly db: PrismaService,
    private readonly demo: DemoService,
    private readonly clock: LiveClockService,
    private readonly calendar: ClockService,
    private readonly live: LiveService,
    private readonly issues: IssuesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick().catch((e) => this.log.warn(`demo tick failed: ${e}`)), 2_000)
  }
  onModuleDestroy() {
    clearInterval(this.timer)
  }

  async tick() {
    if (this.busy || !this.demo.isOn()) return
    const now = this.clock.now()
    if (!now.running) return
    this.busy = true
    try {
      const date = await this.calendar.operatingDate()
      const plans = await this.db.plan.findMany({ where: { status: "PUBLISHED", date: dateOnly(date) }, orderBy: { version: "desc" }, select: { id: true, depotId: true, version: true } })
      const latest = [...new Map(plans.map((p) => [p.depotId, p])).values()]
      for (const p of latest) {
        const events = await this.script(p.id, p.depotId, p.version)
        for (const ev of events.filter((e) => e.at <= now.minute && !this.demo.fired(e.id)).sort((a, b) => a.at - b.at)) {
          await ev.run?.()
          if (ev.quiet) this.demo.mark(ev.id, ev.at)
          else this.demo.fire(ev.id, { minute: ev.at, tone: ev.tone, title: ev.title, body: ev.body })
        }
      }
      await this.demo.save()
      this.live.invalidate()
    } finally {
      this.busy = false
    }
  }

  /** Put every trip the demo touched back to how it was, and drop the demo's issues. */
  async revert() {
    const ids = this.demo.touched()
    if (ids.length)
      await this.db.trip.updateMany({
        where: { id: { in: ids }, departedAt: null },
        data: { driverClaimedAt: null, loaderClaimedAt: null, loaderId: null, heldAt: null, liveAt: null },
      })
    await this.issues.clearSystem("demo-")
    await this.demo.clear()
    this.live.invalidate()
  }

  private async script(planId: string, depotId: string, version: number): Promise<Ev[]> {
    const [trips, loaders] = await Promise.all([
      this.db.trip.findMany({
        where: { planId, stops: { some: {} }, status: { not: "CANCELLED" } },
        orderBy: [{ plannedDepartMin: "asc" }, { ref: "asc" }],
        select: {
          id: true, ref: true, vehicleId: true, brand: true, districtId: true, plannedDepartMin: true, plannedDurationMin: true, driverId: true,
          vehicle: { select: { temp: true, type: true } },
          stops: { orderBy: { seq: "asc" }, select: { id: true, seq: true, orderId: true, plannedArrivalMin: true, plannedServiceMin: true, order: { select: { ref: true, outletId: true } } } },
        },
      }),
      this.db.user.findMany({ where: { role: "LOADER", depotId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ])
    const n = trips.length
    if (!n) return []
    const T = trips.map((t) => ({ ...t, D: t.plannedDepartMin }))

    // Story trips: spread through the day, never the same trip twice.
    const used = new Set<string>()
    const story = (...preferred: number[]) => {
      for (const i of preferred) {
        const t = T[i % n]
        if (!used.has(t.id)) {
          used.add(t.id)
          return t
        }
      }
      const free = T.find((t) => !used.has(t.id)) ?? T[0]
      used.add(free.id)
      return free
    }
    const lateLoader = story(1, 2)
    const noStart = story(3, 4)
    const damaged = story(2, 5)
    const short = story(5, 6)
    const closed = story(6, 7)
    const blocked = story(8, 9)
    const reefer = T.find((t) => t.vehicle.temp === "REEFER" && !used.has(t.id)) ?? story(4, 10)
    used.add(reefer.id)

    const evs: Ev[] = []
    const issue = (id: string, at: number, tone: Ev["tone"], title: string, body: string, i: Omit<SystemIssue, "clientId">, trip: string) =>
      evs.push({ id, at, tone, title, body, run: async () => { await this.issues.raiseSystem([{ clientId: `demo-${id}`, ...i }]); this.demo.touch(trip) } })

    const claim = (t: (typeof T)[number], role: "driver" | "loader", at: number, idx: number) =>
      evs.push({
        id: `claim-${role}-${t.id}`,
        at,
        tone: "info",
        title: role === "driver" ? `${t.vehicleId} driver at the depot` : `${t.ref} loading started`,
        body: "",
        quiet: true,
        run: async () => {
          const now = new Date()
          if (role === "driver") {
            const driver = t.driverId ?? (await this.db.user.findFirst({ where: { vehicleId: t.vehicleId }, select: { id: true } }))?.id
            await this.db.trip.updateMany({ where: { id: t.id, liveAt: null }, data: { driverClaimedAt: now, ...(driver ? { driverId: driver } : {}) } })
          } else {
            const l = loaders[idx % Math.max(1, loaders.length)]
            await this.db.trip.updateMany({ where: { id: t.id, liveAt: null }, data: { loaderClaimedAt: now, ...(l ? { loaderId: l.id } : {}) } })
          }
          this.demo.touch(t.id)
        },
      })

    T.forEach((t, i) => {
      claim(t, "loader", t.id === lateLoader.id ? t.D + 22 : t.D - 40 + (i % 4) * 3, i)
      claim(t, "driver", t.id === noStart.id ? t.D + 48 : t.D - 24 + (i % 3) * 4, i)
    })

    const first = T[0]
    const last = [...T].sort((a, b) => b.D + b.plannedDurationMin - (a.D + a.plannedDurationMin))[0]
    const feed = (id: string, at: number, tone: Ev["tone"], title: string, body: string) => evs.push({ id, at, tone, title, body })

    feed("open", Math.max(195, first.D - 55), "info", `Depot opens · plan v${version} is out`, `${n} trips are published. Loaders and drivers will claim them before departure; the gate opens a minute after both have.`)
    feed("first-out", first.D, "good", `${first.ref} is first out`, `${first.vehicleId} · ${first.districtId} · ${first.stops.length} stops.`)

    feed("late-loader-warn", lateLoader.D, "warn", `${lateLoader.ref} is waiting for its loader`, `Departure time reached and nobody has claimed the load. Check the Depot gate tab, or message the loaders.`)
    evs.push({ id: "late-loader-ok", at: lateLoader.D + 22, tone: "good", title: `${lateLoader.ref} loader arrived`, body: "Loader claimed the trip 22 minutes late. The gate opens a minute from now; expect the stores to see it late." })

    issue("breakdown", noStart.D - 32, "alert", `${noStart.vehicleId} will not start`, `Driver reports a dead battery on ${noStart.ref} before departure. The trip cannot leave until it is fixed.`, {
      stage: "LOADING", type: "VEHICLE_BREAKDOWN", severity: "HIGH", description: `${noStart.vehicleId} will not start (flat battery) at the depot, so ${noStart.ref} cannot leave. Driver is waiting for the mechanic.`, tripId: noStart.id, vehicleId: noStart.vehicleId,
    }, noStart.id)
    evs.push({ id: "breakdown-fixed", at: noStart.D + 48, tone: "good", title: `${noStart.vehicleId} is running again`, body: `Mechanic jump-started the vehicle. The driver claimed ${noStart.ref}; it leaves about 50 minutes behind plan.` })

    issue("damaged", damaged.D - 14, "alert", `Damaged stock on ${damaged.ref}`, `Loader found crushed cartons while loading ${damaged.ref}.`, {
      stage: "LOADING", type: "LOAD_DAMAGED", severity: "MEDIUM", description: `Loader found crushed cartons on the pallet for ${damaged.ref} (${damaged.stops[0]?.order.ref}). Some units may not be deliverable.`, tripId: damaged.id, vehicleId: damaged.vehicleId, orderId: damaged.stops[0]?.orderId, outletId: damaged.stops[0]?.order.outletId,
    }, damaged.id)

    issue("short", short.D - 18, "warn", `Load short on ${short.ref}`, `Picker could not find the full quantity for ${short.stops.at(-1)?.order.ref}.`, {
      stage: "LOADING", type: "LOAD_MISSING", severity: "MEDIUM", description: `Two cartons are missing for ${short.stops.at(-1)?.order.ref} on ${short.ref}. Stock count does not match the order.`, tripId: short.id, vehicleId: short.vehicleId, orderId: short.stops.at(-1)?.orderId, outletId: short.stops.at(-1)?.order.outletId,
    }, short.id)

    const cs = closed.stops[Math.min(1, closed.stops.length - 1)]
    issue("closed", cs.plannedArrivalMin, "alert", `${cs.order.outletId} is shut`, `Driver on ${closed.ref} reached ${cs.order.outletId} and the store is closed.`, {
      stage: "DELIVERY", type: "OUTLET_CLOSED", severity: "MEDIUM", description: `${cs.order.outletId} is closed on arrival; ${cs.order.ref} cannot be handed over. Driver is holding at the door.`, tripId: closed.id, stopId: cs.id, orderId: cs.orderId, outletId: cs.order.outletId, vehicleId: closed.vehicleId,
    }, closed.id)

    const bs = blocked.stops[0]
    issue("blocked", bs.plannedArrivalMin - 6, "warn", `Road blocked near ${bs.order.outletId}`, `Flooding is blocking the usual route for ${blocked.ref}.`, {
      stage: "DELIVERY", type: "ACCESS_BLOCKED", severity: "HIGH", description: `A flooded road is blocking access to ${bs.order.outletId}; ${blocked.ref} is looking for another way round and will arrive late.`, tripId: blocked.id, stopId: bs.id, orderId: bs.orderId, outletId: bs.order.outletId, vehicleId: blocked.vehicleId,
    }, blocked.id)

    const rs = reefer.stops[0]
    issue("reefer", rs.plannedArrivalMin + 8, "alert", `Cold chain alarm on ${reefer.vehicleId}`, `Reefer temperature is rising on ${reefer.ref} with chilled orders on board.`, {
      stage: "DELIVERY", type: "TEMPERATURE", severity: "HIGH", description: `Reefer unit on ${reefer.vehicleId} shows 9 °C against a 4 °C limit while delivering chilled orders on ${reefer.ref}. Chilled stock may have to be refused or recalled.`, tripId: reefer.id, vehicleId: reefer.vehicleId,
    }, reefer.id)

    const mid = [...T].sort((a, b) => a.D - b.D)[Math.floor(n / 2)].D
    feed("half-out", mid + 10, "info", "Half the fleet is on the road", "Keep an eye on Live Operations and the Exceptions page for stops at risk.")
    feed("fresh-close", 8 * 60, "warn", "Fresh window closes", "Anything Fresh that has not been delivered by now is late. Review what is still pending.")
    feed("done", last.D + last.plannedDurationMin + 5, "good", "Last trip is back at the depot", "The day is complete. Compare what was planned with what happened.")
    return evs
  }
}

const toggleSchema = z.object({ on: z.boolean(), /** Start the day over even if the demo is already on (used at sign-in). */ fresh: z.boolean().optional() })

@Roles("DISPATCHER")
@Controller("demo")
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly director: DemoDirector,
    private readonly clock: LiveClockService,
    private readonly db: PrismaService,
    private readonly live: LiveService,
  ) {}

  @Get()
  async state(@Query("depotId") depotId: string, @Query("date") date: string): Promise<DemoState> {
    const plan = await this.db.plan.findFirst({ where: { depotId, date: dateOnly(date), status: "PUBLISHED" }, orderBy: { version: "desc" }, select: { version: true } })
    return { on: this.demo.isOn(), hasPlan: !!plan, planVersion: plan?.version ?? null, clock: this.clock.effective(this.demo.isOn()), feed: this.demo.feed() }
  }

  /** Switch demo on (the day starts at 03:15) or off (back to real mode; demo effects are removed). */
  @Post()
  async toggle(@Body(new ZodPipe(toggleSchema)) body: z.infer<typeof toggleSchema>) {
    if (body.on === this.demo.isOn() && !(body.on && body.fresh)) return { on: body.on }
    if (body.on) {
      // A fresh morning every time: nothing from an earlier run carries over.
      await this.director.revert()
      await this.demo.setOn(true)
      await this.clock.control("reset")
    } else {
      await this.clock.control("pause")
      await this.director.revert()
      await this.demo.setOn(false)
    }
    this.live.invalidate()
    return { on: body.on }
  }

  /** Start the demo day over: gate, issues and the clock go back to the morning. */
  @Post("restart")
  async restart() {
    await this.director.revert()
    await this.clock.control("reset")
    this.live.invalidate()
    return { ok: true }
  }
}
