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

### Loader, Driver, Store manager
_In progress. The steps will be added here as each flow lands._

---

## Departures from the Designathon design

- **Visual system:** the flows and information architecture follow the Figma design. The visuals were rebuilt as a compact shadcn/ui system (Base UI primitives, green preset) for consistency across roles.
- **Command Center map → Capacity pressure:** demand vs capacity for reefers, vans, fleet volume and vehicles. On a planning day this tells the dispatcher more than a static map.
- **Live map:** Google Maps with the Waypoint light/dark styles when `GOOGLE_MAPS_API_KEY` is set. Without a key, a schematic network map shows the same data, so the demo never depends on a third-party key.
- **Live data source:** until the driver app is in use, positions come from a replay of the published plan. The replay clock can be played, paused and sped up. Driver events will replace the simulated times.
- **Planning mode:** the "AI assisted / rule based / manual" choice became a single deterministic engine plus assisted manual edits (assign/defer with live validation). Results are reproducible and explainable.

---

## Environment

See [.env.example](.env.example). Key variables:
- `DATABASE_URL`, `JWT_SECRET`
- `API_URL`: where the web proxy forwards requests
- `DATA_DIR`: CSV location for the seed
- `WEB_PORT`, `DB_PORT`
- `GOOGLE_MAPS_API_KEY`: optional; enables the street map
- `PUBLIC_WS_URL`: optional; the live WebSocket URL when the API isn't on the same host at port 4000

For local `pnpm dev`, put `GOOGLE_MAPS_API_KEY` in `apps/web/.env.local`.
