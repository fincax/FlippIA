import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships, organizations, sessions, users } from "@/db/schema";
import { newId } from "@/modules/core/ids";
import type { Role } from "../context";
import { appSecret } from "../env";

export const SESSION_COOKIE = "flippia_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface SessionInfo {
  sessionId: string;
  userId: string;
  organizationId: string;
  role: Role;
  user: { id: string; email: string; name: string; locale: string };
  organization: { id: string; name: string; slug: string; demo: boolean };
  expiresAt: Date;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(
  d: Database,
  params: { userId: string; organizationId: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  // Opportunistic housekeeping: expired sessions are useless rows.
  await d.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await d.insert(sessions).values({
    id: newId("ses"),
    userId: params.userId,
    organizationId: params.organizationId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: params.userAgent?.slice(0, 200),
  });
  return { token, expiresAt };
}

export async function resolveSession(d: Database, token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null;
  const rows = await d
    .select({ session: sessions, user: users, org: organizations, membership: memberships })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, sessions.organizationId))
    .innerJoin(
      memberships,
      and(eq(memberships.userId, sessions.userId), eq(memberships.organizationId, sessions.organizationId)),
    )
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.session.id,
    userId: row.user.id,
    organizationId: row.org.id,
    role: row.membership.role,
    user: { id: row.user.id, email: row.user.email, name: row.user.name, locale: row.user.locale },
    organization: { id: row.org.id, name: row.org.name, slug: row.org.slug, demo: row.org.demo === 1 },
    expiresAt: row.session.expiresAt,
  };
}

export async function revokeSession(d: Database, token: string): Promise<void> {
  await d.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** CSRF token bound to the session (double submit, HMAC with APP_SECRET). */
export function csrfTokenFor(sessionId: string, secret = appSecret()): string {
  return createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url");
}

export function verifyCsrf(
  sessionId: string,
  provided: string | null | undefined,
  secret = appSecret(),
): boolean {
  if (!provided) return false;
  const expected = Buffer.from(csrfTokenFor(sessionId, secret));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
