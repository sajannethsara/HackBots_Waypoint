"use client"

import { Check, Snowflake, Sparkles, Truck, Wrench } from "lucide-react"
import { useState } from "react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { TONE } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { fmtNum } from "@/lib/format"
import { useDemand, useGeneratePlan } from "../queries"

const CONSTRAINTS = [
  "Brand + district per trip",
  "Weight and volume capacity",
  "Chilled orders on reefers only",
  "Van-only outlet access",
  "Home depot only",
  "Whole orders, never split",
  "Max 2 trips per vehicle",
  "Fresh 270 min / Style+Tech 480 min budgets",
  "Weekly fuel quota",
  "Outlet & mall delivery windows",
]

const PRIORITY = [
  ["Deferred on the last run", "+40"],
  ["Days since last served", "+5/day"],
  ["Chilled / perishable", "+20"],
  ["Brand urgency (Fresh › Tech › Style)", "+15/10/5"],
  ["Festival ramp (Fresh)", "up to +20"],
]

const demandConfig = {
  weightT: { label: "Weight (t)", color: "var(--chart-4)" },
  volumeM3: { label: "Volume (m³)", color: "#0ea5e9" },
} satisfies ChartConfig

const LABEL: Record<string, string> = { FRESH_DRY: "Fresh dry", FRESH_CHILLED: "Fresh chilled", STYLE: "Style", TECH: "Tech" }

export function GenerateStep({ onCancel }: { onCancel?: () => void }) {
  const { data: demand } = useDemand()
  const generate = useGeneratePlan()
  const [maxStops, setMaxStops] = useState("8")
  const [enforceWindows, setEnforceWindows] = useState(true)

  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <Card size="sm" className="xl:col-span-3">
        <CardHeader>
          <CardTitle>Planning options</CardTitle>
          <CardDescription>The engine builds trips from confirmed orders and available vehicles. Every rule below is enforced.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid content-start gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Constraints applied</p>
              <ul className="grid gap-1.5">
                {CONSTRAINTS.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-sm">
                    <span className="flex size-4 items-center justify-center rounded bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid content-start gap-4">
              <div className="grid gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Settings</p>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="stops" className="font-normal">
                    Max stops per trip
                  </Label>
                  <Select value={maxStops} onValueChange={(v) => setMaxStops(String(v))}>
                    <SelectTrigger id="stops" size="sm" className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[4, 6, 8, 10, 12].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="windows" className="grid gap-0.5 font-normal">
                    Hard delivery windows
                    <span className="text-xs text-muted-foreground">Off: late stops are kept and flagged at risk</span>
                  </Label>
                  <Switch id="windows" checked={enforceWindows} onCheckedChange={setEnforceWindows} />
                </div>
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Priority when capacity is short</p>
                {PRIORITY.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span>{k}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              disabled={generate.isPending || !demand?.totalOrders}
              onClick={() => generate.mutate({ maxStopsPerTrip: Number(maxStops), enforceWindows })}
            >
              {generate.isPending ? <Spinner /> : <Sparkles data-icon="inline-start" />}
              Generate plan
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-3 xl:col-span-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Today&apos;s demand</CardTitle>
            <CardDescription>{demand ? `${demand.totalOrders} confirmed orders · ${demand.vanOnly} to van-only outlets` : "…"}</CardDescription>
          </CardHeader>
          <CardContent>
            {!demand ? (
              <Skeleton className="h-40" />
            ) : (
              <ChartContainer config={demandConfig} className="h-40 w-full">
                <BarChart
                  data={demand.byBrand.map((b) => ({ name: LABEL[b.key] ?? b.key, weightT: +(b.weightKg / 1000).toFixed(1), volumeM3: +b.volumeM3.toFixed(1) }))}
                  barGap={2}
                >
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="weightT" fill="var(--color-weightT)" radius={4} />
                  <Bar dataKey="volumeM3" fill="var(--color-volumeM3)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Orders by district</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {demand?.byDistrict.map((d) => (
              <div key={d.key} className="flex items-center gap-2 text-sm">
                <span className="w-24 truncate">{d.key}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(d.orders / (demand.byDistrict[0]?.orders || 1)) * 100}%` }} />
                </div>
                <span className="w-6 text-right tabular-nums">{d.orders}</span>
                <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{fmtNum(d.volumeM3, 1)} m³</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Fleet availability</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <Tile icon={Truck} value={demand?.fleet.available} label="Available" sub={`of ${demand?.fleet.total ?? "—"}`} />
            <Tile icon={Wrench} value={demand?.fleet.inWorkshop} label="In workshop" sub="unavailable" warn />
            <Tile
              icon={Snowflake}
              value={demand ? `${demand.fleet.reefersAvailable}/${demand.fleet.reefersTotal}` : undefined}
              label="Reefers"
              sub={`${demand?.fleet.vansAvailable ?? "—"} vans ready`}
              warn={!!demand && demand.fleet.reefersAvailable < demand.fleet.reefersTotal}
            />
          </CardContent>
        </Card>
        {demand && demand.fleet.reefersAvailable < demand.fleet.reefersTotal && (
          <div className={`rounded-lg p-3 text-xs ring-1 ring-inset ${TONE.amber}`}>
            Only {demand.fleet.reefersAvailable} of {demand.fleet.reefersTotal} reefers are available — chilled capacity will likely be the
            binding constraint today.
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ icon: Icon, value, label, sub, warn }: { icon: typeof Truck; value?: React.ReactNode; label: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <Icon className={warn ? "size-4 text-amber-600" : "size-4 text-primary"} />
      <p className="mt-1.5 text-lg leading-none font-semibold tabular-nums">{value ?? "—"}</p>
      <p className="mt-1 text-xs">{label}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}
