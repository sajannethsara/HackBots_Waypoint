import { Injectable, type OnModuleInit } from "@nestjs/common"
import type { DemoFeedItem } from "@waypoint/shared"
import { PrismaService } from "../../common/prisma.service"

const KEY = "demo"
const FEED_MAX = 40

interface DemoData {
  on: boolean
  /** Event id → simulated minute it fired. */
  fired: Record<string, number>
  /** Trip id → simulated minute the gate let it out (the replay leaves no earlier than this). */
  launch: Record<string, number>
  /** Trips the demo touched, so switching the demo off puts them back. */
  touched: string[]
  feed: DemoFeedItem[]
}

/** Fresh objects every time: the maps below are mutated while the day plays. */
const empty = (): DemoData => ({ on: false, fired: {}, launch: {}, touched: [], feed: [] })

/** Demo state: on/off, which scripted events already happened, and when each trip was released. */
@Injectable()
export class DemoService implements OnModuleInit {
  private data: DemoData = empty()
  private dirty = false

  constructor(private readonly db: PrismaService) {}

  async onModuleInit() {
    const saved = await this.db.appSetting.findUnique({ where: { key: KEY } })
    if (saved?.value && typeof saved.value === "object") this.data = { ...empty(), ...(saved.value as unknown as DemoData) }
  }

  isOn() {
    return this.data.on
  }
  launchMin(tripId: string) {
    return this.data.launch[tripId]
  }
  recordLaunch(tripId: string, minute: number) {
    this.data.launch[tripId] = Math.round(minute * 10) / 10
    this.dirty = true
  }
  fired(id: string) {
    return id in this.data.fired
  }
  fire(id: string, item: Omit<DemoFeedItem, "id">) {
    this.data.fired[id] = item.minute
    this.data.feed = [{ id, ...item }, ...this.data.feed].slice(0, FEED_MAX)
    this.dirty = true
  }
  mark(id: string, minute: number) {
    this.data.fired[id] = minute
    this.dirty = true
  }
  touch(tripId: string) {
    if (!this.data.touched.includes(tripId)) this.data.touched.push(tripId)
    this.dirty = true
  }
  feed() {
    return this.data.feed
  }
  touched() {
    return [...this.data.touched]
  }

  async setOn(on: boolean) {
    this.data.on = on
    this.dirty = true
    await this.save()
  }

  /** Forget everything the demo did (not the on/off switch). */
  async clear() {
    this.data = { ...empty(), on: this.data.on }
    this.dirty = true
    await this.save()
  }

  async save() {
    if (!this.dirty) return
    this.dirty = false
    await this.db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: this.data as never }, update: { value: this.data as never } })
  }
}

