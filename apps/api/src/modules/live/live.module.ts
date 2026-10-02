import { Body, Controller, Get, Module, Post, Query } from "@nestjs/common"
import { z } from "zod"
import { Roles } from "../../common/auth"
import { ZodPipe } from "../../common/zod.pipe"
import { IssuesModule } from "../issues/issues.module"
import { IssuesService } from "../issues/issues.service"
import { RoutingModule } from "../routing/routing.service"
import { LiveClockService } from "./live-clock.service"
import { LiveGateway } from "./live.gateway"
import { LiveService } from "./live.service"

const clockSchema = z.object({
  action: z.enum(["play", "pause", "reset", "seek", "speed"]),
  value: z.number().optional(),
})

@Roles("DISPATCHER")
@Controller("live")
export class LiveController {
  constructor(
    private readonly live: LiveService,
    private readonly clock: LiveClockService,
    private readonly gateway: LiveGateway,
    private readonly issues: IssuesService,
  ) {}

  /** Initial state for the page; updates then arrive over the WebSocket. */
  @Get("snapshot")
  snapshot(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.live.snapshot(depotId, date)
  }

  @Get("routes")
  routes(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.live.routes(depotId, date)
  }

  @Post("clock")
  async control(@Body(new ZodPipe(clockSchema)) body: z.infer<typeof clockSchema>) {
    const clock = await this.clock.control(body.action, body.value)
    // Restarting the day also withdraws issues that live monitoring raised in the previous run.
    if (body.action === "reset") await this.issues.clearSystem("sim-")
    this.live.invalidate()
    await this.gateway.broadcast()
    return clock
  }
}

@Module({
  imports: [IssuesModule, RoutingModule],
  controllers: [LiveController],
  providers: [LiveService, LiveClockService, LiveGateway],
  exports: [LiveService, LiveClockService],
})
export class LiveModule {}
