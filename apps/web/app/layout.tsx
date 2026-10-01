import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"
import { Providers } from "./providers"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: { default: "Waypoint — Unified Delivery System", template: "%s · Waypoint" },
  description: "Ordering, planning, loading, delivery and receipt for Waypoint Fresh, Style and Tech.",
  icons: { icon: "/logo-icon.png" },
}

export const viewport: Viewport = { themeColor: "#0f6b3a" }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", fontMono.variable, inter.variable, "font-sans")}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
