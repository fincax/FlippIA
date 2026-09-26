import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "flippia_session";

/**
 * Edge gate: app routes require a session cookie. The cookie is validated
 * against the database inside server components / handlers; here we only
 * redirect the obviously anonymous requests to the login page.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/app")) {
    if (!req.cookies.get(SESSION_COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };
