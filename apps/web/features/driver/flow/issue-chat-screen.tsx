"use client"

import { ArrowLeft, ChevronDown, WifiOff } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ISSUE_TYPE_META, ROLE_LABEL, type IssueChatDetail } from "@waypoint/shared"
import { IssueStatusBadge, SeverityBadge } from "@/features/dispatcher/issues/issue-badges"
import { PersonAvatar } from "@/features/chat/chat-parts"
import { IssueChatView } from "@/features/issue-chat/issue-chat-view"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fetchIssueChat, OfflineError, postChatRead } from "../lib/driver-api"
import { useDriver } from "../lib/driver-provider"
import { kvGet, kvSet } from "../lib/idb"

/**
 * One issue's group chat on the phone. Works with no signal: the last thread seen is kept on the
 * phone, and what the driver writes joins the outbox and posts on reconnect.
 */
export function IssueChatScreen({ issueId, onClose }: { issueId: string; onClose: () => void }) {
  const { bundle, userId, outbox, online, sendChat, markIssueRead, retryFailed, discard } = useDriver()
  const issue = bundle.issues.find((i) => i.id === issueId)
  const chatId = issue?.chat?.id ?? null
  const [detail, setDetail] = useState<IssueChatDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const pending = useMemo(
    () =>
      outbox
        .filter((o) => o.kind === "chat" && (o.payload as { chatId: string }).chatId === chatId)
        .map((o) => ({ id: o.id, body: (o.payload as { body: string }).body, createdAt: o.createdAt, failed: !!o.failed })),
    [outbox, chatId],
  )

  const load = useCallback(async () => {
    if (!chatId) return
    try {
      const d = await fetchIssueChat(chatId)
      setDetail(d)
      setOffline(false)
      void kvSet(userId, `chat:${chatId}`, d)
    } catch (e) {
      if (e instanceof OfflineError) setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [chatId, userId])

  // Show the saved thread at once, then refresh. Refresh again on a socket nudge, on reconnect and every 20 s.
  useEffect(() => {
    if (!chatId) return
    void kvGet<IssueChatDetail>(userId, `chat:${chatId}`).then((saved) => saved && setDetail((cur) => cur ?? saved))
    queueMicrotask(() => void load())
    const nudge = () => void load()
    window.addEventListener("wp:issue-chat", nudge)
    const id = setInterval(nudge, 20_000)
    return () => {
      window.removeEventListener("wp:issue-chat", nudge)
      clearInterval(id)
    }
  }, [chatId, userId, load])
  useEffect(() => {
    if (online) queueMicrotask(() => void load())
  }, [online, load])
  // Messages that just reached the server: pull the stored copy.
  const pendingCount = pending.length
  const prev = useRef(pendingCount)
  useEffect(() => {
    if (pendingCount < prev.current) void load()
    prev.current = pendingCount
  }, [pendingCount, load])

  const onRead = useCallback(() => {
    if (!chatId) return
    markIssueRead(chatId)
    void postChatRead(chatId).catch(() => {})
  }, [chatId, markIssueRead])

  if (!issue) return null
  const view: IssueChatDetail | null = detail ? { ...detail, chat: { ...detail.chat, unread: issue.chat?.unread ?? 0 } } : null

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="shrink-0 border-b pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center gap-2 px-2">
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Back">
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {ISSUE_TYPE_META[issue.type].label} <span className="font-normal text-muted-foreground">· {issue.ref}</span>
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {detail ? `${detail.chat.members.length} in this chat` : "Issue chat"}
              {issue.outletName ? ` · ${issue.outletName}` : ""}
            </p>
          </div>
          <IssueStatusBadge status={issue.status} />
          <Button variant="ghost" size="icon-sm" onClick={() => setShowInfo((s) => !s)} aria-label="Issue details" aria-expanded={showInfo}>
            <ChevronDown className={cn("transition-transform", showInfo && "rotate-180")} />
          </Button>
        </div>
        {showInfo && (
          <div className="grid gap-2 border-t bg-muted/30 px-3 py-2.5 text-sm">
            <div className="flex items-center gap-1.5">
              <SeverityBadge severity={issue.severity} />
              <span className="text-xs text-muted-foreground">
                Reported by {issue.reportedBy.role === "SYSTEM" ? issue.reportedBy.name : `${issue.reportedBy.name} (${ROLE_LABEL[issue.reportedBy.role]})`}
              </span>
            </div>
            <p>{issue.description}</p>
            {issue.resolution && <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">Resolution: {issue.resolution}</p>}
            {detail && (
              <div className="flex flex-wrap gap-1.5">
                {detail.chat.members.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2 pl-0.5 text-xs">
                    <PersonAvatar name={m.name} role={m.role} size="sm" /> {m.name.split(" ")[0]}
                    <span className="text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {!chatId ? (
        <p className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">This issue&apos;s chat is not ready yet. It opens once the report reaches dispatch.</p>
      ) : (
        <IssueChatView
          detail={view}
          loading={loading}
          viewerId={bundle.driver.id}
          viewerName={bundle.driver.name}
          viewerRole="DRIVER"
          touch
          pending={pending}
          onRetry={retryFailed}
          onDiscard={discard}
          onRead={onRead}
          onSend={(body) => sendChat(chatId, body)}
          note={
            offline || !online ? (
              <span className="flex items-center gap-1.5">
                <WifiOff className="size-3" /> No signal. {detail ? "Showing the last messages saved on this phone. " : ""}Your messages send when you reconnect.
              </span>
            ) : null
          }
        />
      )}
    </div>
  )
}
