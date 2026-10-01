/**
 * Seeds reference data, accounts and the demo day. Idempotent: skips when already seeded
 * unless run with --force (which wipes operational + reference data first).
 *
 *   pnpm db:seed            # first run / no-op afterwards
 *   pnpm db:seed --force    # reset to a clean demo day
 */
import { PrismaClient } from "@prisma/client"
import { readCsv } from "./csv"
import { DEMO_DATE, seedDemoDay } from "./demo-day"
import { seedDemand } from "./demand"
import { seedReference } from "./reference"
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedUsers } from "./users"

const db = new PrismaClient()

async function wipe() {
  // Children before parents.
  const tables = [
    "AuditLog", "Notification", "Receipt", "Issue", "DeliveryLine", "ProofOfDelivery", "MediaAsset",
    "DeliveryEvent", "Stop", "FuelLedgerEntry", "Trip", "PlanDecision", "Plan", "OrderLine", "Order",
    "DemandForecast", "DemandWeekly", "User", "RoadCondition", "TrafficSpeed", "CalendarDay",
    "ServiceAllowance", "Vehicle", "Outlet", "District", "Depot", "AppSetting",
  ]
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`)
}

async function main() {
  const force = process.argv.includes("--force")
  const seeded = await db.appSetting.findUnique({ where: { key: "seededAt" } })
  if (seeded && !force) {
    console.log(`Already seeded at ${JSON.stringify(seeded.value)} — skipping (use --force to reset).`)
    return
  }
  const t0 = Date.now()
  await wipe()

  const workshop = new Set(
    readCsv("Test Data/task2b_peak_day_fleet.csv").filter((r) => r.status === "in_workshop").map((r) => r.vehicle_id),
  )
  await seedReference(db, workshop)
  console.log("✓ reference data")
  await seedUsers(db)
  console.log("✓ users")
  const day = await seedDemoDay(db)
  console.log(`✓ demo day ${DEMO_DATE}: ${day.peliyagoda} Peliyagoda + ${day.kandy} Kandy orders`)
  const demand = await seedDemand(db, DEMO_DATE)
  console.log(`✓ demand history (${demand.weeks} depot-brand-weeks) + ${demand.forecasts} baseline forecasts`)

  await db.appSetting.createMany({
    data: [
      { key: "operatingDate", value: DEMO_DATE },
      { key: "orderCutoffMin", value: 960 },
      { key: "seededAt", value: new Date().toISOString() },
    ],
  })

  console.log(`\nSeeded in ${((Date.now() - t0) / 1000).toFixed(1)}s. Demo accounts (password ${DEMO_PASSWORD}):`)
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(14)} ${a.email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
