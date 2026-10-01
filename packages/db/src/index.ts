import { PrismaClient } from "@prisma/client"

export * from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/** One client per process (survives Next/Nest hot reloads in dev). */
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
