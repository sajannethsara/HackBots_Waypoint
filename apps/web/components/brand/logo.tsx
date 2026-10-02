import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * The brand PNGs are green on an opaque white background, so they sit on a white tile (mark)
 * or blend into light surfaces (wordmark) instead of being tinted, which keeps them visible in
 * dark mode too. Served as-is (unoptimized): they are small and fixed, and this avoids any
 * dependence on the image optimizer for the first thing a user sees.
 */
export function Logo({ className, compact, subtitle }: { className?: string; compact?: boolean; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white">
        <Image src="/logo-icon.png" alt="" width={1024} height={1024} unoptimized priority className="size-6" />
      </span>
      {!compact && (
        <div className="grid leading-tight">
          <span className="text-sm font-semibold tracking-[0.2em] text-primary">WAYPOINT</span>
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}

/** Full wordmark for the login and landing screens. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Waypoint — Unified delivery system"
      width={4664}
      height={1024}
      unoptimized
      priority
      className={cn("h-9 w-auto mix-blend-multiply dark:rounded-lg dark:bg-white dark:mix-blend-normal", className)}
    />
  )
}
