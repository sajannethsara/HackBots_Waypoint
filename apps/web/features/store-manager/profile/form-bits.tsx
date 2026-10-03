"use client"

/** "07:30" <-> minutes since midnight, for time inputs. */
export const toTimeValue = (min: number | null | undefined) => (min == null ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`)
export const fromTimeValue = (v: string) => (v ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : NaN)

/** Field-level messages from a zod error, keyed by dotted path ("leadership.0.email"). The first message per field wins. */
export function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of error.issues) out[i.path.join(".")] ??= i.message
  return out
}

/** The same for an API validation response ({ issues: [{ path, message }] }). */
export function apiFieldErrors(issues: { path: string; message: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of issues ?? []) out[i.path] ??= i.message
  return out
}

export function ErrorText({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  ) : null
}
