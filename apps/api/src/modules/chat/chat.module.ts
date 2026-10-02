import { Body, Controller, Get, Module, Param, Post, Query } from "@nestjs/common"
import {
  openConversationSchema,
  sendMessageSchema,
  type OpenConversationInput,
  type SendMessageInput,
} from "@waypoint/shared"
import { CurrentUser, Roles, type SessionUser } from "../../common/auth"
import { ZodPipe } from "../../common/zod.pipe"
import { ChatGateway } from "./chat.gateway"
import { ChatService } from "./chat.service"

/**
 * Messaging for all four roles. Authorisation lives in ChatService: dispatchers reach their
 * depot's loaders, drivers and store managers; those three can only reach the dispatch desk.
 */
@Controller("chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("unread")
  unread(@CurrentUser() user: SessionUser) {
    return this.chat.unread(user)
  }

  @Get("conversations")
  list(@CurrentUser() user: SessionUser, @Query("scope") scope?: string, @Query("q") q?: string) {
    return this.chat.list(user, { scope, q })
  }

  @Roles("DISPATCHER")
  @Get("contacts")
  contacts(@CurrentUser() user: SessionUser, @Query("q") q?: string, @Query("role") role?: string) {
    return this.chat.contacts(user, { q, role })
  }

  @Post("conversations")
  open(@CurrentUser() user: SessionUser, @Body(new ZodPipe(openConversationSchema)) body: OpenConversationInput) {
    return this.chat.open(user, body)
  }

  @Get("conversations/:id/messages")
  messages(@CurrentUser() user: SessionUser, @Param("id") id: string, @Query("before") before?: string, @Query("limit") limit?: string) {
    return this.chat.messages(user, id, { before, limit: limit ? Number(limit) : undefined })
  }

  @Post("conversations/:id/messages")
  send(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body(new ZodPipe(sendMessageSchema)) body: SendMessageInput) {
    return this.chat.send(user, id, body)
  }

  @Post("conversations/:id/read")
  read(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.chat.markRead(user, id)
  }

  @Get("mentions")
  mentions(@CurrentUser() user: SessionUser, @Query("conversationId") conversationId?: string, @Query("q") q?: string, @Query("type") type?: string) {
    return this.chat.mentionOptions(user, { conversationId, q, type })
  }

  @Roles("DISPATCHER")
  @Get("issues/:issueId/participants")
  participants(@CurrentUser() user: SessionUser, @Param("issueId") issueId: string) {
    return this.chat.issueParticipants(user, issueId)
  }
}

@Module({ controllers: [ChatController], providers: [ChatService, ChatGateway], exports: [ChatService, ChatGateway] })
export class ChatModule {}
