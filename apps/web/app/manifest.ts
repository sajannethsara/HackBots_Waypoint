import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Waypoint Driver",
    short_name: "Waypoint",
    description: "Routes, proof of delivery and live updates for Waypoint drivers. Works without signal.",
    id: "/driver",
    start_url: "/driver",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#f6fbf4",
    theme_color: "#0f6b3a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "My trip", url: "/driver" }],
  }
}
