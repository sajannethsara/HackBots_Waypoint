import type { DayContext, EngineOrder, ScoreBreakdown } from "./types"

/**
 * Priority policy. Higher score = served first when capacity is short.
 * Every factor is kept in the breakdown so the UI can explain the number.
 */
export const SCORE_WEIGHTS = {
  base: 10,
  deferredYesterday: 40,
  perExtraDeferral: 10,
  stalenessPerDay: 5,
  stalenessCap: 25,
  chilled: 20,
  brand: { FRESH: 15, TECH: 10, STYLE: 5 },
  festivalMax: 20,
  payday: 5,
} as const

export function scoreOrder(o: EngineOrder, ctx: DayContext): { score: number; breakdown: ScoreBreakdown } {
  const w = SCORE_WEIGHTS
  const b: ScoreBreakdown = { base: w.base }
  if (o.deferCount > 0) b.deferredYesterday = w.deferredYesterday + w.perExtraDeferral * (o.deferCount - 1)
  const stale = Math.min(w.stalenessCap, w.stalenessPerDay * Math.max(0, o.daysSinceLastServed - 1))
  if (stale > 0) b.daysSinceLastServed = stale
  if (o.temp === "CHILLED") b.chilled = w.chilled
  b.brand = w.brand[o.brand]
  if (o.brand === "FRESH" && ctx.festivalRamp > 0) b.festivalRamp = Math.round(ctx.festivalRamp * w.festivalMax)
  if (o.brand === "FRESH" && ctx.isPayday) b.payday = w.payday
  const score = Object.values(b).reduce((s, x) => s + x, 0)
  return { score, breakdown: b }
}
