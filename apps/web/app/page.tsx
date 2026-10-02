import Link from "next/link"
import { ArrowRight, Boxes, ClipboardCheck, MapPinned, Workflow } from "lucide-react"
import { Wordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

const ROLES = [
  { icon: Workflow, title: "Dispatcher", text: "Plan the day against capacity and explain every deferral." },
  { icon: Boxes, title: "Loader", text: "Load in reverse stop order and flag shortfalls before departure." },
  { icon: MapPinned, title: "Driver", text: "Run the route and capture proof of delivery — even offline." },
  { icon: ClipboardCheck, title: "Store manager", text: "Order before cutoff, see the ETA, confirm what arrived." },
]

export default function Home() {
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_70%_-10%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]"
      />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark className="h-8" />
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/login" />}>
          Sign in
        </Button>
      </header>

      <section className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-16">
        <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" /> Fresh · Style · Tech — one distribution network
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Every order planned, loaded, delivered and confirmed — <span className="text-primary">with a reason for every call.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Waypoint connects ordering, planning, loading, delivery and receipt across 120 outlets, two depots and 60 vehicles.
          Capacity-aware plans, explainable deferrals and offline-first field work.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
            Open workspace <ArrowRight data-icon="inline-end" />
          </Button>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r.title} className="rounded-xl border bg-card/70 p-4 backdrop-blur">
              <r.icon className="mb-3 size-5 text-primary" />
              <p className="text-sm font-medium">{r.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative mx-auto w-full max-w-6xl px-6 py-6 text-xs text-muted-foreground">
        Tech-Triathlon 2026 · Team HackBots
      </footer>
    </main>
  )
}
