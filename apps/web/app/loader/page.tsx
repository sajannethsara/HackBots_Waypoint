import { redirect } from "next/navigation"

/** The loader's home is the dashboard (the Figma landing screen). */
export default function Page() {
  redirect("/loader/dashboard")
}
