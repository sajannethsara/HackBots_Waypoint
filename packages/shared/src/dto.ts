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

/** Manual trip editing: the full ordered stop list of one trip (preview and save). */
export const tripLayoutSchema = z.object({
  tripId: z.string(),
  orderIds: z.array(z.string()).max(30),
})
export type TripLayoutInput = z.infer<typeof tripLayoutSchema>

export const saveLayoutSchema = z.object({
  trips: z.array(tripLayoutSchema).min(1),
  /** Orders the dispatcher pulled out of trips while editing, each with the recorded reason. */
  deferrals: z
    .array(z.object({ orderId: z.string(), reason: z.enum(DEFERRAL_REASONS), note: z.string().max(500).optional() }))
    .default([]),
})
export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>

export const createTripSchema = z.object({
  vehicleId: z.string(),
  brand: z.enum(["FRESH", "STYLE", "TECH"]),
  districtId: z.string(),
  orderIds: z.array(z.string()).max(30).default([]),
})
export type CreateTripInput = z.infer<typeof createTripSchema>

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
