import { Controller, Get, Module } from "@nestjs/common"
import { Public } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"

@Controller("health")
export class HealthController {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
  ) {}

  @Public()
  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`
    return { status: "ok", operatingDate: await this.clock.operatingDate(), time: new Date().toISOString() }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
