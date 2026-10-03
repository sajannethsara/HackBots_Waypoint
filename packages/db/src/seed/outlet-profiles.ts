import type { Brand, PrismaClient } from "@prisma/client"
import { rng } from "./csv"

const FIRST = ["Sunil", "Ruwan", "Chaminda", "Pradeep", "Lahiru", "Tharindu", "Mahesh", "Dinesh", "Saman", "Nuwan", "Isuru", "Kamal", "Nimali", "Shanika", "Dilrukshi", "Thilini", "Anusha", "Sachini"]
const LAST = ["Silva", "Fernando", "Perera", "Mendis", "Bandara", "Dissanayake", "Rajapaksha", "Wickramasinghe", "Gunawardena", "Herath", "Jayawardena", "Ranasinghe"]
const STREETS = ["Main Street", "High Level Road", "Galle Road", "Station Road", "Temple Road", "Lake Road", "Market Road", "Church Road", "Kandy Road", "Hospital Road"]

/** Share of the floor each department takes, per brand. Sums to about 0.9 (the rest is aisles, back-of-house and tills). */
const DEPARTMENTS: Record<Brand, [string, number][]> = {
  FRESH: [["Fresh produce", 0.18], ["Dairy and chilled", 0.14], ["Meat and fish", 0.1], ["Dry goods", 0.28], ["Beverages", 0.1], ["Household", 0.1]],
  STYLE: [["Womenswear", 0.3], ["Menswear", 0.25], ["Kids", 0.15], ["Footwear", 0.12], ["Accessories", 0.08]],
  TECH: [["Home appliances", 0.35], ["Televisions and audio", 0.2], ["Computing", 0.18], ["Mobile phones", 0.12], ["Accessories", 0.05]],
}
const FLOOR: Record<Brand, [number, number]> = { FRESH: [600, 1800], STYLE: [400, 1200], TECH: [300, 900] }
const HOURS: Record<Brand, [number, number]> = { FRESH: [7 * 60, 21 * 60], STYLE: [9 * 60 + 30, 21 * 60], TECH: [9 * 60 + 30, 21 * 60] }

const NOTES = {
  REAR_DOCK: "Deliver to the rear dock. Ring the bell at the roller door; a receiver will come out.",
  STREET: "Street-side delivery. Hazard lights on and unload quickly; staff will carry goods in.",
  MALL_BAY: "Use the mall service bay. Show the delivery note at the security desk.",
} as const

/** Gives every outlet an address, contacts, department footprint, leadership and receiving details. Deterministic. */
export async function seedOutletProfiles(db: PrismaClient) {
  const outlets = await db.outlet.findMany({ select: { id: true, brand: true, districtId: true, dockType: true, managers: { select: { name: true, email: true, phone: true } } } })
  await db.outletProfile.createMany({
    data: outlets.map((o) => {
      const r = rng(`profile-${o.id}`)
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
      const person = () => `${pick(FIRST)} ${pick(LAST)}`
      const phone = () => `+94 7${Math.floor(r() * 8)} ${String(Math.floor(r() * 900) + 100)} ${String(Math.floor(r() * 9000) + 1000)}`
      const [lo, hi] = FLOOR[o.brand]
      const floor = Math.round((lo + r() * (hi - lo)) / 10) * 10
      const [open, close] = HOURS[o.brand]
      const mgr = o.managers[0]
      const lead = person()
      const leadPhone = phone()
      return {
        outletId: o.id,
        address: `${Math.floor(r() * 180) + 2} ${pick(STREETS)}, ${o.districtId}`,
        phone: phone(),
        email: `${o.id.toLowerCase()}@waypoint.lk`,
        tradingOpenMin: open,
        tradingCloseMin: close,
        floorAreaM2: floor,
        departments: DEPARTMENTS[o.brand].map(([name, share]) => ({ name, areaM2: Math.round((floor * share) / 5) * 5 })),
        leadership: [
          { role: "Store manager", name: mgr?.name ?? person(), phone: mgr?.phone ?? phone(), email: mgr?.email ?? null },
          { role: "Assistant manager", name: person(), phone: phone(), email: null },
          { role: "Receiving lead", name: lead, phone: leadPhone, email: null },
        ],
        receivingContactName: lead,
        receivingContactPhone: leadPhone,
        receivingStaff: 2 + Math.floor(r() * 5),
        hasForklift: o.dockType === "REAR_DOCK" && r() > 0.4,
        hasColdRoom: o.brand === "FRESH",
        receivingNotes: NOTES[o.dockType],
      }
    }),
  })
  return outlets.length
}
