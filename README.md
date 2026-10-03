# Waypoint — Unified Delivery System

Team **HackBots** · Tech-Triathlon 2026 Hackathon

Waypoint connects ordering, planning, loading, delivery and receipt for Waypoint Fresh, Style and Tech: 120 outlets, 2 depots and 60 vehicles.
The dispatcher plans each day with a constraint-aware engine. Every deferral is recorded with the binding constraint, and the engine marks whether it was **unavoidable** or a **trade-off**.

---

## Quick start (Docker)

```bash
cp .env.example .env        # defaults work as-is
docker compose up --build   # db → api (migrate + seed) → web
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 (set `WEB_PORT` in `.env` if 3000 is reserved on Windows) |
| API | http://localhost:4000/api/health |
| Postgres | localhost:5434 (`DB_PORT`) |

The first boot seeds all competition datasets plus the demo day. Later boots skip the seed. To reset to a clean demo day:
`docker compose exec api sh -c "cd /repo/packages/db && node dist/seed/index.js --force"`.

### Seeded accounts (password `Waypoint@2026`)

| Role | Email |
|---|---|
| Dispatcher (Peliyagoda) | `dispatcher@waypoint.lk` |
| Loader (Peliyagoda) | `loader@waypoint.lk` |
| Driver (VEH036, reefer van) | `driver@waypoint.lk` |
| Store manager (OUT001, Fresh Colombo) | `store@waypoint.lk` |

The login page has one-click buttons for each role.

---

## Local development

Requires Node 22+, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up                 # postgres only, on :5434
pnpm db:migrate            # apply migrations
pnpm db:seed               # load CSVs + demo day  (--force to reset)
pnpm dev                   # api :4000 + web :3400 + package watchers
```

Other useful scripts: `pnpm db:studio`, `pnpm typecheck`, `pnpm test`, `pnpm plan:task2b` (writes the Datathon Task 2B submission using the same engine).

---

## Repository layout

```
apps/
  api/        NestJS 11: REST API, auth, planning service (wraps the engine)
    src/common/        prisma, auth guard + @Roles, zod pipe, operating clock
    src/modules/       auth · reference · orders · planning · dashboard · health
  web/        Next.js 16 (App Router) + shadcn/ui (Base UI) + TanStack Query
    app/               routes only (thin)
    features/<role>/   screens grouped by role → domain (dispatcher/planning, …)
    components/        ui (shadcn) · layout · shared · brand
packages/
  engine/     pure TypeScript planner: scoring, feasibility, packing, explanations
  db/         Prisma schema, migrations, CSV seed, demo day
  shared/     constants (operating rules), labels, zod DTOs, time utils, CSV parser
data/         competition datasets (read by the seed)
docs/         architecture, data model, AI disclosure
```

Each layer has one job. The **engine** has no I/O, so it can be tested in isolation and is reused by the Datathon CLI. The **API** maps DB rows to engine input and persists results. The **web** app only talks to `/api` through a same-origin proxy.

---

## The demo day

**Thursday 8 Jan 2026** is an operating day one week before Thai Pongal. It isn't a payday and has no monsoon, which matches Datathon scenario **S1**.

- **Peliyagoda:** the 85 orders from `task2b_peak_day_scenarios.csv`. 10 of 38 vehicles are in the workshop, including 4 of the 8 reefers.
- **Kandy:** the 58 real orders for that date from `deliveries_train.csv`.
- Weekly fuel already used Mon–Wed is seeded, so fuel quotas are a live constraint.

Chilled demand (181.6 m³) exceeds the available reefer capacity (172.4 m³ across two trips each), so the planner has to defer some chilled orders.

---

## Judge walkthrough

### Dispatcher (built)
1. Sign in as **Dispatcher**. The **Command Center** shows 85 confirmed orders, "No plan for today" and the vehicles in the workshop.
2. Open **Planning → Generate plan**. The constraints, priority policy, demand and fleet availability (4/8 reefers) are listed. Click **Generate plan**.
3. **Review & adjust**: 72/85 orders are served on 23 trips.
   - Select a trip to see its stop sequence, arrival vs window, capacity, time budget and fuel.
   - The **Deferred orders** table gives each deferral's reason, whether it was unavoidable or a choice, and a score breakdown.
   - Click **Assign** on a deferred order and pick a trip. The server validates every rule and shows which ones would break.
   - Click **Defer** on a planned stop, choose a reason and add a note. The trip is re-timed and the decision is audit-logged.
4. Click **Publish plan**. Orders move to Planned or Deferred (rolled to the next operating day), drivers are attached to trips, fuel is reserved and store managers are notified.
5. **Orders**, **Trips** and **Vehicles** reflect the published plan. Command Center shows capacity pressure and recent activity.
6. Open **Live Operations** and press **Play** (30× is a good demo speed). Trips leave the depot and move along their routes.
   - Delays come from that district's traffic and road-disruption data for the day.
   - Alerts flag vehicles running late and outlets that will miss their window.
   - Click a vehicle or a trip row to see its stop-by-stop progress. Filter by brand or status, or search for a vehicle, outlet or driver.
7. Click **Open trip details** (or any row in **Trips**). The trip page shows:
   - the route map and KPIs
   - stops with planned vs actual times and window compliance
   - the load manifest in loading order
   - the operating-day trip log and the audit trail
   - live alerts and the trip's issues.
   Use **Report issue** to log a problem phoned in by the driver.
8. Open **Issues**. Field reports are listed alongside issues that live monitoring raised automatically (marked **Auto**) when a vehicle ran 30+ min late or an outlet was projected to miss its window. Click **Resolve**, then:
   - acknowledge the issue
   - pick playbook actions; "Notify the store" and "Message the driver" send real notifications
   - add a note and resolve. The history records who did what.
   Restarting the live clock withdraws the auto-raised issues.

### Driver (phone app)
The driver workspace is an installable, offline-first mobile app (PWA) at `/driver`. Judge it on a phone-sized screen: open the site on a phone, or use Chrome DevTools device mode (390 × 844).

1. Sign in as the **Driver** demo account. The first run shows **Getting ready**: the phone saves the app code, today's trip and the map along the route, so everything keeps working with no signal. After that the app opens straight away.
2. **Trip** tab: TRIP-013 with its stops. The trip is **claimed at the depot**: tap **To the depot** for turn-by-turn navigation inside the app. When the phone is within 300 m of the depot, **Claim trip** unlocks (if GPS is unavailable the driver can confirm manually). From then on the phone shares its GPS position with dispatch every `GPS_PING_SECONDS` (default 240 s = 4 min) and at every stop action.
3. **Map** tab: interactive Mapbox map with the road route, numbered stops, the next stop highlighted and your own position. **Navigate** (on the next-stop card or a stop) starts in-app turn-by-turn guidance: a tilted follow camera, a large next-maneuver banner, remaining time and distance, voice prompts (mutable) and automatic re-routing. With no signal it falls back to the road leg saved with the trip (with its steps), then to a straight heading. Without a Mapbox token (or without tiles offline) a route diagram is shown instead.
4. Tap **I've arrived** (offered automatically when you are within `ARRIVE_RADIUS_M` of the stop) → **Record delivery** → *Delivered in full*, *Partly delivered* (set quantities and a reason) or *Could not deliver* (reason, optional photo). Delivered and partial stops need the receiver's name and a signature; a photo is optional.
5. **Go offline** (DevTools → Network → Offline, or airplane mode) and keep working: deliver the next stop, report a problem. The banner says what is happening, **Me → Sync** lists every queued record, and everything uploads on reconnect with its original timestamp. Nothing is lost or doubled if the connection drops mid-upload.
6. **Issues** tab: every issue on the trip, whoever raised it (dispatch, loader, store manager, the driver, live monitoring), with who added it and when. **Report a problem** (breakdown, outlet closed, damaged goods…) adds one, with an optional photo, even offline.
   - **Issue chat.** Every issue has one group chat for everyone it affects (driver, loader, store manager). It is the same chat component as a direct conversation, in group mode (every message shows its sender and role) with @mentions of the issue, trip, outlet, vehicle or order. Messages from the driver queue offline like everything else. Drivers talk only in issue chats or to the dispatch desk (the **Message dispatch** button on the Issues tab), never to individuals.
   - **Dispatcher.** The issue page shows the chat read-only, with the Resolve panel for status changes and **Close chat / Reopen chat**. Dispatch does not post in issue chats.
   - **Loaders and store managers** see the same chats under *Issue chats* in their workspace.
7. When every stop is done tap **Complete trip**. The store manager's notifications and the dispatcher's **Live operations** reflect the delivery. TRIP-013 there shows "Driver app · GPS fix N min ago" and follows the real position and stop statuses instead of the replay.

**Demo mode.** Set `DEMO_MODE=true` in `.env` (and restart the API) to make the phone simulate GPS along the road route (pings every `DEMO_PING_SECONDS`), so the whole flow can be shown from a laptop without driving. The Trip and Me screens show a *Demo* badge. With `DEMO_MODE=false` the phone uses real GPS.

**Repeating the walkthrough.** `pnpm driver:reset` puts the demo day back to "nothing driven yet" (trips and stops planned/pending; driver events, proofs, GPS pings and driver-reported issues removed).

**Testing notes.** Service workers and GPS need HTTPS or `localhost`. Offline reload works fully in a production build (`pnpm --filter @waypoint/web build && pnpm --filter @waypoint/web start`); the dev server is not reliable for offline testing because its code chunks change constantly. Installing to the home screen: Chrome/Edge show **Install** (also on the Me tab); on iOS use Share → Add to Home Screen. Web apps cannot track in the background, so location is shared while the app is open; the screen is kept awake during a trip.

### Loader, Store manager
_In progress. The steps will be added here as each flow lands._

---

## Departures from the Designathon design

- **Visual system:** the flows and information architecture follow the Figma design. The visuals were rebuilt as a compact shadcn/ui system (Base UI primitives, green preset) for consistency across roles.
- **Command Center map → Capacity pressure:** demand vs capacity for reefers, vans, fleet volume and vehicles. On a planning day this tells the dispatcher more than a static map.
- **Live map:** Google Maps with the Waypoint light/dark styles when `GOOGLE_MAPS_API_KEY` is set. Without a key, a schematic network map shows the same data, so the demo never depends on a third-party key.
- **Live data source:** trips nobody has started follow a replay of the published plan (the clock can be played, paused and sped up). Once a driver starts a trip in the driver app, that trip follows what the driver reports: their GPS position and the stops they have completed.
- **Planning mode:** the "AI assisted / rule based / manual" choice became a single deterministic engine plus assisted manual edits (assign/defer with live validation). Results are reproducible and explainable.

---

## Environment

See [.env.example](.env.example). Key variables:
- `DATABASE_URL`, `JWT_SECRET`
- `API_URL`: where the web proxy forwards requests
- `DATA_DIR`: CSV location for the seed
- `DEMO_MODE`, `DEMO_PING_SECONDS`: driver app demo mode (simulated GPS) and its ping interval
- `GPS_PING_SECONDS` (240), `ARRIVE_RADIUS_M` (150): real-GPS reporting interval and the arrival geofence
- `WEB_PORT`, `DB_PORT`
- `GOOGLE_MAPS_API_KEY`: optional; enables the street map
- `PUBLIC_WS_URL`: optional; the live WebSocket URL when the API isn't on the same host at port 4000

For local `pnpm dev`, put `GOOGLE_MAPS_API_KEY` in `apps/web/.env.local`.
