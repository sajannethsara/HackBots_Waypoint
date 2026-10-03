/**
 * Loader claim / unclaim / confirm-stop against the running API and the real database (no mocks).
 *
 *   pnpm dev            # API on :4000, db on :5434
 *   cd apps/api && ../../packages/db/node_modules/.bin/tsx --env-file=../../.env test/loader.e2e.ts
 *
 * Seeds a throwaway fixture (far-future draft plan, its own small vehicle, one trip with three
 * stops) plus a second loader in the seeded loader's depot, and deletes all of it afterwards.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import { prisma as db } from "@waypoint/db"

const API = process.env.API_URL ?? "http://localhost:4000"
const PASSWORD = "Waypoint@2026"
const LOADER_A = "loader@waypoint.lk"
const ROUNDS = 25
const PER_LOADER = 4

async function login(email: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })
  const body = await res.text()
  assert.equal(res.status, 201, `login ${email}: ${res.status} ${body}`)
  return (JSON.parse(body) as { token: string }).token
}

const post = (token: string, path: string) => fetch(`${API}/api${path}`, { method: "POST", headers: { authorization: `Bearer ${token}` } })

const audit = (entityId: string | string[], actions: string[], since: Date) =>
  db.auditLog.findMany({ where: { entityId: { in: [entityId].flat() }, action: { in: actions }, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } })

async function main() {
  const a = await db.user.findUniqueOrThrow({ where: { email: LOADER_A } })
  assert.ok(a.depotId, "seeded loader has no depot")
  const started = new Date()
  const fx = await seedFixture(a.depotId)
  const { trip, stops } = fx
  const b = await db.user.create({
    data: { email: `loader.e2e.${Date.now()}@waypoint.lk`, name: "E2E Loader B", role: "LOADER", depotId: a.depotId, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  })
  const name = (id: string | null) => (id === a.id ? "A" : id === b.id ? "B" : String(id))
  console.log(`trip ${trip.ref} (${trip.id}) · depot ${a.depotId} · loaders A=${a.email} B=${b.email}\n`)

  try {
    const [tokenA, tokenB] = await Promise.all([login(a.email), login(b.email)])

    // ── 1. Two loaders claim at the same instant ──
    // Two loaders is the real scenario; PER_LOADER parallel requests each (shuffled) make
    // sure the requests genuinely overlap in the database rather than arriving in turn.
    const wins = { A: 0, B: 0 }
    for (let round = 1; round <= ROUNDS; round++) {
      const roundStart = new Date()
      const callers = [...Array(PER_LOADER).fill(a), ...Array(PER_LOADER).fill(b)].sort(() => Math.random() - 0.5)
      const responses = await Promise.all(callers.map((u) => post(u === a ? tokenA : tokenB, `/loader/trips/${trip.id}/claim`)))
      const codes = responses.map((r) => r.status)
      assert.equal(codes.filter((c) => c === 201).length, 1, `round ${round}: expected exactly one 201, got ${codes.join(",")}`)
      assert.equal(codes.filter((c) => c === 409).length, callers.length - 1, `round ${round}: others should all be 409, got ${codes.join(",")}`)
      const w = codes.indexOf(201)
      const winner = callers[w]
      const body = (await responses[w].json()) as { claimedBy: { id: string } | null }
      const loser = (await responses[(w + 1) % responses.length].json()) as { message: string }

      const after = await db.trip.findUniqueOrThrow({ where: { id: trip.id } })
      const rows = await audit(trip.id, ["TRIP_CLAIMED"], roundStart)
      assert.equal(rows.length, 1, `round ${round}: ${rows.length} TRIP_CLAIMED rows`)
      assert.equal(rows[0].actorId, winner.id, `round ${round}: audit actor is not the winner`)
      assert.equal(after.claimedById, winner.id, `round ${round}: trip.claimedById ${name(after.claimedById)} != winner ${name(winner.id)}`)
      assert.equal(after.status, "LOADING")
      assert.equal(body.claimedBy?.id, winner.id, `round ${round}: response body claimedById is not the winner`)
      assert.match(loser.message, /already claimed/)
      wins[name(winner.id) as "A" | "B"]++

      // Reset straight in the db so the next round races again from PLANNED.
      await db.trip.update({ where: { id: trip.id }, data: { status: "PLANNED", claimedById: null, claimedAt: null } })
    }
    console.log(`✔ concurrent claims: ${ROUNDS}/${ROUNDS} rounds of ${PER_LOADER * 2} simultaneous requests had exactly one 201, the rest 409, one TRIP_CLAIMED row, claimedById = winner (A won ${wins.A}, B won ${wins.B})`)

    // ── 2. Handoff: A claims → A unclaims → B claims ──
    const handoffStart = new Date()
    assert.equal((await post(tokenA, `/loader/trips/${trip.id}/claim`)).status, 201)
    assert.equal((await post(tokenB, `/loader/trips/${trip.id}/unclaim`)).status, 403, "B must not unclaim A's trip")
    assert.equal((await post(tokenA, `/loader/trips/${trip.id}/unclaim`)).status, 201)
    assert.equal((await post(tokenA, `/loader/trips/${trip.id}/unclaim`)).status, 403, "double unclaim must fail")
    assert.equal((await post(tokenB, `/loader/trips/${trip.id}/claim`)).status, 201)

    const trail = await audit(trip.id, ["TRIP_CLAIMED", "TRIP_UNCLAIMED"], handoffStart)
    const shape = trail.map((r) => `${r.action}:${name(r.actorId)}`)
    assert.deepEqual(shape, ["TRIP_CLAIMED:A", "TRIP_UNCLAIMED:A", "TRIP_CLAIMED:B"], `audit trail ${shape.join(" → ")}`)
    assert.equal((trail[1].before as { claimedById: string }).claimedById, a.id, "unclaim.before.claimedById should be A")
    assert.equal((trail[2].after as { claimedById: string }).claimedById, b.id, "reclaim.after.claimedById should be B")
    const final = await db.trip.findUniqueOrThrow({ where: { id: trip.id } })
    assert.equal(final.claimedById, b.id, `final claimedById is ${name(final.claimedById)}, not B`)
    assert.equal(final.status, "LOADING")
    const claimedAtA = (trail[0].after as { claimedAt: string }).claimedAt
    assert.ok(final.claimedAt && final.claimedAt.toISOString() !== claimedAtA, "claimedAt is stale from A's claim")
    console.log(`✔ handoff: ${shape.join(" → ")}; B cannot unclaim A's trip; double unclaim refused; final claimedById = B`)

    // ── 3. Confirm stops (trip is now B's). Cap fits stop 1 + either of stops 2/3, never all three. ──
    const [s1, s2, s3] = stops
    const confirm = (token: string, stopId: string) => post(token, `/loader/stops/${stopId}/confirm`)
    const loadStatus = async (id: string) => (await db.stop.findUniqueOrThrow({ where: { id } })).loadStatus
    const stopLoaded = (since: Date) => audit(stops.map((s) => s.id), ["STOP_LOADED"], since)
    const t3 = new Date()

    assert.equal((await confirm(tokenA, s1.id)).status, 403, "A does not hold the trip and must not confirm its stops")
    assert.equal((await post(tokenB, `/loader/stops/no-such-stop/confirm`)).status, 404)
    assert.equal(await loadStatus(s1.id), "PENDING")

    const r1 = await confirm(tokenB, s1.id)
    assert.equal(r1.status, 201)
    assert.equal(((await r1.json()) as { loadStatus: string }).loadStatus, "STOWED")
    assert.equal((await confirm(tokenB, s1.id)).status, 201, "repeat confirm is a no-op success")
    let rows = await stopLoaded(t3)
    assert.equal(rows.length, 1, `expected one STOP_LOADED row after confirm + repeat, got ${rows.length}`)
    assert.equal(rows[0].entityType, "Stop")
    assert.equal(rows[0].actorId, b.id)

    assert.equal((await confirm(tokenB, s2.id)).status, 201)
    const r3 = await confirm(tokenB, s3.id)
    assert.equal(r3.status, 409, "third stop breaches the weight cap")
    const breach = (await r3.json()) as { message: string; weight: { loaded: number; cap: number }; volume: { loaded: number; cap: number } }
    assert.match(breach.message, /exceed the vehicle's capacity/)
    assert.equal(breach.weight.cap, fx.weightCapKg)
    assert.ok(Math.abs(breach.weight.loaded - (s1.weightKg + s2.weightKg + s3.weightKg)) < 0.11, `weight.loaded ${breach.weight.loaded}`)
    assert.ok(breach.weight.loaded > breach.weight.cap)
    assert.equal(typeof breach.volume.loaded, "number")
    assert.equal(breach.volume.cap, fx.volumeCapM3)
    assert.equal(await loadStatus(s3.id), "PENDING", "a refused confirm must not write the stop")
    rows = await stopLoaded(t3)
    assert.equal(rows.length, 2, `refused confirm must not write an audit row (got ${rows.length} STOP_LOADED rows)`)
    console.log(`✔ confirm: non-holder 403; unknown stop 404; repeat confirm writes nothing; breach 409 with weight ${breach.weight.loaded}/${breach.weight.cap} kg and no writes`)

    // ── 4. Two confirms at once that each fit alone but not together: the trip lock must serialise them ──
    let races = { s2: 0, s3: 0 }
    for (let round = 1; round <= ROUNDS; round++) {
      await db.stop.updateMany({ where: { id: { in: [s2.id, s3.id] } }, data: { loadStatus: "PENDING" } })
      const roundStart = new Date()
      const pair = Math.random() < 0.5 ? [s2, s3] : [s3, s2]
      const codes = (await Promise.all(pair.map((s) => confirm(tokenB, s.id)))).map((r) => r.status)
      assert.deepEqual([...codes].sort(), [201, 409], `round ${round}: expected one 201 and one 409, got ${codes.join(",")}`)
      const states = [await loadStatus(s2.id), await loadStatus(s3.id)]
      assert.equal(states.filter((s) => s === "STOWED").length, 1, `round ${round}: both stops stowed — capacity overrun`)
      assert.equal((await stopLoaded(roundStart)).length, 1, `round ${round}: expected one STOP_LOADED row`)
      states[0] === "STOWED" ? races.s2++ : races.s3++
    }
    console.log(`✔ concurrent confirms: ${ROUNDS}/${ROUNDS} rounds stowed exactly one of two stops that only fit one at a time (stop 2 won ${races.s2}, stop 3 won ${races.s3})`)

    // ── 5. Only a trip being loaded can take confirms ──
    await db.trip.update({ where: { id: trip.id }, data: { status: "LOADED" } })
    await db.stop.update({ where: { id: s2.id }, data: { loadStatus: "PENDING" } })
    assert.equal((await confirm(tokenB, s2.id)).status, 409, "confirm on a LOADED trip must be refused")
    console.log("✔ confirm on a trip that is not LOADING: 409")

    console.log("\nAll loader checks passed.")
  } finally {
    await db.auditLog.deleteMany({ where: { entityId: { in: [trip.id, ...stops.map((s) => s.id)] }, createdAt: { gte: started } } })
    await db.plan.delete({ where: { id: trip.planId } }) // cascades to the fixture trip and its stops
    await db.vehicle.delete({ where: { id: fx.vehicleId } })
    await db.user.delete({ where: { id: b.id } })
    await db.$disconnect()
  }
}

/**
 * A throwaway PLANNED trip on a far-future draft plan with its own vehicle, so no real screen
 * ever shows it. Weight cap = stop 1 + the heavier of stops 2/3: each of 2 and 3 fits alone, not both.
 */
async function seedFixture(depotId: string) {
  const orders = await db.order.findMany({ where: { outlet: { depotId }, weightKg: { gt: 1 } }, include: { outlet: true }, take: 3, orderBy: { id: "asc" } })
  assert.equal(orders.length, 3, `need three orders in depot ${depotId}`)
  const [w1, w2, w3] = orders.map((o) => o.weightKg)
  const weightCapKg = Math.round((w1 + Math.max(w2, w3) + 0.2) * 10) / 10
  const volumeCapM3 = 1000
  const vehicle = await db.vehicle.create({
    data: { id: `E2E-${Date.now()}`, type: "VAN", temp: "AMBIENT", weightCapKg, volumeCapM3, fuelType: "DIESEL", kmPerL: 10, weeklyFuelQuotaL: 100, depotId, status: "AVAILABLE" },
  })
  const plan = await db.plan.create({
    data: { depotId, date: new Date("2099-01-01"), version: 1 + Math.floor(Math.random() * 1e6), status: "DRAFT", engineVersion: "e2e-fixture", summary: {} },
  })
  const trip = await db.trip.create({
    data: {
      planId: plan.id,
      ref: "TRIP-E2E",
      vehicleId: vehicle.id,
      tripNo: 1,
      brand: orders[0].brand,
      districtId: orders[0].outlet.districtId,
      plannedDepartMin: 360,
      plannedDurationMin: 120,
      plannedKm: 20,
      plannedFuelL: 4,
      loadWeightKg: w1 + w2 + w3,
      loadVolumeM3: orders.reduce((t, o) => t + o.volumeM3, 0),
      stops: { create: orders.map((o, i) => ({ orderId: o.id, seq: i + 1, plannedArrivalMin: 400 + i * 30, plannedServiceMin: 15 })) },
    },
    include: { stops: { orderBy: { seq: "asc" }, include: { order: true } } },
  })
  return { trip, vehicleId: vehicle.id, weightCapKg, volumeCapM3, stops: trip.stops.map((s) => ({ id: s.id, weightKg: s.order.weightKg })) }
}

main().catch((err) => {
  console.error(`\n✘ ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
