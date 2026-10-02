/**
 * Puts the demo day back to "nothing driven yet" so the driver walkthrough can be repeated:
 * trips and stops return to PLANNED/PENDING, and the delivery events, proofs of delivery, GPS pings,
 * driver-reported issues and store notifications created by the driver app are removed.
 *
 *   pnpm driver:reset
 */
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  const setting = await db.appSetting.findUnique({ where: { key: "operatingDate" } })
  const date = typeof setting?.value === "string" ? setting.value : null
  if (!date) throw new Error("operatingDate is not set; seed the database first")
  const plan = await db.plan.findFirst({ where: { date: new Date(`${date}T00:00:00Z`), status: "PUBLISHED" }, orderBy: { version: "desc" } })
  if (!plan) throw new Error(`No published plan for ${date}`)

  const trips = await db.trip.findMany({ where: { planId: plan.id }, select: { id: true, stops: { select: { id: true, orderId: true } } } })
  const tripIds = trips.map((t) => t.id)
  const stops = trips.flatMap((t) => t.stops)

  const [loc, pods, events, issues] = await db.$transaction([
    db.driverLocation.deleteMany({ where: { tripId: { in: tripIds } } }),
    db.proofOfDelivery.deleteMany({ where: { stopId: { in: stops.map((s) => s.id) } } }),
    db.deliveryEvent.deleteMany({ where: { tripId: { in: tripIds } } }),
    db.issue.deleteMany({ where: { tripId: { in: tripIds }, reportedBy: { role: "DRIVER" } } }),
    db.notification.deleteMany({ where: { type: "DELIVERY_UPDATE" } }),
    db.stop.updateMany({ where: { tripId: { in: tripIds } }, data: { status: "PENDING", arrivedAt: null, completedAt: null, etaMin: null } }),
    db.trip.updateMany({ where: { id: { in: tripIds } }, data: { status: "PLANNED", departedAt: null, completedAt: null } }),
    db.order.updateMany({ where: { id: { in: stops.map((s) => s.orderId) } }, data: { status: "PLANNED" } }),
    db.mediaAsset.deleteMany({ where: { podSignature: null, podPhoto: null, issues: { none: {} } } }),
  ])
  console.log(`Reset ${tripIds.length} trips on ${date}: ${events.count} events, ${pods.count} proofs, ${loc.count} GPS pings, ${issues.count} driver issues removed.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
