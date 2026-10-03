"use client"

import { lazy, Suspense } from "react"
import { Bell, MapIcon, TriangleAlert, Route, UserRound, WifiOff, type LucideIcon } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { ChatProvider, useUnread } from "@/features/chat/use-chat"
import { cn } from "@/lib/utils"
import { Gate } from "./gate"
import { TransparentLogo } from "./transparent-logo"
import { DriverProvider, useDriver } from "./lib/driver-provider"
import { NavigationProvider } from "./lib/navigation-provider"
import { loadDispatchChat, loadIssueChat, loadMapScreen, loadReportIssue, loadStopFlow } from "./lib/lazy"
import { NavProvider, useNav, type Tab } from "./nav"
import { AlertsScreen } from "./screens/alerts-screen"
import { HomeScreen } from "./screens/home-screen"
import { IssuesScreen } from "./screens/issues-screen"
import { MeScreen } from "./screens/me-screen"
import { linkState, SyncIcon } from "./ui"
import { TagBadge } from "@/components/shared/badges"

const MapScreen = lazy(loadMapScreen)
const DispatchChat = lazy(loadDispatchChat)
const StopFlow = lazy(() => loadStopFlow().then((m) => ({ default: m.StopFlow })))
const IssueChatScreen = lazy(() => loadIssueChat().then((m) => ({ default: m.IssueChatScreen })))
const ReportIssue = lazy(() => loadReportIssue().then((m) => ({ default: m.ReportIssue })))

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "trip", label: "Trip", icon: Route },
  { id: "map", label: "Map", icon: MapIcon },
  { id: "issues", label: "Issues", icon: TriangleAlert },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "me", label: "Me", icon: UserRound },
]

export function DriverApp({ mapboxToken, wsUrl }: { mapboxToken?: string; wsUrl?: string }) {
  return (
    <Gate mapboxToken={mapboxToken}>
      {(b) => (
        <ChatProvider wsUrl={wsUrl}>
          <DriverProvider userId={b.userId} initial={b.bundle} mapboxToken={mapboxToken}>
            <NavProvider>
              <NavigationProvider>
                <Shell mapboxToken={mapboxToken} />
              </NavigationProvider>
            </NavProvider>
          </DriverProvider>
        </ChatProvider>
      )}
    </Gate>
  )
}

function Shell({ mapboxToken }: { mapboxToken?: string }) {
  const d = useDriver()
  const { tab, setTab, seen, overlay, close, openIssue } = useNav()
  const { data: unread } = useUnread()
  // Screens mount on first visit and then stay alive (the map keeps its camera, the inbox its thread).

  const issueUnread = d.bundle.issues.reduce((n, i) => n + (i.chat?.unread ?? 0), 0)
  const state = linkState({ online: d.online, syncing: d.syncing, pending: d.pending, failed: d.failed.length, expired: d.sessionExpired })
  const pane = (id: Tab) => cn("absolute inset-0 overflow-y-auto overscroll-contain", tab !== id && "hidden")

  return (
    <div className="fixed inset-0 flex flex-col bg-muted/30 select-none [&_input]:select-text [&_textarea]:select-text">
      <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur" style={{ height: "calc(3rem + env(safe-area-inset-top))" }}>
        <TransparentLogo className="size-8 dark:brightness-[1.9]" />
        {/* <span className="text-sm font-semibold tracking-[0.18em] text-primary dark:text-emerald-400">WAYPOINT</span> */}
        <div className="ml-auto flex items-center gap-2">
          {d.config.demo && <TagBadge tone="violet">Demo</TagBadge>}
          <SyncIcon state={state} onClick={() => setTab("me")} />
        </div>
      </header>

      {!d.online && (
        <div className="z-10 flex shrink-0 items-start gap-2 border-b border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <WifiOff className="mt-0.5 size-3.5 shrink-0" />
          <p>
            <span className="font-medium">No signal.</span> Keep working: everything you record is saved on this phone and uploads when you are back online.
          </p>
        </div>
      )}

      <main className="relative min-h-0 flex-1">
        <div className={pane("trip")}>
          <HomeScreen />
        </div>
        {seen.has("map") && (
          <div className={cn(pane("map"), "overflow-hidden")}>
            <Suspense fallback={<Loading />}>
              <MapScreen token={mapboxToken} active={tab === "map"} />
            </Suspense>
          </div>
        )}
        <div className={pane("issues")}>
          <IssuesScreen />
        </div>
        <div className={pane("alerts")}>
          <AlertsScreen />
        </div>
        <div className={pane("me")}>
          <MeScreen />
        </div>
      </main>

      <nav
        className="relative z-20 grid shrink-0 grid-cols-5 rounded-t-[1.75rem] border-t bg-background px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_-12px_rgb(0_0_0/0.18)]"
        aria-label="Main"
      >
        {TABS.map((t) => {
          const on = tab === t.id
          const badge = t.id === "issues" ? issueUnread + (unread?.unread ?? 0) : t.id === "me" ? d.failed.length : 0
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={on ? "page" : undefined}
              className={cn("relative mx-0.5 flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] leading-none font-medium transition-colors duration-200", on ? "bg-primary/12 text-primary" : "text-muted-foreground active:bg-muted")}
            >
              <span className="relative grid h-6 w-10 place-items-center">
                <t.icon className="size-[22px]" strokeWidth={on ? 2.25 : 1.75} />
                {badge > 0 && (
                  <span className="absolute -top-0.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-background">{badge > 9 ? "9+" : badge}</span>
                )}
              </span>
              {t.label}
            </button>
          )
        })}
      </nav>

      <Suspense fallback={<Loading overlay />}>
        {overlay?.kind === "stop" && <StopFlow key={overlay.stopId} stopId={overlay.stopId} onClose={close} onReport={() => openIssue(overlay.stopId)} />}
        {overlay?.kind === "issue" && <ReportIssue stopId={overlay.stopId} onClose={close} />}
        {overlay?.kind === "dispatch" && <DispatchChat onClose={close} />}
        {overlay?.kind === "chat" && <IssueChatScreen key={overlay.issueId} issueId={overlay.issueId} onClose={close} />}
      </Suspense>
    </div>
  )
}

function Loading({ overlay }: { overlay?: boolean }) {
  return (
    <div className={cn("grid place-items-center text-muted-foreground", overlay ? "fixed inset-0 z-50 bg-background/60" : "h-full")}>
      <Spinner className="size-5" />
    </div>
  )
}
