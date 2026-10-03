# Single multi-target Dockerfile for the monorepo.
#   docker compose up --build   → builds slim `api` and `web` runtime images.
# Stages `deps` → `build` are heavy and only used while building; the final `api` and `web` stages
# copy just what they need to run (production deps / Next standalone output).

FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat \
 && corepack enable && corepack prepare pnpm@10.7.1 --activate
WORKDIR /repo

# ── manifests only (cache layer shared by the install stages) ──
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/db/prisma packages/db/prisma

# ── full install (dev deps included) for compiling ──
FROM manifests AS deps
RUN pnpm install --frozen-lockfile

# ── build everything in dependency order ──
FROM deps AS build
COPY . .
RUN pnpm --filter @waypoint/shared build \
 && pnpm --filter @waypoint/engine build \
 && pnpm --filter @waypoint/db build \
 && pnpm --filter @waypoint/api build \
 && pnpm --filter @waypoint/web build

# ── production-only deps for the API (no web, no dev tooling) ──
FROM manifests AS api-deps
RUN pnpm install --frozen-lockfile --prod --filter "@waypoint/api..." \
 && cd packages/db && ./node_modules/.bin/prisma generate

# ── API runtime: also carries the prisma CLI + seed so one image can migrate, seed and serve ──
FROM base AS api
ENV NODE_ENV=production UPLOAD_DIR=/uploads DATA_DIR=/repo/data
COPY --from=api-deps /repo ./
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/engine/dist packages/engine/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY data data
RUN mkdir -p /uploads && chown node:node /uploads
USER node
EXPOSE 4000
WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]

# ── Web runtime: Next standalone output (traced files only) ──
FROM node:22-alpine AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
