"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronsUpDown, LogOut, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { ROLE_LABEL, type Role } from "@waypoint/shared"
import { Logo } from "@/components/brand/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useLogout, useMe } from "@/hooks/use-session"
import { initials } from "@/lib/format"
import { NAV } from "./nav"

export function AppSidebar({ role, badges = {} }: { role: Role; badges?: Partial<Record<string, number>> }) {
  const pathname = usePathname()
  const { data: me } = useMe()
  const logout = useLogout()
  const { resolvedTheme, setTheme } = useTheme()
  const isActive = (href: string) => (href.split("/").length <= 2 ? pathname === href : pathname.startsWith(href))
  // Sub-links: the most specific one that matches wins, so "/orders/new" does not also light up "/orders".
  const activeChild = (children: { href: string }[]) =>
    children
      .filter((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b">
        <Logo subtitle={ROLE_LABEL[role]} className="px-1 group-data-[collapsible=icon]:px-0" />
      </SidebarHeader>
      <SidebarContent className="gap-0 py-1">
        {NAV[role].map((g) => (
          <SidebarGroup key={g.label} className="py-1">
            <SidebarGroupLabel className="h-6 text-[10px] tracking-wider uppercase">{g.label}</SidebarGroupLabel>
            <SidebarMenu>
              {g.items.map((item) => {
                const count = item.badgeKey ? badges[item.badgeKey] : undefined
                const current = item.children ? activeChild(item.children) : undefined
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={item.children ? Boolean(current) : isActive(item.href)}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                      className="data-active:font-medium"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      {item.soon && !count && <span className="ml-auto text-[10px] text-muted-foreground/60">soon</span>}
                    </SidebarMenuButton>
                    {!!count && (
                      <SidebarMenuBadge className="rounded-full bg-destructive/10 text-destructive">{count}</SidebarMenuBadge>
                    )}
                    {item.children && (
                      <SidebarMenuSub>
                        {item.children.map((c) => (
                          <SidebarMenuSubItem key={c.href}>
                            <SidebarMenuSubButton isActive={current === c.href} render={<Link href={c.href} />}>
                              <span>{c.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary/10 text-xs text-primary">
                    {me ? initials(me.name) : "··"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{me?.name ?? "…"}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {me?.depot?.name ?? me?.outlet?.name ?? ROLE_LABEL[role]}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs">{me?.email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                  {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} variant="destructive">
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
