# Single multi-target Dockerfile for the monorepo.
#   docker compose up --build   → builds `api` and `web` from the same workspace install.

FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat \
 && corepack enable && corepack prepare pnpm@10.7.1 --activate
WORKDIR /repo

# ── install (cached on manifests only) ──
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/db/prisma packages/db/prisma
RUN pnpm install --frozen-lockfile

# ── build everything in dependency order ──
FROM deps AS build
COPY . .
RUN pnpm --filter @waypoint/shared build \
 && pnpm --filter @waypoint/engine build \
 && pnpm --filter @waypoint/db build \
 && pnpm --filter @waypoint/api build \
 && pnpm --filter @waypoint/web build

# ── API: migrate → seed (no-op if already seeded) → serve ──
FROM build AS api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "cd /repo/packages/db && npx prisma migrate deploy && node dist/seed/index.js && cd /repo/apps/api && node dist/main.js"]

# ── Web ──
FROM build AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["sh", "-c", "cd /repo/apps/web && npx next start -p 3000"]
