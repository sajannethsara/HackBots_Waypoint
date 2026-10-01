/** Thin fetch wrapper for the same-origin /api proxy. */

export interface Violation {
  rule: string
  message: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: { message?: string | string[]; violations?: Violation[]; issues?: { path: string; message: string }[] } = {},
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join(", ") : (body?.message ?? res.statusText)
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
    }
    throw new ApiError(res.status, msg, body ?? {})
  }
  return body as T
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v))
  const out = s.toString()
  return out ? `?${out}` : ""
}
