import path from "node:path"
import type { NextConfig } from "next"

// Next only reads env files from apps/web; the shared keys (MAPBOX_ACCESS_TOKEN…) live in the repo-root .env.
// loadEnvFile never overrides a variable that is already set, so apps/web/.env.local still wins.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"))
} catch {
  // no root .env — fine
}

const nextConfig: NextConfig = {
  // Lets a production build live next to a running dev server (`NEXT_DIST_DIR=.next-prod next build`).
  // Self-contained server bundle for the Docker image (see Dockerfile `web` stage).
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The dev badge sits on top of the driver app's bottom tab bar on phones.
  devIndicators: false,
}

export default nextConfig
