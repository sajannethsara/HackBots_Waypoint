import { NextResponse, type NextRequest } from "next/server"

/** Send signed-out visitors of any role workspace to the login page. */
export function proxy(req: NextRequest) {
  if (!req.cookies.has("wp_session")) {
    const url = new URL("/login", req.url)
    url.searchParams.set("next", req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/dispatcher/:path*", "/loader/:path*", "/driver/:path*", "/store-manager/:path*"],
}
