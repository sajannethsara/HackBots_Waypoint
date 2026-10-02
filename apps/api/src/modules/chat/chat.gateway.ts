import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets"
import { JwtService } from "@nestjs/jwt"
import type { Namespace, Socket } from "socket.io"
import { SESSION_COOKIE, type SessionUser } from "../../common/auth"

export const deskRoom = (depotId: string) => `desk:${depotId}`
export const userRoom = (userId: string) => `user:${userId}`

/**
 * Realtime delivery for messages. Authorised by the same session cookie as the REST API.
 * The REST endpoints stay the source of truth; sockets only push "something changed" so
 * clients can refresh. Dispatchers join their depot's desk room (shared inbox); everyone
 * else joins only their own room.
 */
@WebSocketGateway({ namespace: "/chat", cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Namespace

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const cookies = Object.fromEntries(
      (client.handshake.headers.cookie ?? "").split(";").map((c) => {
        const i = c.indexOf("=")
        return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))]
      }),
    )
    const token = cookies[SESSION_COOKIE] ?? (client.handshake.auth?.token as string | undefined)
    try {
      const user = await this.jwt.verifyAsync<SessionUser>(token ?? "")
      client.data.user = user
      await client.join(userRoom(user.sub))
      if (user.role === "DISPATCHER" && user.depotId) await client.join(deskRoom(user.depotId))
    } catch {
      client.emit("chat:error", { message: "Not signed in" })
      client.disconnect(true)
    }
  }

  /** Deliver to the depot's dispatch desk and to the member on the other side. */
  publish(conv: { depotId: string; memberId: string }, event: "message" | "read", payload: unknown) {
    this.server?.to([deskRoom(conv.depotId), userRoom(conv.memberId)]).emit(event, payload)
  }
}
