"use client"

/**
 * Screens loaded on demand. The readiness gate imports all of them up front while there is a
 * connection, so every chunk is saved by the service worker before the driver needs it offline.
 */
export const loadMapScreen = () => import("../screens/map-screen")
export const loadStopFlow = () => import("../flow/stop-flow")
export const loadReportIssue = () => import("../flow/report-issue")
export const loadInbox = () => import("../screens/inbox-screen")
export const loadIssueChat = () => import("../flow/issue-chat-screen")

export const preloadAll = () => Promise.all([loadMapScreen(), loadStopFlow(), loadReportIssue(), loadInbox(), loadIssueChat()])
