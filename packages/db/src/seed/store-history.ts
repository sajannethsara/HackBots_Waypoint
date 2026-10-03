import type { Brand, PrismaClient, TempRequirement } from "@prisma/client"
import { addDays, dateOnly, toEnum } from "@waypoint/shared"
import { readCsv } from "./csv"
import { DEMO_DATE, makeLines } from "./demo-day"

const PER_OUTLET = 8

/**
 * Each outlet's recent order history from deliveries_train.csv, so the store app opens on real data:
 * past deliveries are RECEIVED (with a receipt), one per outlet was CANCELLED, and the demo store
 * manager also has a couple of unsent drafts.
 */
export async function seedStoreHistory(db: PrismaClient) {
  const managers = new Map((await db.user.findMany({ where: { role: "STORE_MANAGER" } })).map((u) => [u.outletId!, u.id]))
  const depots = new Map((await db.outlet.findMany({ select: { id: true, depotId: true } })).map((o) => [o.id, o.depotId]))

  const byOutlet = new Map<string, Record<string, string>[]>()
  for (const r of readCsv("Training Data/deliveries_train.csv")) {
    if (!r.dispatch_date || r.dispatch_date >= DEMO_DATE || !managers.has(r.outlet_id)) continue
    const rows = byOutlet.get(r.outlet_id) ?? []
    rows.push(r)
    byOutlet.set(r.outlet_id, rows)
  }

  let count = 0
  for (const [outletId, all] of byOutlet) {
    const rows = all.sort((a, b) => b.dispatch_date.localeCompare(a.dispatch_date)).slice(0, PER_OUTLET)
    for (const [i, r] of rows.entries()) {
      const brand = toEnum<Brand>(r.brand)
      const temp = toEnum<TempRequirement>(r.temp_requirement)
      const ref = `H-${r.delivery_id.replace(/^ORD/, "")}`
      const cancelled = i === 3
      const confirmedById = managers.get(outletId)!
      const created = await db.order.create({
        data: {
          ref,
          outletId,
          brand,
          depotId: depots.get(outletId)!,
          deliveryDate: dateOnly(r.dispatch_date),
          requestedDate: dateOnly(r.order_date),
          temp,
          units: +r.order_units,
          weightKg: +r.order_weight_kg,
          volumeM3: +r.order_volume_m3,
          status: cancelled ? "CANCELLED" : "RECEIVED",
          submittedAt: new Date(`${addDays(r.order_date, -1)}T09:30:00+05:30`),
          createdById: confirmedById,
          lines: { create: makeLines(ref, brand, temp, +r.order_units, +r.order_weight_kg, +r.order_volume_m3) },
          ...(cancelled
            ? {}
            : { receipt: { create: { status: "CONFIRMED", confirmedById, confirmedAt: new Date(`${r.dispatch_date}T11:00:00+05:30`) } } }),
        },
        select: { receipt: { select: { id: true } }, lines: { select: { id: true, quantity: true } } },
      })
      // Past deliveries arrived complete and in good condition.
      if (created.receipt)
        await db.receiptLine.createMany({
          data: created.lines.map((l) => ({ receiptId: created.receipt!.id, orderLineId: l.id, expectedQty: l.quantity, receivedQty: l.quantity })),
        })
      count++
    }
  }

  // Unsent drafts for the demo store (OUT001), dated after the demo day.
  const demo = await db.outlet.findUniqueOrThrow({ where: { id: "OUT001" } })
  for (const [i, days] of [2, 5].entries()) {
    const ref = `DRF-OUT001-${i + 1}`
    const units = 10 + i * 6
    await db.order.create({
      data: {
        ref,
        outletId: demo.id,
        brand: demo.brand,
        depotId: demo.depotId,
        deliveryDate: dateOnly(addDays(DEMO_DATE, days)),
        requestedDate: dateOnly(addDays(DEMO_DATE, days)),
        temp: "AMBIENT",
        units,
        weightKg: units * 9,
        volumeM3: units * 0.05,
        status: "DRAFT",
        submittedAt: new Date(`${DEMO_DATE}T08:00:00+05:30`),
        createdById: managers.get(demo.id)!,
        lines: { create: makeLines(ref, demo.brand, "AMBIENT", units, units * 9, units * 0.05) },
      },
    })
    count++
  }
  return count
}
