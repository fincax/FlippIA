import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

const SESSION_COOKIE = "flippia_session";
const CSP_HEADER = "Content-Security-Policy";

/**
 * Request proxy, two responsibilities:
 *
 * 1. Edge gate: app routes require a session cookie. The cookie is validated
 *    against the database inside server components / handlers; here we only
 *    redirect the obviously anonymous requests to the login page.
 * 2. Per-request CSP nonce. The nonce travels in the `x-nonce` request header
 *    and in the `Content-Security-Policy` request header, which Next.js parses
 *    to attach `nonce` to every script it renders. The same policy is sent to
 *    the browser on the response.
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

  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce, {
    allowEval: process.env.NODE_ENV !== "production",
  });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CSP_HEADER, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Every request except:
     * - api (route handlers: JSON, no HTML)
     * - _next/static, _next/image (static assets)
     * - favicon.ico, icon.svg, manifest.webmanifest (metadata files)
     * and except router prefetches, which never render a document.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
