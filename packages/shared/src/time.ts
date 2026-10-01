/** Clock times are stored as minutes since midnight (06:30 -> 390). */

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.trim().split(":").map(Number)
  return h * 60 + m
}

export function minToHHMM(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "—"
  const total = Math.round(min)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** "10:30-12:30" -> [630, 750] */
export function parseWindow(range: string | null | undefined): [number, number] | null {
  if (!range) return null
  const [a, b] = range.split("-")
  if (!a || !b) return null
  return [hhmmToMin(a), hhmmToMin(b)]
}

export function formatWindow(open: number, close: number): string {
  return `${minToHHMM(open)}–${minToHHMM(close)}`
}

/** Date-only helpers. Calendar dates are always handled as UTC midnight. */
export function toDateOnly(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toISOString().slice(0, 10)
}

export function dateOnly(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
}

export function addDays(iso: string, days: number): string {
  const d = dateOnly(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateOnly(d)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((dateOnly(toIso).getTime() - dateOnly(fromIso).getTime()) / 86_400_000)
}
