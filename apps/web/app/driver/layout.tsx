import type { Metadata, Viewport } from "next"

// The driver workspace is an installable, offline-capable mobile app (no desktop sidebar shell).
export const metadata: Metadata = {
  title: "Waypoint Driver",
  applicationName: "Waypoint Driver",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Waypoint", statusBarStyle: "default" },
  icons: { icon: "/logo-icon.png", apple: "/logo-icon.png" },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: "#0f6b3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children
}
