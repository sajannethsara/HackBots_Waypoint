"use client"

import { lazy, Suspense } from "react"
import { Headset, MapIcon, MessageSquareWarning, Route, UserRound, WifiOff, type LucideIcon } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { Spinner } from "@/components/ui/spinner"
import { ChatProvider, useUnread } from "@/features/chat/use-chat"
import { cn } from "@/lib/utils"
import { Gate } from "./gate"
import { DriverProvider, useDriver } from "./lib/driver-provider"
import { NavigationProvider } from "./lib/navigation-provider"
import { loadInbox, loadIssueChat, loadMapScreen, loadReportIssue, loadStopFlow } from "./lib/lazy"
import { NavProvider, useNav, type Tab } from "./nav"
import { HomeScreen } from "./screens/home-screen"
import { IssuesScreen } from "./screens/issues-screen"
import { MeScreen } from "./screens/me-screen"
import { linkState, SyncChip } from "./ui"
import { TagBadge } from "@/components/shared/badges"

const MapScreen = lazy(loadMapScreen)
const InboxScreen = lazy(loadInbox)
const StopFlow = lazy(() => loadStopFlow().then((m) => ({ default: m.StopFlow })))
const IssueChatScreen = lazy(() => loadIssueChat().then((m) => ({ default: m.IssueChatScreen })))
const ReportIssue = lazy(() => loadReportIssue().then((m) => ({ default: m.ReportIssue })))

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "trip", label: "Trip", icon: Route },
  { id: "map", label: "Map", icon: MapIcon },
  { id: "issues", label: "Issues", icon: MessageSquareWarning },
  { id: "inbox", label: "Dispatch", icon: Headset },
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
        <Logo compact />
        <span className="text-sm font-semibold tracking-[0.18em] text-primary">WAYPOINT</span>
        <div className="ml-auto flex items-center gap-2">
          {d.config.demo && <TagBadge tone="violet">Demo</TagBadge>}
          <SyncChip state={state} onClick={() => setTab("me")} />
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
        {seen.has("inbox") && (
          <div className={cn(pane("inbox"), "overflow-hidden")}>
            <Suspense fallback={<Loading />}>
              <InboxScreen />
            </Suspense>
          </div>
        )}
        <div className={pane("issues")}>
          <IssuesScreen />
        </div>
        <div className={pane("me")}>
          <MeScreen />
        </div>
      </main>

      <nav className="z-20 grid shrink-0 grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
        {TABS.map((t) => {
          const on = tab === t.id
          const badge = t.id === "inbox" ? (unread?.unread ?? 0) : t.id === "issues" ? issueUnread : t.id === "me" ? d.failed.length : 0
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={on ? "page" : undefined} className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors", on ? "text-primary" : "text-muted-foreground active:text-foreground")}>
              <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", on && "bg-primary/10")}>
                <t.icon className="size-5" />
              </span>
              {t.label}
              {badge > 0 && <span className="absolute top-1.5 left-1/2 ml-2 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 text-white">{badge}</span>}
            </button>
          )
        })}
      </nav>

      <Suspense fallback={<Loading overlay />}>
        {overlay?.kind === "stop" && <StopFlow key={overlay.stopId} stopId={overlay.stopId} onClose={close} onReport={() => openIssue(overlay.stopId)} />}
        {overlay?.kind === "issue" && <ReportIssue stopId={overlay.stopId} onClose={close} />}
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
