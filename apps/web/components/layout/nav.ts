import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CircleAlert,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  MapPinned,
  Radar,
  Route,
  Store,
  Truck,
  Workflow,
} from "lucide-react"
import type { Role } from "@waypoint/shared"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  badgeKey?: "exceptions" | "issues"
  soon?: boolean
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Navigation per role. Mirrors the Designathon information architecture. */
export const NAV: Record<Role, NavGroup[]> = {
  DISPATCHER: [
    { label: "Today", items: [{ title: "Command Center", href: "/dispatcher", icon: LayoutDashboard }] },
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
        { title: "Issues", href: "/dispatcher/issues", icon: CircleAlert, badgeKey: "issues", soon: true },
      ],
    },
    {
      label: "Resources",
      items: [
        { title: "Vehicles", href: "/dispatcher/vehicles", icon: Truck },
        { title: "Outlets", href: "/dispatcher/outlets", icon: Store, soon: true },
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
  LOADER: [{ label: "Dock", items: [{ title: "Loading", href: "/loader", icon: Boxes }] }],
  DRIVER: [{ label: "Road", items: [{ title: "My run", href: "/driver", icon: MapPinned }] }],
  STORE_MANAGER: [{ label: "Outlet", items: [{ title: "Orders", href: "/store", icon: Store }] }],
}

export const HOME: Record<Role, string> = {
  DISPATCHER: "/dispatcher",
  LOADER: "/loader",
  DRIVER: "/driver",
  STORE_MANAGER: "/store",
}
