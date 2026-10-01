import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { JwtService } from "@nestjs/jwt"
import type { Role } from "@waypoint/shared"
import type { Request } from "express"

export const SESSION_COOKIE = "wp_session"

export interface SessionUser {
  sub: string
  role: Role
  name: string
  depotId: string | null
  outletId: string | null
  vehicleId: string | null
}

const IS_PUBLIC = "isPublic"
const ROLES = "roles"

/** Skip authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true)

/** Restrict a controller or route to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles)

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request & { user: SessionUser }>().user,
)

/** Global guard: verifies the session cookie (or bearer token) and enforces @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true

    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionUser }>()
    const header = req.headers.authorization
    const token = req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined)
    if (!token) throw new UnauthorizedException("Not signed in")
    try {
      req.user = await this.jwt.verifyAsync<SessionUser>(token)
    } catch {
      throw new UnauthorizedException("Session expired")
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets)
    if (roles && !roles.includes(req.user.role)) throw new ForbiddenException("Not allowed for your role")
    return true
  }
}
