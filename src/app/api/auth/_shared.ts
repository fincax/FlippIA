import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

export function withSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}

/**
 * Rate-limit key for anonymous requests. Behind a reverse proxy the last
 * `x-forwarded-for` hop is the one the proxy appended, so a client cannot
 * spoof it by prepending values.
 */
export function clientKey(req: Request): string {
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.at(-1) || req.headers.get("x-real-ip") || "local";
}
