import type { Brand, PrismaClient, TempRequirement } from "@prisma/client"
import { addDays, dateOnly, toEnum } from "@waypoint/shared"
import { readCsv, rng } from "./csv"

/**
 * The demo operating day.
 *  - Peliyagoda: Datathon Task 2B scenario S1 (festival a week away, 10 vehicles in workshop).
 *  - Kandy: the real orders for the same date from deliveries_train.csv.
 * Thursday 8 Jan 2026 is an operating day one week before Thai Pongal, not a payday, no monsoon —
 * which matches the S1 conditions.
 */
export const DEMO_DATE = "2026-01-08"

const LINE_TEMPLATES: Record<string, { category: string; items: string[] }[]> = {
  "FRESH:CHILLED": [
    { category: "DAIRY", items: ["Fresh milk 1L", "Yoghurt cups", "Curd pots", "Cheese slices"] },
    { category: "MEAT", items: ["Chicken whole", "Fish fillet", "Sausages"] },
    { category: "PRODUCE", items: ["Leafy greens", "Carrots", "Beans"] },
  ],
  "FRESH:AMBIENT": [
    { category: "DRY", items: ["Rice 5kg", "Dhal 1kg", "Sugar 1kg", "Flour 1kg", "Tea 400g"] },
    { category: "BEVERAGE", items: ["Soft drinks 1.5L", "Bottled water"] },
    { category: "HOUSEHOLD", items: ["Detergent", "Soap bars"] },
  ],
  "STYLE:AMBIENT": [
    { category: "GARMENT", items: ["Hanging dresses", "Shirts rail", "Festive sarees"] },
    { category: "CARTON", items: ["Footwear cartons", "Accessories carton"] },
  ],
  "TECH:AMBIENT": [
    { category: "APPLIANCE", items: ["Refrigerator", "Washing machine", "Television 55\"", "Air conditioner"] },
    { category: "ELECTRONICS", items: ["Laptops carton", "Phones carton"] },
  ],
}

/** Split an order's totals into 1–3 plausible lines that sum back exactly. */
export function makeLines(ref: string, brand: Brand, temp: TempRequirement, units: number, kg: number, m3: number) {
  const r = rng(ref)
  const groups = LINE_TEMPLATES[`${brand}:${temp}`] ?? LINE_TEMPLATES["FRESH:AMBIENT"]
  const n = Math.max(1, Math.min(units, 1 + Math.floor(r() * 3)))
  const weights = Array.from({ length: n }, () => 0.5 + r())
  const total = weights.reduce((s, x) => s + x, 0)
  let uLeft = units
  let kgLeft = kg
  let m3Left = m3
  return weights.map((w, i) => {
    const g = groups[Math.floor(r() * groups.length)]
    const last = i === n - 1
    const q = last ? uLeft : Math.max(1, Math.round((units * w) / total))
    const lineKg = last ? kgLeft : Math.round(((kg * w) / total) * 10) / 10
    const lineM3 = last ? m3Left : Math.round(((m3 * w) / total) * 1000) / 1000
    uLeft -= q
    kgLeft -= lineKg
    m3Left -= lineM3
    return {
      description: g.items[Math.floor(r() * g.items.length)],
      category: g.category,
      quantity: Math.max(1, q),
      weightKg: Math.max(0.1, Math.round(lineKg * 10) / 10),
      volumeM3: Math.max(0.001, Math.round(lineM3 * 1000) / 1000),
    }
  })
}

export async function seedDemoDay(db: PrismaClient) {
  const date = dateOnly(DEMO_DATE)
  const store = await db.user.findFirstOrThrow({ where: { email: "store@waypoint.lk" } })
  const managers = new Map(
    (await db.user.findMany({ where: { role: "STORE_MANAGER" } })).map((u) => [u.outletId!, u.id]),
  )
  const lastServed = new Map<string, string>()

  // ── Peliyagoda: scenario S1 ──
  const s1 = readCsv("Test Data/task2b_peak_day_scenarios.csv")
  for (const r of s1) {
    const brand = toEnum<Brand>(r.brand)
    const temp = toEnum<TempRequirement>(r.temp_requirement)
    const deferred = r.deferred_yesterday === "1"
    const prev = addDays(DEMO_DATE, -Number(r.days_since_last_served))
    if (!lastServed.has(r.outlet_id) || prev > lastServed.get(r.outlet_id)!) lastServed.set(r.outlet_id, prev)
    await db.order.create({
      data: {
        ref: r.order_ref,
        outletId: r.outlet_id,
        brand,
        depotId: "PELIYAGODA",
        deliveryDate: date,
        requestedDate: dateOnly(deferred ? addDays(DEMO_DATE, -1) : DEMO_DATE),
        temp,
        units: +r.order_units,
        weightKg: +r.order_weight_kg,
        volumeM3: +r.order_volume_m3,
        deferCount: deferred ? 1 : 0,
        submittedAt: new Date(`${addDays(DEMO_DATE, deferred ? -2 : -1)}T09:30:00+05:30`),
        createdById: managers.get(r.outlet_id) ?? store.id,
        lines: { create: makeLines(r.order_ref, brand, temp, +r.order_units, +r.order_weight_kg, +r.order_volume_m3) },
      },
    })
  }

  // ── Kandy: real orders for the same date ──
  const train = readCsv("Training Data/deliveries_train.csv")
  const kandy = train.filter((r) => r.order_date === DEMO_DATE && r.depot === "Kandy")
  for (const [i, r] of kandy.entries()) {
    const brand = toEnum<Brand>(r.brand)
    const temp = toEnum<TempRequirement>(r.temp_requirement)
    const ref = `K-${String(i).padStart(3, "0")}`
    await db.order.create({
      data: {
        ref,
        outletId: r.outlet_id,
        brand,
        depotId: "KANDY",
        deliveryDate: date,
        requestedDate: date,
        temp,
        units: +r.order_units,
        weightKg: +r.order_weight_kg,
        volumeM3: +r.order_volume_m3,
        submittedAt: new Date(`${addDays(DEMO_DATE, -1)}T10:15:00+05:30`),
        createdById: managers.get(r.outlet_id) ?? store.id,
        lines: { create: makeLines(ref, brand, temp, +r.order_units, +r.order_weight_kg, +r.order_volume_m3) },
      },
    })
  }

  // Last delivery per Kandy outlet, from history
  for (const r of train) {
    if (r.depot !== "Kandy" || !r.dispatch_date || r.dispatch_date >= DEMO_DATE) continue
    if (!lastServed.has(r.outlet_id) || r.dispatch_date > lastServed.get(r.outlet_id)!)
      lastServed.set(r.outlet_id, r.dispatch_date)
  }
  for (const [outletId, d] of lastServed)
    await db.outlet.update({ where: { id: outletId }, data: { lastDeliveredOn: dateOnly(d) } })

  // ── Fuel already burnt Mon–Wed of the demo week, so quotas are a live constraint ──
  const cal = await db.calendarDay.findUniqueOrThrow({ where: { date } })
  const vehicles = await db.vehicle.findMany()
  const entries = vehicles.flatMap((v) => {
    const r = rng(`fuel-${v.id}`)
    return [-3, -2, -1].map((offset) => {
      const litres = Math.round(v.weeklyFuelQuotaL * (0.1 + r() * 0.08) * 10) / 10
      return {
        vehicleId: v.id,
        date: dateOnly(addDays(DEMO_DATE, offset)),
        isoYear: cal.isoYear,
        isoWeek: cal.isoWeek,
        kind: "ACTUAL" as const,
        litres,
        km: Math.round(litres * v.kmPerL),
      }
    })
  })
  await db.fuelLedgerEntry.createMany({ data: entries })

  return { peliyagoda: s1.length, kandy: kandy.length }
}
