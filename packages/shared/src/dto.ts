import { z } from "zod"
import { DEFERRAL_REASONS } from "./constants"

/** Request contracts shared by the API (validation) and the web app (forms). */

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof loginSchema>

export const generatePlanSchema = z.object({
  depotId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  options: z
    .object({
      enforceWindows: z.boolean().default(true),
      maxStopsPerTrip: z.number().int().min(1).max(20).default(8),
    })
    .partial()
    .optional(),
})
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>

export const deferOrderSchema = z.object({
  orderId: z.string(),
  reason: z.enum(DEFERRAL_REASONS),
  note: z.string().max(500).optional(),
})
export type DeferOrderInput = z.infer<typeof deferOrderSchema>

export const assignOrderSchema = z.object({
  orderId: z.string(),
  tripId: z.string(),
})
export type AssignOrderInput = z.infer<typeof assignOrderSchema>

export const createOrderLineSchema = z.object({
  description: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().int().positive(),
  weightKg: z.number().positive(),
  volumeM3: z.number().positive(),
})

export const createOrderSchema = z.object({
  clientRequestId: z.string().optional(),
  temp: z.enum(["CHILLED", "AMBIENT"]),
  notes: z.string().max(500).optional(),
  lines: z.array(createOrderLineSchema).min(1),
})
export type CreateOrderInput = z.infer<typeof createOrderSchema>

export const resolveIssueSchema = z.object({
  resolution: z.string().min(1).max(1000),
})
