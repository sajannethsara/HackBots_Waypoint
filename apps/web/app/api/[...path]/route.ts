import type { NextRequest } from "next/server"

/**
 * Same-origin proxy to the Nest API. Keeps the session cookie first-party and lets the
 * API URL be set at runtime (API_URL), which matters inside Docker.
 */
const API_URL = process.env.API_URL ?? "http://localhost:4000"

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const target = `${API_URL}/api/${path.join("/")}${req.nextUrl.search}`
  const headers = new Headers(req.headers)
  headers.delete("host")
  headers.delete("connection")
  const hasBody = !["GET", "HEAD"].includes(req.method)
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  })
  const out = new Headers(res.headers)
  out.delete("content-encoding")
  out.delete("content-length")
  out.delete("transfer-encoding")
  return new Response(res.body, { status: res.status, headers: out })
}

export const dynamic = "force-dynamic"
export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE }
