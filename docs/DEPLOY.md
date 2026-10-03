# Deploying Waypoint (EC2 + DuckDNS)

Push to `main` → GitHub Actions builds the `api` and `web` images, pushes them to GHCR and restarts the stack on EC2.

```
GitHub Actions ──ssh──► EC2 (Ubuntu) ── Caddy :80/:443 (auto HTTPS) ─┬─ /socket.io → api:4000
                         DuckDNS name → Elastic IP                    └─ everything else → web:3000
```

## Repo owner checklist (one time)
Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
|---|---|
| `EC2_HOST` | the Elastic IP, e.g. `52.4.52.58` |
| `EC2_SSH_KEY` | the full contents of the `.pem` private key (including the BEGIN/END lines) |

No other setup is needed. The workflow logs the server into GHCR with its own short-lived token.
Also check Settings → Actions → General allows workflows to run.

## Server layout (`/opt/waypoint`)
- `docker-compose.prod.yml`, `Caddyfile` — copied there by every deploy.
- `.env` — created once by hand (never committed). Start from `.env.prod.example`:
  `GHCR_OWNER` (lowercase repo owner), `SITE_HOST` (DuckDNS name), `POSTGRES_PASSWORD`, `JWT_SECRET`, `MAPBOX_ACCESS_TOKEN`, `DEMO_MODE`.

## One-time server setup
Ubuntu 22.04+/26.04, Docker + compose plugin, 2 GB swap (1 GB RAM box), security group open on 22/80/443.

## Useful commands (on the server)
```bash
cd /opt/waypoint
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml up -d      # after editing .env
```

## Roll back
Every build is also tagged with its commit SHA. Set `IMAGE_TAG=<sha>` in `/opt/waypoint/.env` and run `up -d`.
