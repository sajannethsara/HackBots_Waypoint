import { Body, Controller, Get, Module, Param, Post, Query } from "@nestjs/common"
import { createIssueSchema, resolveIssueInputSchema, type CreateIssueInput, type ResolveIssueInput } from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ZodPipe } from "../../common/zod.pipe"
import { ChatModule } from "../chat/chat.module"
import { IssueChatModule } from "../issue-chat/issue-chat.module"
import { IssueActionsController, IssueActionsService } from "./issue-actions"
import { IssuesService } from "./issues.service"

@Controller("issues")
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Roles("DISPATCHER")
  @Get()
  list(
    @Query("depotId") depotId: string,
    @Query("status") status?: string,
    @Query("stage") stage?: string,
    @Query("severity") severity?: string,
    @Query("tripId") tripId?: string,
    @Query("q") q?: string,
  ) {
    return this.issues.list({ depotId, status, stage, severity, tripId, q })
  }

  @Roles("DISPATCHER")
  @Get("summary")
  summary(@Query("depotId") depotId: string) {
    return this.issues.summary(depotId)
  }

  @Roles("DISPATCHER")
  @Get(":id")
  get(@Param("id") id: string) {
    return this.issues.get(id)
  }

  /** Any role can report: loaders, drivers and store managers raise issues from the field. */
  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(createIssueSchema)) body: CreateIssueInput) {
    return this.issues.create(user, body)
  }

  @Roles("DISPATCHER")
  @Post(":id/acknowledge")
  acknowledge(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.issues.acknowledge(user, id)
  }

  @Roles("DISPATCHER")
  @Post(":id/resolve")
  resolve(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(resolveIssueInputSchema)) body: ResolveIssueInput) {
    return this.issues.resolve(user, id, body)
  }
}

@Module({ imports: [ChatModule, IssueChatModule], controllers: [IssuesController, IssueActionsController], providers: [IssuesService, IssueActionsService], exports: [IssuesService, IssueActionsService] })
export class IssuesModule {}
