import { formatWindow } from "@waypoint/shared"
import type { OutletLite } from "@/lib/types"

/** Receiving window shown to the dispatcher: outlet window ∩ mall window. */
export function outletWindow(o: OutletLite) {
  if (o.windowOpenMin == null || o.windowCloseMin == null) return "—"
  let open = o.windowOpenMin
  let close = o.windowCloseMin
  if (o.mallWindowOpenMin != null && o.mallWindowCloseMin != null) {
    open = Math.max(open, o.mallWindowOpenMin)
    close = Math.min(close, o.mallWindowCloseMin)
  }
  return formatWindow(open, close)
}
