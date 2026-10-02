import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Lets a production build live next to a running dev server (`NEXT_DIST_DIR=.next-prod next build`).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The dev badge sits on top of the driver app's bottom tab bar on phones.
  devIndicators: false,
}

export default nextConfig
