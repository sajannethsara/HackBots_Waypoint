import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Waypoint Driver",
    short_name: "Waypoint",
    description: "Routes, proof of delivery and live updates for Waypoint drivers. Works without signal.",
    start_url: "/driver",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6fbf4",
    theme_color: "#0f6b3a",
    icons: [
      { src: "/logo-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/logo-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo-icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
    shortcuts: [{ name: "My trip", url: "/driver" }],
  }
}
