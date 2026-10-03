import { redirect } from "next/navigation"

/** The loader's home is the loading queue. */
export default function Page() {
  redirect("/loader/queue")
}
