"use client"

import { Check, ChevronLeft, ChevronRight, Snowflake, Truck } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { BRAND_LABEL, RULES, type Brand } from "@waypoint/shared"
import { BrandBadge, TagBadge, TempIcon } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { fmtNum, pct } from "@/lib/format"
import type { Plan, Vehicle } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useCreateTrip, useDistricts, useVehicles } from "../queries"
import type { PoolItem } from "./canvas"

const STEPS = ["Brand", "District", "Vehicle", "Orders"] as const
const BRANDS: Brand[] = ["FRESH", "STYLE", "TECH"]

function Choice({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative grid gap-1 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
        selected && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      {children}
      {selected && <Check className="absolute top-2.5 right-2.5 size-3.5 text-primary" />}
    </button>
  )
}

/**
 * Build a trip from scratch in four steps: brand → district → vehicle → orders.
 * Each step narrows the next (a vehicle must be free and temperature-compatible, orders must match brand + district).
 */
export function AddTripDialog({ plan, pool, open, onClose, onCreated }: { plan: Plan; pool: PoolItem[]; open: boolean; onClose: () => void; onCreated: (tripId: string) => void }) {
  const [step, setStep] = useState(0)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const districts = useDistricts()
  const vehicles = useVehicles()
  const create = useCreateTrip(plan.id)

  // Only orders the engine deferred (or the dispatcher deferred and saved) can seed a new trip.
  const available = useMemo(() => pool.filter((i) => !i.local), [pool])
  const matching = useMemo(
    () => available.filter((i) => i.decision.order.brand === brand && i.decision.order.outlet.districtId === district).toSorted((a, b) => b.decision.priorityScore - a.decision.priorityScore),
    [available, brand, district],
  )
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId)
  const tripsToday = (v: Vehicle) => plan.trips.filter((t) => t.vehicleId === v.id).length
  const chilled = matching.some((i) => i.decision.order.temp === "CHILLED")

  const compatible = (i: PoolItem) => {
    const o = i.decision.order
    if (!vehicle) return null
    if (o.temp === "CHILLED" && vehicle.temp !== "REEFER") return "Needs a reefer"
    if (o.outlet.parkingConstraint === "VAN_ONLY" && vehicle.type !== "VAN") return "Van-only outlet"
    return null
  }

  // Default selection: priority order, as many as fit the vehicle.
  const defaults = useMemo(() => {
    const out = new Set<string>()
    if (!vehicle) return out
    let w = 0
    let v = 0
    for (const i of matching) {
      const o = i.decision.order
      if (compatible(i)) continue
      if (w + o.weightKg > vehicle.weightCapKg || v + o.volumeM3 > vehicle.volumeCapM3) continue
      w += o.weightKg
      v += o.volumeM3
      out.add(o.id)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matching, vehicle])
  const selected = picked ?? defaults
  const load = matching.filter((i) => selected.has(i.decision.orderId)).reduce((a, i) => ({ w: a.w + i.decision.order.weightKg, v: a.v + i.decision.order.volumeM3 }), { w: 0, v: 0 })

  const reset = () => {
    setStep(0)
    setBrand(null)
    setDistrict(null)
    setVehicleId(null)
    setPicked(null)
  }
  const close = () => {
    onClose()
    reset()
  }
  const ready = [!!brand, !!district, !!vehicle, true][step]

  const submit = () => {
    if (!brand || !district || !vehicle) return
    const ids = matching.filter((i) => selected.has(i.decision.orderId) && !compatible(i)).map((i) => i.decision.orderId)
    const before = new Set(plan.trips.map((t) => t.id))
    create.mutate(
      { vehicleId: vehicle.id, brand, districtId: district, orderIds: ids },
      {
        onSuccess: (next) => {
          const t = next.trips.find((t) => !before.has(t.id))
          close()
          if (t) onCreated(t.id)
        },
      },
    )
  }

  const nextTripNo = vehicle && tripsToday(vehicle) === 0 ? 1 : 2

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a trip</DialogTitle>
          <DialogDescription>Build a trip step by step. The server checks every operating rule before anything is saved.</DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ring-1 ring-inset",
                  i < step ? "bg-primary text-primary-foreground ring-primary" : i === step ? "ring-primary text-primary" : "text-muted-foreground ring-border",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn(i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <div className="min-h-72">
          {step === 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {BRANDS.map((b) => {
                const n = available.filter((i) => i.decision.order.brand === b).length
                return (
                  <Choice
                    key={b}
                    selected={brand === b}
                    onClick={() => {
                      setBrand(b)
                      setDistrict(null)
                      setPicked(null)
                    }}
                  >
                    <BrandBadge brand={b} />
                    <span className="font-medium">{BRAND_LABEL[b]}</span>
                    <span className="text-xs text-muted-foreground">
                      {b === "FRESH" ? "03:30–08:00 · 270 min budget" : "Trading day · 480 min budget"}
                    </span>
                    <span className="text-xs text-muted-foreground">{n} deferred order{n === 1 ? "" : "s"} waiting</span>
                  </Choice>
                )
              })}
            </div>
          )}

          {step === 1 && (
            <ScrollArea className="h-72">
              <div className="grid gap-2 pr-3 sm:grid-cols-3">
                {(districts.data ?? [])
                  .map((d) => ({ d, n: available.filter((i) => i.decision.order.brand === brand && i.decision.order.outlet.districtId === d.id).length }))
                  .toSorted((a, b) => b.n - a.n || a.d.id.localeCompare(b.d.id))
                  .map(({ d, n }) => (
                    <Choice
                      key={d.id}
                      selected={district === d.id}
                      onClick={() => {
                        setDistrict(d.id)
                        setPicked(null)
                      }}
                    >
                      <span className="font-medium">{d.id}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtNum(d.depotToDistrictKm)} km · {fmtNum(d.depotToDistrictMin)} min from depot
                      </span>
                      <span className={cn("text-xs", n ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{n} deferred order{n === 1 ? "" : "s"}</span>
                    </Choice>
                  ))}
                {districts.isLoading && <Spinner />}
              </div>
            </ScrollArea>
          )}

          {step === 2 && (
            <ScrollArea className="h-72">
              <div className="grid gap-2 pr-3 sm:grid-cols-2">
                {(vehicles.data ?? []).map((v) => {
                  const n = tripsToday(v)
                  const off = v.status !== "AVAILABLE" ? "In workshop" : n >= RULES.maxTripsPerVehicle ? "Both trips used" : null
                  const reefer = v.temp === "REEFER"
                  const rec = !off && ((chilled && reefer) || (!chilled && !reefer && brand !== "FRESH"))
                  return (
                    <Choice key={v.id} selected={vehicleId === v.id} disabled={!!off} onClick={() => { setVehicleId(v.id); setPicked(null) }}>
                      <span className="flex items-center gap-1.5 font-medium">
                        <Truck className="size-3.5" /> {v.id}
                        {reefer && <Snowflake className="size-3.5 text-sky-500" />}
                        {rec && <TagBadge tone="green">Suggested</TagBadge>}
                        {off && <TagBadge tone="red">{off}</TagBadge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {reefer ? "Reefer" : "Ambient"} {v.type.toLowerCase()} · {fmtNum(v.weightCapKg)} kg · {fmtNum(v.volumeCapM3, 1)} m³
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {n}/{RULES.maxTripsPerVehicle} trips today · {v.driver?.name ?? "no driver"}
                      </span>
                    </Choice>
                  )
                })}
                {vehicles.isLoading && <Spinner />}
              </div>
            </ScrollArea>
          )}

          {step === 3 && vehicle && (
            <div className="grid gap-3">
              <div className="grid gap-1.5 rounded-lg border p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {vehicle.id} · trip {nextTripNo} · {brand && BRAND_LABEL[brand]} · {district}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {fmtNum(load.w)} / {fmtNum(vehicle.weightCapKg)} kg · {fmtNum(load.v, 1)} / {fmtNum(vehicle.volumeCapM3, 1)} m³
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", Math.max(pct(load.w, vehicle.weightCapKg), pct(load.v, vehicle.volumeCapM3)) > 100 ? "bg-red-500" : "bg-primary")}
                    style={{ width: `${Math.min(100, Math.max(pct(load.w, vehicle.weightCapKg), pct(load.v, vehicle.volumeCapM3)))}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {matching.length ? "Pick the orders to start this trip with — you can also leave it empty and drag orders in later." : `No deferred ${brand ? BRAND_LABEL[brand] : ""} orders in ${district}. The trip will be created empty.`}
              </p>
              <ScrollArea className="max-h-52">
                <div className="grid gap-1.5 pr-3">
                  {matching.map((i) => {
                    const o = i.decision.order
                    const why = compatible(i)
                    const on = selected.has(o.id) && !why
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={!!why}
                        onClick={() => {
                          const next = new Set(selected)
                          if (on) next.delete(o.id)
                          else next.add(o.id)
                          setPicked(next)
                        }}
                        className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-45", on && "border-primary bg-primary/5")}
                      >
                        <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="size-3" />}</span>
                        <TempIcon temp={o.temp} />
                        <span className="font-medium">{o.ref}</span>
                        <span className="text-xs text-muted-foreground">{o.outlet.id}</span>
                        {why && <TagBadge tone="red">{why}</TagBadge>}
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {fmtNum(o.weightKg)} kg · {fmtNum(o.volumeM3, 1)} m³
                        </span>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={step === 0 ? close : () => setStep(step - 1)}>
            {step > 0 && <ChevronLeft data-icon="inline-start" />} {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!ready} onClick={() => setStep(step + 1)}>
              Next <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button disabled={create.isPending} onClick={submit}>
              {create.isPending && <Spinner />} Create trip{selected.size ? ` with ${selected.size} order${selected.size === 1 ? "" : "s"}` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
