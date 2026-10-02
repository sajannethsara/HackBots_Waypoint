import type { DriverBundle, DriverMediaInput, DriverSyncInput, DriverSyncResult } from "@waypoint/shared"

/**
 * Network calls for the driver app. Unlike the dispatcher's `api()`, nothing here redirects:
 * a driver with no signal or an expired session must keep working, so failures are typed
 * and the caller decides (keep the record queued, show a banner).
 */

export class OfflineError extends Error {
  constructor() {
    super("No connection")
  }
}
export class SessionError extends Error {
  constructor() {
    super("Session expired")
  }
}
export class ServerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown; timeoutMs?: number }): Promise<T> {
  const { json, timeoutMs = 20_000, ...rest } = init ?? {}
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      credentials: "include",
      cache: "no-store",
      ...rest,
      signal: ctl.signal,
      headers: json !== undefined ? { "content-type": "application/json" } : undefined,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    })
  } catch {
    throw new OfflineError()
  } finally {
    clearTimeout(timer)
  }
  // The proxy turns an unreachable API into a 5xx; treat gateway errors like being offline.
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError()
  if (res.status === 401) throw new SessionError()
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new ServerError(res.status, Array.isArray(body?.message) ? body.message.join(", ") : (body?.message ?? res.statusText))
  return body as T
}

export const fetchMe = () => call<{ id: string; name: string; role: string }>("/auth/me", { timeoutMs: 8_000 })
export const fetchBundle = () => call<DriverBundle>("/driver/bundle", { timeoutMs: 25_000 })
export const postSync = (body: DriverSyncInput) => call<DriverSyncResult>("/driver/sync", { method: "POST", json: body })
export const postMedia = (body: DriverMediaInput) => call<{ id: string }>("/driver/media", { method: "POST", json: body, timeoutMs: 40_000 })
export const postLogout = () => call("/auth/logout", { method: "POST" })

export const fetchIssueChat = (chatId: string) => call<import("@waypoint/shared").IssueChatDetail>(`/issue-chats/${chatId}`, { timeoutMs: 15_000 })
export const postChatRead = (chatId: string) => call<{ ok: boolean }>(`/issue-chats/${chatId}/read`, { method: "POST", timeoutMs: 8_000 })
