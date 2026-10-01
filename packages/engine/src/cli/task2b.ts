/**
 * Datathon Task 2B: run the same engine the dispatcher uses on scenario S1
 * and write submission_task2b.csv.
 *
 *   pnpm plan:task2b [--data ../../data] [--out ./submission_task2b.csv] [--no-windows]
 */
import { writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { loadS1 } from "../data/s1"
import { planDay } from "../planner"

const args = process.argv.slice(2)
const arg = (k: string, d: string) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const dataDir = resolve(arg("--data", join(__dirname, "../../../../data")))
const out = resolve(arg("--out", "submission_task2b.csv"))

const { scenario, ...input } = loadS1(dataDir)

const result = planDay({
  ...input,
  options: { enforceWindows: !args.includes("--no-windows"), maxStopsPerTrip: 12 },
})

const byOrder = new Map(result.decisions.map((d) => [d.orderId, d]))
const lines = ["scenario,order_ref,outlet_id,decision,vehicle_id,trip_id"]
for (const r of scenario) {
  const d = byOrder.get(r.order_ref)!
  lines.push(
    d.decision === "SERVED"
      ? `S1,${r.order_ref},${r.outlet_id},served,${d.vehicleId},${d.tripNo}`
      : `S1,${r.order_ref},${r.outlet_id},deferred,,`,
  )
}
writeFileSync(out, lines.join("\n") + "\n")

const s = result.summary
console.log(`Served ${s.served}/${s.orders} (${s.coveragePct}%) on ${s.trips} trips, ${s.vehiclesUsed}/${s.vehiclesAvailable} vehicles, avg util ${s.avgUtilisationPct}%`)
console.log("Deferrals:", s.deferralsByReason)
for (const r of s.resources) console.log(`  ${r.label}: ${r.demand} / ${r.capacity} ${r.unit}`)
for (const d of result.decisions.filter((d) => d.decision === "DEFERRED"))
  console.log(`  ${d.orderId} [${d.priorityScore}] ${d.reason}${d.unavoidable ? " (unavoidable)" : ""}: ${d.explanation}`)
console.log(`Wrote ${out}`)
