import { BRAND_LABEL, minToHHMM, type Brand } from "@waypoint/shared"

export { minToHHMM }

export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-LK", { maximumFractionDigits: digits, minimumFractionDigits: digits })

export const fmtKg = (n: number) => `${fmtNum(n)} kg`
export const fmtM3 = (n: number) => `${fmtNum(n, 1)} m³`
export const brandLabel = (b: string) => BRAND_LABEL[b as Brand] ?? b

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts })

export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" })

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

/** "5 min ago", "3 h ago", "2 d ago" */
export function timeAgo(iso: string | Date) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export const fmtDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" })
