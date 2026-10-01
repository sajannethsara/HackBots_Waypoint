import { Body, Controller, Get, Injectable, Module, Post, Res, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { loginSchema, type LoginInput } from "@waypoint/shared"
import bcrypt from "bcryptjs"
import type { Response } from "express"
import { CurrentUser, Public, SESSION_COOKIE, type SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"
import { ZodPipe } from "../../common/zod.pipe"

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginInput) {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash)))
      throw new UnauthorizedException("Incorrect email or password")
    const session: SessionUser = {
      sub: user.id,
      role: user.role,
      name: user.name,
      depotId: user.depotId,
      outletId: user.outletId,
      vehicleId: user.vehicleId,
    }
    return { token: await this.jwt.signAsync(session), user: session }
  }

  me(id: string) {
    return this.db.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        depotId: true,
        depot: { select: { name: true } },
        outletId: true,
        outlet: { select: { name: true, brand: true } },
        vehicleId: true,
      },
    })
  }
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(body)
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    })
    return { user, token }
  }

  @Public()
  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" })
    return { ok: true }
  }

  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return this.auth.me(user.sub)
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
