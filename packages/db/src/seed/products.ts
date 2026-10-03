import type { Brand, PrismaClient, TempRequirement } from "@prisma/client"
import { toEnum } from "@waypoint/shared"
import { readCsv } from "./csv"

type Item = [name: string, category: string, unitLabel: string, kg: number, m3: number, maxQty?: number]

/**
 * A deliberately small catalog (8–10 lines per brand and temperature). The base weights only fix the
 * relative sizes of products; `seedProducts` rescales each group so its average kg and m³ per unit match
 * what the brand really ships in deliveries_train.csv, which keeps ordered loads realistic for the planner.
 */
const CATALOG: Record<string, Item[]> = {
  "FRESH:CHILLED": [
    ["Fresh milk 1L", "DAIRY", "1 L pack", 1.05, 0.0014],
    ["Yoghurt cups 80g", "DAIRY", "tray of 12", 1.1, 0.0016],
    ["Curd pots 400g", "DAIRY", "pack of 6", 2.6, 0.0035],
    ["Cheese slices 200g", "DAIRY", "pack", 0.25, 0.0005],
    ["Chicken whole", "MEAT", "per bird", 1.6, 0.003],
    ["Fish fillet 500g", "MEAT", "pack", 0.55, 0.0009],
    ["Sausages 400g", "MEAT", "pack", 0.42, 0.0007],
    ["Leafy greens", "PRODUCE", "crate", 6, 0.02],
    ["Carrots", "PRODUCE", "5 kg bag", 5.1, 0.007],
    ["Beans", "PRODUCE", "5 kg bag", 5.1, 0.01],
  ],
  "FRESH:AMBIENT": [
    ["Rice 5kg", "DRY", "bag", 5.1, 0.0065],
    ["Dhal 1kg", "DRY", "pack", 1.02, 0.0012],
    ["Sugar 1kg", "DRY", "pack", 1.02, 0.001],
    ["Flour 1kg", "DRY", "pack", 1.03, 0.0013],
    ["Tea 400g", "DRY", "pack", 0.43, 0.0014],
    ["Soft drinks 1.5L", "BEVERAGE", "pack of 6", 9.4, 0.0145],
    ["Bottled water 1L", "BEVERAGE", "pack of 12", 12.3, 0.0165],
    ["Detergent 1kg", "HOUSEHOLD", "pack", 1.05, 0.0021],
    ["Soap bars", "HOUSEHOLD", "box of 12", 1.4, 0.003],
  ],
  "STYLE:AMBIENT": [
    ["Hanging dresses", "GARMENT", "rail of 10", 8, 0.12],
    ["Shirts rail", "GARMENT", "rail of 12", 7, 0.11],
    ["Festive sarees", "GARMENT", "box of 6", 5, 0.05],
    ["Denim jeans", "GARMENT", "carton of 20", 12, 0.06],
    ["T-shirts", "GARMENT", "carton of 40", 9, 0.07],
    ["Footwear cartons", "CARTON", "carton of 12", 10, 0.09],
    ["Accessories carton", "CARTON", "carton", 6, 0.05],
    ["Kids wear", "GARMENT", "carton of 30", 7, 0.06],
  ],
  "TECH:AMBIENT": [
    ["Refrigerator 250L", "APPLIANCE", "each", 52, 0.75, 40],
    ["Washing machine 7kg", "APPLIANCE", "each", 45, 0.45, 40],
    ["Television 55 inch", "APPLIANCE", "each", 18, 0.28, 60],
    ["Air conditioner 12k BTU", "APPLIANCE", "each", 32, 0.2, 60],
    ["Microwave oven", "APPLIANCE", "each", 14, 0.1, 80],
    ["Laptops carton", "ELECTRONICS", "carton of 5", 12, 0.06],
    ["Phones carton", "ELECTRONICS", "carton of 20", 6, 0.02],
    ["Small appliances", "ELECTRONICS", "carton of 6", 14, 0.08],
  ],
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

export async function seedProducts(db: PrismaClient) {
  // Observed average kg and m³ per unit for each brand and temperature.
  const observed = new Map<string, { kg: number[]; m3: number[] }>()
  for (const r of readCsv("Training Data/deliveries_train.csv")) {
    const units = +r.order_units
    if (!units) continue
    const key = `${toEnum<Brand>(r.brand)}:${toEnum<TempRequirement>(r.temp_requirement)}`
    const o = observed.get(key) ?? { kg: [], m3: [] }
    o.kg.push(+r.order_weight_kg / units)
    o.m3.push(+r.order_volume_m3 / units)
    observed.set(key, o)
  }

  const data = Object.entries(CATALOG).flatMap(([key, items]) => {
    const [brand, temp] = key.split(":") as [Brand, TempRequirement]
    const o = observed.get(key)
    const kgScale = o ? mean(o.kg) / mean(items.map((i) => i[3])) : 1
    const m3Scale = o ? mean(o.m3) / mean(items.map((i) => i[4])) : 1
    return items.map(([name, category, unitLabel, kg, m3, maxQty], i) => ({
      sku: `${brand.slice(0, 2)}-${temp === "CHILLED" ? "CH" : "AM"}-${String(i + 1).padStart(3, "0")}`,
      name,
      brand,
      category,
      temp,
      unitLabel,
      unitWeightKg: Math.round(kg * kgScale * 100) / 100,
      unitVolumeM3: Math.round(m3 * m3Scale * 10000) / 10000,
      ...(maxQty ? { maxQty } : {}),
    }))
  })
  await db.product.createMany({ data })
  return data.length
}
