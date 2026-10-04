"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Hand, Radio, Truck } from "lucide-react"
import { toast } from "sonner"
import { BrandBadge, TagBadge } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError } from "@/lib/api"
import { fmtNum, minToHHMM } from "@/lib/format"

interface GateTrip {
  id: string
  ref: string
  brand: "FRESH" | "STYLE" | "TECH"
  districtId: string
  vehicleId: string
  plannedDepartMin: number
  loadWeightKg: number
  loadVolumeM3: number
  stops: number
  driver: { name: string } | null
  loader: { name: string } | null
  driverClaimedAt: string | null
  loaderClaimedAt: string | null
  heldAt: string | null
  live: boolean
  mine: boolean
}

/** Loader view of the depot gate: claim the trips you are loading so dispatch can let them out. */
export function LoaderGate() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["gate-board"], queryFn: () => api<GateTrip[]>("/gate/trips"), refetchInterval: 5_000 })
  const claim = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api(`/gate/trips/${id}/${on ? "claim" : "unclaim"}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate-board"] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  })

  return (
    <Card className="h-full gap-0 py-0">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Trips to load</p>
        <p className="text-xs text-muted-foreground">Claim a trip when you start loading it. Dispatch starts it once the driver has claimed it too.</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="grid place-items-center p-10">
            <Spinner />
          </div>
        ) : !data?.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No published trips today.</p>
        ) : (
          <div className="grid divide-y">
            {data.map((t) => {
              const taken = !!t.loaderClaimedAt && !t.mine
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="grid min-w-32 gap-0.5">
                    <span className="flex items-center gap-2 font-medium">
                      {t.ref} <BrandBadge brand={t.brand} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.districtId} · {t.stops} stops · {fmtNum(t.loadWeightKg)} kg · departs {minToHHMM(t.plannedDepartMin)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Truck className="size-3" /> {t.vehicleId}
                  </span>
                  <TagBadge tone={t.driverClaimedAt ? "green" : "gray"}>{t.driverClaimedAt ? `Driver ready${t.driver ? ` · ${t.driver.name}` : ""}` : "Driver not claimed"}</TagBadge>
                  <div className="ml-auto flex items-center gap-2">
                    {t.live ? (
                      <TagBadge tone="green">
                        <Radio className="size-3" /> Live
                      </TagBadge>
                    ) : t.heldAt ? (
                      <TagBadge tone="amber">Held by dispatch</TagBadge>
                    ) : t.loaderClaimedAt ? (
                      <>
                        <TagBadge tone="green">
                          <Check className="size-3" /> {t.mine ? "You claimed" : (t.loader?.name ?? "Claimed")}
                        </TagBadge>
                        {t.mine && (
                          <Button variant="ghost" size="xs" disabled={claim.isPending} onClick={() => claim.mutate({ id: t.id, on: false })}>
                            Undo
                          </Button>
                        )}
                      </>
                    ) : null}
                    {!t.live && !t.loaderClaimedAt && (
                      <Button size="xs" disabled={claim.isPending || taken} onClick={() => claim.mutate({ id: t.id, on: true })}>
                        <Hand data-icon="inline-start" /> Claim
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}
