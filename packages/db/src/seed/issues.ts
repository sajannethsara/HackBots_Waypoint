import type { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

export const SYSTEM_EMAIL = "system@waypoint.lk"

/**
 * The account live monitoring reports issues as. It cannot sign in (inactive, random password).
 */
export async function seedSystemUser(db: PrismaClient) {
  await db.user.create({
    data: {
      email: SYSTEM_EMAIL,
      name: "Waypoint monitoring",
      role: "DISPATCHER",
      isActive: false,
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 4),
    },
  })
}

/** Field reports already in the queue on the demo morning (from the previous run and the dock). */
export async function seedIssues(db: PrismaClient) {
  const by = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id
  const [loader, driver, store, kandyLoader] = await Promise.all([
    by("loader@waypoint.lk"),
    by("driver@waypoint.lk"),
    by("store@waypoint.lk"),
    by("loader.kandy@waypoint.lk"),
  ])
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000)

  const issues = [
    {
      ref: "ISS-0001",
      stage: "PLANNING" as const,
      type: "VEHICLE_BREAKDOWN" as const,
      severity: "HIGH" as const,
      status: "ACKNOWLEDGED" as const,
      description: "Reefer compressor on VEH001 failed its pre-trip check. Workshop estimates return on Monday — one fewer reefer for the festival week.",
      vehicleId: "VEH001",
      reportedById: loader,
      createdAt: ago(20),
    },
    {
      ref: "ISS-0002",
      stage: "RECEIPT" as const,
      type: "RECEIPT_DAMAGED" as const,
      severity: "MEDIUM" as const,
      status: "OPEN" as const,
      description: "Yesterday's chilled delivery: 6 cases of yoghurt arrived crushed (bottom of the stack). Photos kept at the counter.",
      quantity: 6,
      outletId: "OUT001",
      reportedById: store,
      createdAt: ago(14),
    },
    {
      ref: "ISS-0003",
      stage: "DELIVERY" as const,
      type: "ACCESS_BLOCKED" as const,
      severity: "MEDIUM" as const,
      status: "OPEN" as const,
      description: "Road works outside OUT053 (Galle) — kerbside unloading suspended until Friday. Use the side lane behind the store; allow 10 extra min.",
      outletId: "OUT053",
      reportedById: driver,
      createdAt: ago(16),
    },
    {
      ref: "ISS-0004",
      stage: "DELIVERY" as const,
      type: "TEMPERATURE" as const,
      severity: "HIGH" as const,
      status: "RESOLVED" as const,
      description: "VEH004 reefer logged 9°C for 25 minutes on the Gampaha run (door seal). Dairy inspected on arrival.",
      vehicleId: "VEH004",
      reportedById: driver,
      resolution: "Inspect chilled load — Probe temps 4–5°C at handover, stock accepted. Seal replaced overnight.",
      resolvedAt: ago(18),
      createdAt: ago(22),
    },
    {
      ref: "ISS-0005",
      stage: "LOADING" as const,
      type: "LOAD_MISSING" as const,
      severity: "LOW" as const,
      status: "OPEN" as const,
      description: "Kandy dock: 2 cartons of tea short on the Matale picking list — stock count shows 0 on the shelf.",
      quantity: 2,
      outletId: "OUT081",
      reportedById: kandyLoader,
      createdAt: ago(3),
    },
  ]
  const dispatcher = await by("dispatcher@waypoint.lk")
  for (const i of issues) {
    const created = await db.issue.create({ data: { ...i, resolvedById: i.status === "RESOLVED" ? dispatcher : undefined } })
    await db.auditLog.create({ data: { actorId: i.reportedById, action: "ISSUE_REPORTED", entityType: "Issue", entityId: created.id, createdAt: i.createdAt } })
    if (i.status === "ACKNOWLEDGED")
      await db.auditLog.create({ data: { actorId: dispatcher, action: "ISSUE_ACKNOWLEDGED", entityType: "Issue", entityId: created.id, createdAt: ago(19) } })
    if (i.status === "RESOLVED")
      await db.auditLog.create({ data: { actorId: dispatcher, action: "ISSUE_RESOLVED", entityType: "Issue", entityId: created.id, createdAt: i.resolvedAt } })
  }
  return issues.length
}
