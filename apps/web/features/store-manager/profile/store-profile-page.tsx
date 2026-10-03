"use client"

import { useState } from "react"
import { Building2, Clock, Mail, MapPin, Pencil, Phone, Snowflake, Truck, Users, Warehouse } from "lucide-react"
import { toast } from "sonner"
import { DOCK_LABEL, PARKING_LABEL, type StoreChangeRequest, type StoreChangeKind, type StoreProfile } from "@waypoint/shared"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDateTime, minToHHMM } from "@/lib/format"
import { ApiError } from "@/lib/api"
import { useCancelRequest, useStoreProfile } from "../queries"
import { AboutSheet } from "./about-sheet"
import { LeadershipSheet } from "./leadership-sheet"
import { ReceivingSheet } from "./receiving-sheet"
import { RequestChangeDialog } from "./request-change-dialog"

type Panel = "about" | "leadership" | "receiving" | null

export function StoreProfilePage() {
  const { data: p, isLoading, isError } = useStoreProfile()
  const [panel, setPanel] = useState<Panel>(null)
  const [request, setRequest] = useState<StoreChangeKind | null>(null)

  if (isLoading) return <Skeleton className="h-[640px] rounded-xl" />
  if (isError || !p)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Could not load your outlet</EmptyTitle>
          <EmptyDescription>Please refresh and try again.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  const { outlet: o, about, receiving } = p
  const floor = about.floorAreaM2 ?? 0
  const deptTotal = p.departments.reduce((s, d) => s + d.areaM2, 0)
  const pending = p.requests.filter((r) => r.status === "PENDING")
  const recent = p.requests.filter((r) => r.status !== "PENDING" && r.status !== "CANCELLED").slice(0, 3)

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Outlet profile"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{o.name}</span> <BrandBadge brand={o.brand} /> <span>{o.district} · served from {o.depot.name}</span>
          </span>
        }
        actions={
          <Button size="sm" onClick={() => setPanel("about")}>
            <Pencil data-icon="inline-start" /> Edit details
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" /> About
            </CardTitle>
            <CardAction>
              <Button variant="ghost" size="xs" onClick={() => setPanel("about")}>
                <Pencil data-icon="inline-start" /> Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row icon={MapPin} label="Address" value={about.address} />
            <Row icon={Phone} label="Phone" value={about.phone} />
            <Row icon={Mail} label="Email" value={about.email} />
            <Row icon={Clock} label="Opening hours" value={about.tradingOpenMin != null && about.tradingCloseMin != null ? `${minToHHMM(about.tradingOpenMin)} – ${minToHHMM(about.tradingCloseMin)}` : null} />
            <Row icon={Warehouse} label="Floor area" value={about.floorAreaM2 ? `${about.floorAreaM2.toLocaleString("en-LK")} m²` : null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" /> Leadership
            </CardTitle>
            <CardAction>
              <Button variant="ghost" size="xs" onClick={() => setPanel("leadership")}>
                <Pencil data-icon="inline-start" /> Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {p.leadership.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts yet. Add the people dispatch should call.</p>
            ) : (
              <ul className="grid gap-3">
                {p.leadership.map((l, i) => (
                  <li key={`${l.role}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.role}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {l.phone && (
                        <a href={`tel:${l.phone}`} className="block hover:underline">
                          {l.phone}
                        </a>
                      )}
                      {l.email && <span className="block">{l.email}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Department footprint</CardTitle>
          <CardDescription>
            {floor ? `${deptTotal.toLocaleString("en-LK")} of ${floor.toLocaleString("en-LK")} m² given to departments` : "Add your floor area to see how it is divided."}
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="xs" onClick={() => setPanel("about")}>
              <Pencil data-icon="inline-start" /> Edit
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {p.departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No departments added yet.</p>
          ) : (
            <ul className="grid gap-2.5">
              {p.departments.map((d) => (
                <li key={d.name} className="grid gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {d.areaM2.toLocaleString("en-LK")} m²{floor ? ` · ${Math.round((d.areaM2 / floor) * 100)}%` : ""}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${d.name}: ${d.areaM2} square metres`}>
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${floor ? Math.min(100, (d.areaM2 / floor) * 100) : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-4" /> Logistics
            </CardTitle>
            <CardDescription>Set by dispatch because the planner depends on it.</CardDescription>
            <CardAction>
              <Button variant="outline" size="xs" onClick={() => setRequest("WINDOW")}>
                Request a change
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row label="Receiving window" value={`${minToHHMM(o.windowOpenMin)} – ${minToHHMM(o.windowCloseMin)}`} />
            {o.mallWindowOpenMin != null && o.mallWindowCloseMin != null && <Row label="Mall delivery window" value={`${minToHHMM(o.mallWindowOpenMin)} – ${minToHHMM(o.mallWindowCloseMin)}`} />}
            <Row label="Unloading" value={DOCK_LABEL[o.dockType as keyof typeof DOCK_LABEL] ?? o.dockType} />
            <Row label="Vehicle access" value={PARKING_LABEL[o.parkingConstraint as keyof typeof PARKING_LABEL] ?? o.parkingConstraint} />
            <Row label="Served from" value={`${o.depot.name} · ${o.district}`} />

            {pending.map((r) => (
              <PendingRequest key={r.id} r={r} />
            ))}
            {recent.map((r) => (
              <DecidedRequest key={r.id} r={r} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-4" /> Receiving
            </CardTitle>
            <CardDescription>How deliveries are received at your door.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="xs" onClick={() => setPanel("receiving")}>
                <Pencil data-icon="inline-start" /> Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row label="Contact at the door" value={receiving.contactName ? `${receiving.contactName}${receiving.contactPhone ? ` · ${receiving.contactPhone}` : ""}` : null} />
            <Row label="Receiving staff" value={receiving.staff != null ? `${receiving.staff} ${receiving.staff === 1 ? "person" : "people"}` : null} />
            <div className="flex flex-wrap gap-2">
              <TagBadge tone={receiving.hasForklift ? "green" : "gray"}>{receiving.hasForklift ? "Forklift on site" : "No forklift"}</TagBadge>
              <TagBadge tone={receiving.hasColdRoom ? "blue" : "gray"}>
                <Snowflake className="size-3" /> {receiving.hasColdRoom ? "Cold room" : "No cold room"}
              </TagBadge>
            </div>
            <Row label="Instructions for the driver" value={receiving.notes} multiline />
          </CardContent>
        </Card>
      </div>

      <AboutSheet profile={p} open={panel === "about"} onClose={() => setPanel(null)} />
      <LeadershipSheet profile={p} open={panel === "leadership"} onClose={() => setPanel(null)} />
      <ReceivingSheet profile={p} open={panel === "receiving"} onClose={() => setPanel(null)} />
      <RequestChangeDialog profile={p} open={request !== null} initialKind={request ?? "WINDOW"} onClose={() => setRequest(null)} />
    </div>
  )
}

function Row({ icon: Icon, label, value, multiline }: { icon?: typeof MapPin; label: string; value?: string | null; multiline?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={multiline ? "font-medium whitespace-pre-line" : "truncate font-medium"}>{value || <span className="font-normal text-muted-foreground">Not set</span>}</p>
      </div>
    </div>
  )
}

const WHAT: Record<string, (r: StoreChangeRequest) => string> = {
  WINDOW: (r) => `Receiving window ${minToHHMM(r.proposed.windowOpenMin as number)} – ${minToHHMM(r.proposed.windowCloseMin as number)}`,
  ACCESS: (r) => `${DOCK_LABEL[r.proposed.dockType as keyof typeof DOCK_LABEL]} · ${PARKING_LABEL[r.proposed.parkingConstraint as keyof typeof PARKING_LABEL]}`,
}

function PendingRequest({ r }: { r: StoreChangeRequest }) {
  const cancel = useCancelRequest()
  return (
    <div className="grid gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 dark:bg-amber-500/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Waiting for dispatch</p>
        <TagBadge tone="amber">Pending</TagBadge>
      </div>
      <p className="text-sm">{WHAT[r.kind](r)}</p>
      <p className="text-xs text-muted-foreground">
        Sent {fmtDateTime(r.createdAt)} · {r.reason}
      </p>
      <Button
        size="xs"
        variant="outline"
        className="w-fit"
        disabled={cancel.isPending}
        onClick={() =>
          cancel.mutate(r.id, {
            onSuccess: () => toast.success("Request cancelled"),
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not cancel the request"),
          })
        }
      >
        Cancel request
      </Button>
    </div>
  )
}

function DecidedRequest({ r }: { r: StoreChangeRequest }) {
  const ok = r.status === "APPROVED"
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{WHAT[r.kind](r)}</p>
        <TagBadge tone={ok ? "green" : "red"}>{ok ? "Approved" : "Declined"}</TagBadge>
      </div>
      <p className="text-xs text-muted-foreground">
        {r.decidedAt ? fmtDateTime(r.decidedAt) : ""}
        {r.decisionNote ? ` · ${r.decisionNote}` : ""}
      </p>
    </div>
  )
}
