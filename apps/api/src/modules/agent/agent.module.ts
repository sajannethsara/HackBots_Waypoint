import { Body, Controller, Get, Module, Param, Post } from "@nestjs/common"
import { agentApproveSchema, agentFeedbackSchema, agentSkipSchema, type AgentApproveInput, type AgentFeedbackInput, type AgentSkipInput } from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ZodPipe } from "../../common/zod.pipe"
import { ChatModule } from "../chat/chat.module"
import { IssueChatModule } from "../issue-chat/issue-chat.module"
import { IssuesModule } from "../issues/issues.module"
import { AgentService } from "./agent.service"

/** The issue agent, for dispatch only: ask it, steer it, approve or skip what it proposes. */
@Roles("DISPATCHER")
@Controller("issues/:id/agent")
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get()
  get(@Param("id") id: string) {
    return this.agent.get(id)
  }

  @Post("start")
  start(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.agent.start(user, id)
  }

  @Post("feedback")
  feedback(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(agentFeedbackSchema)) body: AgentFeedbackInput) {
    return this.agent.start(user, id, body.text)
  }

  @Post("stop")
  stop(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.agent.stop(user, id)
  }

  @Post("approve-all")
  approveAll(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.agent.approveAll(user, id)
  }

  @Post("steps/:stepId/approve")
  async approve(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("stepId") stepId: string, @Body(new ZodPipe(agentApproveSchema)) body: AgentApproveInput) {
    await this.agent.approve(user, id, stepId, body)
    return this.agent.get(id)
  }

  @Post("steps/:stepId/skip")
  skip(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("stepId") stepId: string, @Body(new ZodPipe(agentSkipSchema)) body: AgentSkipInput) {
    return this.agent.skip(user, id, stepId, body.reason)
  }
}

@Module({ imports: [ChatModule, IssueChatModule, IssuesModule], controllers: [AgentController], providers: [AgentService] })
export class AgentModule {}
