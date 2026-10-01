import { Global, Injectable, Module } from "@nestjs/common"
import { toDateOnly } from "@waypoint/shared"
import { PrismaService } from "./prisma.service"

/**
 * The demo runs on a fixed operating date (seeded: 2026-01-08) so the judge walkthrough
 * always lands on the same peak day. Real deployments would use today's date.
 */
@Injectable()
export class ClockService {
  constructor(private readonly db: PrismaService) {}

  async operatingDate(): Promise<string> {
    const s = await this.db.appSetting.findUnique({ where: { key: "operatingDate" } })
    return typeof s?.value === "string" ? s.value : toDateOnly(new Date())
  }

  async calendar(date: string) {
    return this.db.calendarDay.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } })
  }

  /** Next operating day strictly after `date`. */
  async nextOperatingDay(date: string): Promise<string> {
    const next = await this.db.calendarDay.findFirst({
      where: { date: { gt: new Date(`${date}T00:00:00Z`) }, isOperating: true },
      orderBy: { date: "asc" },
    })
    return next ? toDateOnly(next.date) : date
  }
}

@Global()
@Module({ providers: [ClockService], exports: [ClockService] })
export class ClockModule {}
