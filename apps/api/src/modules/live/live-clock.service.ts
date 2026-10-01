import { Injectable, OnModuleInit } from "@nestjs/common"
import type { LiveClock } from "@waypoint/shared"
import { PrismaService } from "../../common/prisma.service"

interface ClockState {
  running: boolean
  speed: number
  /** Simulated minute at `baseAt`. */
  baseMin: number
  /** Real epoch ms when baseMin was set. */
  baseAt: number
}

const KEY = "liveClock"
const DAY_START = 3 * 60 + 15 // just before the Fresh window opens
const DAY_END = 18 * 60

/**
 * The operating day's clock for live operations. The demo day is in the past, so the
 * dispatcher can play it at any speed (1× real time up to 120×). Persisted in AppSetting.
 */
@Injectable()
export class LiveClockService implements OnModuleInit {
  private state: ClockState = { running: false, speed: 30, baseMin: DAY_START, baseAt: Date.now() }

  constructor(private readonly db: PrismaService) {}

  async onModuleInit() {
    const saved = await this.db.appSetting.findUnique({ where: { key: KEY } })
    if (saved?.value && typeof saved.value === "object") this.state = { ...this.state, ...(saved.value as unknown as ClockState) }
  }

  now(): LiveClock {
    const { running, speed, baseMin, baseAt } = this.state
    const elapsed = running ? ((Date.now() - baseAt) / 60_000) * speed : 0
    const minute = Math.min(DAY_END, baseMin + elapsed)
    return { minute: Math.round(minute * 10) / 10, running: running && minute < DAY_END, speed }
  }

  async control(action: "play" | "pause" | "reset" | "seek" | "speed", value?: number): Promise<LiveClock> {
    const current = this.now().minute
    if (action === "play") this.state = { ...this.state, running: true, baseMin: current, baseAt: Date.now() }
    if (action === "pause") this.state = { ...this.state, running: false, baseMin: current, baseAt: Date.now() }
    if (action === "reset") this.state = { ...this.state, running: false, baseMin: DAY_START, baseAt: Date.now() }
    if (action === "seek" && value != null)
      this.state = { ...this.state, baseMin: Math.max(0, Math.min(DAY_END, value)), baseAt: Date.now() }
    if (action === "speed" && value != null)
      this.state = { ...this.state, speed: Math.max(1, Math.min(120, value)), baseMin: current, baseAt: Date.now() }
    await this.db.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: this.state as never },
      update: { value: this.state as never },
    })
    return this.now()
  }
}
