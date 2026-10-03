import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { JwtModule } from "@nestjs/jwt"
import { AuthGuard } from "./common/auth"
import { ClockModule } from "./common/clock.service"
import { PrismaModule } from "./common/prisma.service"
import { ChatModule } from "./modules/chat/chat.module"
import { AuthModule } from "./modules/auth/auth.module"
import { DashboardModule } from "./modules/dashboard/dashboard.module"
import { DriverModule } from "./modules/driver/driver.module"
import { HealthModule } from "./modules/health/health.module"
import { IssueChatModule } from "./modules/issue-chat/issue-chat.module"
import { IssuesModule } from "./modules/issues/issues.module"
import { LiveModule } from "./modules/live/live.module"
import { TripsModule } from "./modules/trips/trips.module"
import { OutletsModule } from "./modules/outlets/outlets.module"
import { VehiclesModule } from "./modules/vehicles/vehicles.module"
import { OrdersModule } from "./modules/orders/orders.module"
import { StoreModule } from "./modules/store/store.module"
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
    IssuesModule,
    IssueChatModule,
    ChatModule,
    TripsModule,
    DriverModule,
    VehiclesModule,
    OutletsModule,
    StoreModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
