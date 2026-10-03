import { Body, Controller, Delete, Get, Module, Param, Post, Put, Query } from "@nestjs/common"
import {
  assignOrderSchema,
  createTripSchema,
  deferOrderSchema,
  generatePlanSchema,
  saveLayoutSchema,
  tripLayoutSchema,
  type AssignOrderInput,
  type CreateTripInput,
  type DeferOrderInput,
  type GeneratePlanInput,
  type SaveLayoutInput,
  type TripLayoutInput,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ZodPipe } from "../../common/zod.pipe"
import { RoutingModule } from "../routing/routing.service"
import { PlanningService } from "./planning.service"

@Roles("DISPATCHER")
@Controller("plans")
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get("current")
  current(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.planning.current(depotId, date)
  }

  @Get("history")
  history(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.planning.history(depotId, date)
  }

  @Get("demand")
  demand(@Query("depotId") depotId: string, @Query("date") date: string) {
    return this.planning.demandOverview(depotId, date)
  }

  @Post("generate")
  generate(@CurrentUser() user: SessionUser, @Body(new ZodPipe(generatePlanSchema)) body: GeneratePlanInput) {
    return this.planning.generate(user, body)
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.planning.get(id)
  }

  @Post(":id/defer")
  defer(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(deferOrderSchema)) body: DeferOrderInput) {
    return this.planning.deferOrder(user, id, body)
  }

  @Post(":id/assign/check")
  check(@Param("id") id: string, @Body(new ZodPipe(assignOrderSchema)) body: AssignOrderInput) {
    return this.planning.checkAssign(id, body)
  }

  @Post(":id/assign")
  assign(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(assignOrderSchema)) body: AssignOrderInput) {
    return this.planning.assignOrder(user, id, body)
  }

  @Post(":id/trips/preview")
  preview(@Param("id") id: string, @Body(new ZodPipe(tripLayoutSchema)) body: TripLayoutInput) {
    return this.planning.previewTrip(id, body)
  }

  @Post(":id/trips")
  createTrip(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(createTripSchema)) body: CreateTripInput) {
    return this.planning.createTrip(user, id, body)
  }

  @Post(":id/trips/:tripId/reset")
  resetTrip(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("tripId") tripId: string) {
    return this.planning.resetTrip(user, id, tripId)
  }

  @Delete(":id/trips/:tripId")
  removeTrip(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("tripId") tripId: string) {
    return this.planning.removeTrip(user, id, tripId)
  }

  @Put(":id/layout")
  saveLayout(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(saveLayoutSchema)) body: SaveLayoutInput) {
    return this.planning.saveLayout(user, id, body)
  }

  @Post(":id/publish")
  publish(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.planning.publish(user, id)
  }

  @Delete(":id")
  discard(@Param("id") id: string) {
    return this.planning.discard(id)
  }
}

@Module({ imports: [RoutingModule], controllers: [PlanningController], providers: [PlanningService], exports: [PlanningService] })
export class PlanningModule {}
