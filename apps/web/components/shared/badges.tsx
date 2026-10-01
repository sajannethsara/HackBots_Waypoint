import { Snowflake, Package } from "lucide-react"
import { BRAND_LABEL, DEFERRAL_REASON_META, type Brand, type DeferralReason } from "@waypoint/shared"
import { cn } from "@/lib/utils"

/** Soft tinted chip used for brand, status and tags across every role. */
export function Chip({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  )
}

export const TONE = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  red: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
  pink: "bg-pink-50 text-pink-700 ring-pink-600/15 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-400/20",
  gray: "bg-muted text-muted-foreground ring-border",
} as const
export type Tone = keyof typeof TONE

const BRAND_TONE: Record<Brand, Tone> = { FRESH: "green", STYLE: "pink", TECH: "blue" }
export const BRAND_COLOR: Record<Brand, string> = { FRESH: "var(--chart-3)", STYLE: "#db2777", TECH: "#0284c7" }

export function BrandBadge({ brand }: { brand: Brand }) {
  return <Chip className={TONE[BRAND_TONE[brand]]}>{BRAND_LABEL[brand]}</Chip>
}

export function TagBadge({ children, tone = "gray", title }: { children: React.ReactNode; tone?: Tone; title?: string }) {
  return (
    <Chip className={TONE[tone]} title={title}>
      {children}
    </Chip>
  )
}

export function TempIcon({ temp, className }: { temp: "CHILLED" | "AMBIENT"; className?: string }) {
  return temp === "CHILLED" ? (
    <Snowflake className={cn("size-3.5 text-sky-600 dark:text-sky-400", className)} aria-label="Chilled" />
  ) : (
    <Package className={cn("size-3.5 text-amber-600 dark:text-amber-400", className)} aria-label="Ambient" />
  )
}

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "amber",
  PUBLISHED: "green",
  SUPERSEDED: "gray",
  PLANNED: "blue",
  LOADING: "violet",
  LOADED: "violet",
  DEPARTED: "green",
  COMPLETED: "gray",
  CANCELLED: "gray",
  unassigned: "gray",
  assigned: "green",
  deferred: "red",
  SERVED: "green",
  DEFERRED: "red",
  PENDING: "gray",
  DELIVERED: "green",
  PARTIAL: "amber",
  REFUSED: "red",
  AVAILABLE: "green",
  IN_WORKSHOP: "amber",
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ")
  return <Chip className={TONE[STATUS_TONE[status] ?? "gray"]}>{text}</Chip>
}

export function ReasonBadge({ reason }: { reason: DeferralReason }) {
  return <Chip className={TONE.red}>{DEFERRAL_REASON_META[reason].label}</Chip>
}
