import {
  AlertTriangle,
  Archive,
  BarChart3,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  Radar,
  Route,
  Settings,
  Store,
  Truck,
  Workflow,
} from "lucide-react"
import type { Role } from "@waypoint/shared"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  badgeKey?: "exceptions" | "issues" | "inbox" | "flagged"
  soon?: boolean
  /** Sub-links shown under the item (the parent link is also its first destination). */
  children?: { title: string; href: string }[]
  /** Other path prefixes that belong to this item (it stays highlighted there). */
  match?: string[]
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Navigation per role. Mirrors the Designathon information architecture. */
export const NAV: Record<Role, NavGroup[]> = {
  DISPATCHER: [
    {
      label: "Today",
      items: [
        { title: "Command Center", href: "/dispatcher", icon: LayoutDashboard },
        { title: "Inbox", href: "/dispatcher/inbox", icon: MessagesSquare, badgeKey: "inbox" },
      ],
    },
    {
      label: "Planning",
      items: [
        { title: "Orders", href: "/dispatcher/orders", icon: ClipboardList },
        { title: "Planning", href: "/dispatcher/planning", icon: Workflow },
        { title: "Exceptions", href: "/dispatcher/exceptions", icon: AlertTriangle, badgeKey: "exceptions", soon: true },
      ],
    },
    {
      label: "Operations",
      items: [
        { title: "Live Operations", href: "/dispatcher/live", icon: Radar },
        { title: "Trips", href: "/dispatcher/trips", icon: Route },
        { title: "Issues", href: "/dispatcher/issues", icon: CircleAlert, badgeKey: "issues" },
      ],
    },
    {
      label: "Resources",
      items: [
        { title: "Vehicles", href: "/dispatcher/vehicles", icon: Truck },
        { title: "Outlets", href: "/dispatcher/outlets", icon: Store },
      ],
    },
    {
      label: "Analytics",
      items: [
        { title: "Reports", href: "/dispatcher/reports", icon: BarChart3, soon: true },
        { title: "Capacity Planning", href: "/dispatcher/capacity", icon: Gauge, soon: true },
      ],
    },
  ],
  LOADER: [
    {
      label: "Loading",
      items: [
        { title: "Dashboard", href: "/loader/dashboard", icon: LayoutDashboard },
        { title: "Loading Queue", href: "/loader/queue", icon: Archive, badgeKey: "flagged", match: ["/loader/vehicles", "/loader/issues"] },
        { title: "My Loaded Vehicles", href: "/loader/loaded", icon: CircleCheck },
      ],
    },
    { label: "Dock", items: [{ title: "Inbox", href: "/loader/inbox", icon: MessagesSquare, badgeKey: "inbox" }] },
    { label: "Account", items: [{ title: "Settings", href: "/loader/settings", icon: Settings }] },
  ],
  DRIVER: [{ label: "Road", items: [{ title: "Inbox", href: "/driver", icon: MessagesSquare, badgeKey: "inbox" }] }],
  STORE_MANAGER: [{ label: "Outlet", items: [{ title: "Inbox", href: "/store", icon: MessagesSquare, badgeKey: "inbox" }] }],
}

export const HOME: Record<Role, string> = {
  DISPATCHER: "/dispatcher",
  LOADER: "/loader",
  DRIVER: "/driver",
  STORE_MANAGER: "/store",
}
