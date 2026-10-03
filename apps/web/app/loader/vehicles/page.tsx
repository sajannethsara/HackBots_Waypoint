import { redirect } from "next/navigation"

/** Vehicles are opened from the queue; the bare section has nothing of its own to show. */
export default function Page() {
  redirect("/loader/queue")
}
