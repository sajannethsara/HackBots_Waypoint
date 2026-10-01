import type { Brand, PrismaClient } from "@prisma/client"
import { depotId, toEnum } from "@waypoint/shared"
import { readCsv } from "./csv"

/**
 * Weekly demand history (Datathon Task 2A rules: every order counts once, including deferred
 * and never-run ones, assigned to the week the store requested) plus a seasonal-naive
 * baseline forecast the capacity-planning screen can use until the trained model lands.
 */
export async function seedDemand(db: PrismaClient, fromIso: string, horizonWeeks = 10) {
  const cal = readCsv("General Data/calendar.csv")
  const week = new Map(cal.map((r) => [r.date, [+r.iso_year, +r.iso_week] as const]))

  type Agg = { depotId: string; brand: Brand; isoYear: number; isoWeek: number; n: number; vol: number; chilled: number }
  const agg = new Map<string, Agg>()
  for (const r of readCsv("Training Data/deliveries_train.csv")) {
    const w = week.get(r.order_date)
    if (!w) continue
    const k = `${r.depot}|${r.brand}|${w[0]}|${w[1]}`
    const a =
      agg.get(k) ??
      agg.set(k, { depotId: depotId(r.depot), brand: toEnum<Brand>(r.brand), isoYear: w[0], isoWeek: w[1], n: 0, vol: 0, chilled: 0 }).get(k)!
    a.n++
    a.vol += +r.order_volume_m3
    if (r.temp_requirement === "chilled") a.chilled += +r.order_volume_m3
  }
  const rows = [...agg.values()]
  await db.demandWeekly.createMany({
    data: rows.map((a) => ({
      depotId: a.depotId,
      brand: a.brand,
      isoYear: a.isoYear,
      isoWeek: a.isoWeek,
      orderCount: a.n,
      totalVolumeM3: round(a.vol),
      chilledVolumeM3: round(a.chilled),
    })),
  })

  // Baseline: same ISO week last year × (recent 8 weeks / same 8 weeks last year).
  const start = week.get(fromIso)!
  const get = (d: string, b: string, y: number, w: number) => agg.get(`${d}|${b}|${y}|${w}`)
  const forecasts = []
  for (const depot of ["Peliyagoda", "Kandy"]) {
    for (const brand of ["FRESH", "STYLE", "TECH"] as Brand[]) {
      const label = brand[0] + brand.slice(1).toLowerCase()
      let recent = 0
      let lastYear = 0
      for (let i = 1; i <= 8; i++) {
        const w = start[1] - i
        const [y, ww] = w > 0 ? [start[0], w] : [start[0] - 1, 52 + w]
        recent += get(depot, label, y, ww)?.vol ?? 0
        lastYear += get(depot, label, y - 1, ww)?.vol ?? 0
      }
      const growth = lastYear > 0 ? recent / lastYear : 1
      for (let h = 1; h <= horizonWeeks; h++) {
        const isoWeek = start[1] + h
        const ly = get(depot, label, start[0] - 1, isoWeek)
        forecasts.push({
          depotId: depotId(depot),
          brand,
          isoYear: start[0],
          isoWeek,
          source: "BASELINE" as const,
          totalVolumeM3: round((ly?.vol ?? recent / 8) * growth),
          chilledVolumeM3: brand === "FRESH" ? round((ly?.chilled ?? 0) * growth) : 0,
        })
      }
    }
  }
  await db.demandForecast.createMany({ data: forecasts })
  return { weeks: rows.length, forecasts: forecasts.length }
}

const round = (x: number) => Math.round(x * 10) / 10
