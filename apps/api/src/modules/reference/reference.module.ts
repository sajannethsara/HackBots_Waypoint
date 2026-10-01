import { Controller, Get, Module, Query } from "@nestjs/common"
import { CurrentUser, type SessionUser } from "../../common/auth"
import { ClockService } from "../../common/clock.service"
import { PrismaService } from "../../common/prisma.service"

/** Read-only master data: depots, vehicles, outlets, districts and the operating context. */
@Controller()
export class ReferenceController {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: ClockService,
  ) {}

  @Get("context")
  async context(@CurrentUser() user: SessionUser) {
    const date = await this.clock.operatingDate()
    const [calendar, depots] = await Promise.all([
      this.clock.calendar(date),
      this.db.depot.findMany({ select: { id: true, name: true }, orderBy: { name: "desc" } }),
    ])
    return { operatingDate: date, calendar, depots, defaultDepotId: user.depotId ?? "PELIYAGODA" }
  }

  @Get("depots")
  depots() {
    return this.db.depot.findMany({ orderBy: { name: "desc" } })
  }

  @Get("districts")
  districts(@Query("depotId") depotId?: string) {
    return this.db.district.findMany({ where: depotId ? { depotId } : {}, orderBy: { id: "asc" } })
  }

  @Get("vehicles")
  vehicles(@Query("depotId") depotId?: string) {
    return this.db.vehicle.findMany({
      where: depotId ? { depotId } : {},
      include: { driver: { select: { id: true, name: true, phone: true } } },
      orderBy: { id: "asc" },
    })
  }

  @Get("outlets")
  outlets(@Query("depotId") depotId?: string) {
    return this.db.outlet.findMany({
      where: depotId ? { depotId } : {},
      include: { district: { select: { centroidLat: true, centroidLng: true } } },
      orderBy: { id: "asc" },
    })
  }
}

@Module({ controllers: [ReferenceController] })
export class ReferenceModule {}
