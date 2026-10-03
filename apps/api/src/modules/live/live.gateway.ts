import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets"
import type { Namespace, Socket } from "socket.io"
import { SESSION_COOKIE, type SessionUser } from "../../common/auth"
import { LiveClockService } from "./live-clock.service"
import { LiveService } from "./live.service"

const TICK_MS = 2_000
const room = (depotId: string, date: string) => `live:${depotId}|${date}`

/**
 * Pushes live snapshots to dispatchers who have Live Operations open.
 * Work happens only for rooms with subscribers, and only while the clock runs —
 * an idle or hidden dashboard costs nothing.
 */
@WebSocketGateway({ namespace: "/live", cors: { origin: true, credentials: true } })
export class LiveGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Namespace
  private timer?: NodeJS.Timeout
  private readonly log = new Logger(LiveGateway.name)

  constructor(
    private readonly jwt: JwtService,
    private readonly live: LiveService,
    private readonly clock: LiveClockService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.live.effectiveClock().running) void this.broadcast()
    }, TICK_MS)
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

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
      if (user.role !== "DISPATCHER") throw new Error("role")
      client.data.user = user
    } catch {
      client.emit("live:error", { message: "Not authorised for live operations" })
      client.disconnect(true)
    }
  }

  @SubscribeMessage("subscribe")
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { depotId: string; date: string }) {
    for (const r of client.rooms) if (r.startsWith("live:")) await client.leave(r)
    await client.join(room(body.depotId, body.date))
    client.emit("snapshot", await this.live.snapshot(body.depotId, body.date))
  }

  /** Push a fresh snapshot to every watched depot/day. */
  async broadcast() {
    const rooms = [...this.server.adapter.rooms.keys()].filter((r) => r.startsWith("live:"))
    for (const r of rooms) {
      const [depotId, date] = r.slice(5).split("|")
      try {
        this.server.to(r).emit("snapshot", await this.live.snapshot(depotId, date))
      } catch (e) {
        this.log.warn(`snapshot ${r} failed: ${(e as Error).message}`)
      }
    }
  }
}
