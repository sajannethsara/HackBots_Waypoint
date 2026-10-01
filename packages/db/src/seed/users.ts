import type { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

export const DEMO_PASSWORD = "Waypoint@2026"

/** The four judge accounts. Printed at the end of the seed and listed in the README. */
export const DEMO_ACCOUNTS = [
  { email: "dispatcher@waypoint.lk", name: "Nimal Perera", role: "DISPATCHER", depotId: "PELIYAGODA" },
  { email: "loader@waypoint.lk", name: "Kasun Jayasuriya", role: "LOADER", depotId: "PELIYAGODA" },
  { email: "driver@waypoint.lk", name: "Asim Perera", role: "DRIVER", depotId: "PELIYAGODA", vehicleId: "VEH036" },
  { email: "store@waypoint.lk", name: "Dilani Fernando", role: "STORE_MANAGER", outletId: "OUT001" },
] as const

const FIRST = ["Sunil", "Ruwan", "Chaminda", "Pradeep", "Lahiru", "Tharindu", "Mahesh", "Dinesh", "Saman", "Nuwan", "Isuru", "Kamal", "Roshan", "Ajith", "Chathura", "Gayan", "Janaka", "Upul", "Amila", "Buddhika"]
const LAST = ["Silva", "Fernando", "Perera", "Mendis", "Bandara", "Dissanayake", "Rajapaksha", "Wickramasinghe", "Gunawardena", "Herath", "Jayawardena", "Ranasinghe", "Kumara", "Senanayake", "Wijesinghe"]

export async function seedUsers(db: PrismaClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  for (const a of DEMO_ACCOUNTS) await db.user.create({ data: { ...a, passwordHash } })

  await db.user.create({
    data: { email: "dispatcher.kandy@waypoint.lk", name: "Harsha Bandara", role: "DISPATCHER", depotId: "KANDY", passwordHash },
  })
  await db.user.create({
    data: { email: "loader.kandy@waypoint.lk", name: "Pubudu Herath", role: "LOADER", depotId: "KANDY", passwordHash },
  })

  // Every other vehicle gets a driver so live operations shows real names.
  const vehicles = await db.vehicle.findMany({ where: { driver: null }, orderBy: { id: "asc" } })
  await db.user.createMany({
    data: vehicles.map((v, i) => ({
      email: `driver.${v.id.toLowerCase()}@waypoint.lk`,
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      role: "DRIVER" as const,
      depotId: v.depotId,
      vehicleId: v.id,
      passwordHash,
    })),
  })

  // A store manager for every outlet (only store@ is advertised).
  const outlets = await db.outlet.findMany({ where: { managers: { none: {} } }, orderBy: { id: "asc" } })
  await db.user.createMany({
    data: outlets.map((o, i) => ({
      email: `store.${o.id.toLowerCase()}@waypoint.lk`,
      name: `${FIRST[(i * 3) % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`,
      role: "STORE_MANAGER" as const,
      outletId: o.id,
      passwordHash,
    })),
  })
}
