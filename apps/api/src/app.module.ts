import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { JwtModule } from "@nestjs/jwt"
import { AuthGuard } from "./common/auth"
import { ClockModule } from "./common/clock.service"
import { PrismaModule } from "./common/prisma.service"
import { AuthModule } from "./modules/auth/auth.module"
import { DashboardModule } from "./modules/dashboard/dashboard.module"
import { HealthModule } from "./modules/health/health.module"
import { LiveModule } from "./modules/live/live.module"
import { OrdersModule } from "./modules/orders/orders.module"
import { PlanningModule } from "./modules/planning/planning.module"
import { ReferenceModule } from "./modules/reference/reference.module"

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "dev-secret",
      signOptions: { expiresIn: "12h" },
    }),
    PrismaModule,
    ClockModule,
    HealthModule,
    AuthModule,
    ReferenceModule,
    DashboardModule,
    OrdersModule,
    PlanningModule,
    LiveModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
