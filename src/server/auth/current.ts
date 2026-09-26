import { cookies, headers } from "next/headers";
import { db } from "@/db/client";
import type { TenantContext } from "../context";
import { UnauthorizedError } from "../context";
import { resolveSession, SESSION_COOKIE, type SessionInfo, verifyCsrf } from "./session";

/** Server-side helpers for route handlers and server components. */
export async function currentSession(): Promise<SessionInfo | null> {
  const store = await cookies();
  return resolveSession(db(), store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) throw new UnauthorizedError("No autenticado");
  return s;
}

export async function tenantContext(): Promise<{ ctx: TenantContext; session: SessionInfo }> {
  const session = await requireSession();
  return { ctx: { organizationId: session.organizationId, userId: session.userId, role: session.role, db: db() }, session };
}

/** For mutating route handlers: session + CSRF header check. */
export async function requireMutation(): Promise<{ ctx: TenantContext; session: SessionInfo }> {
  const r = await tenantContext();
  const h = await headers();
  if (!verifyCsrf(r.session.sessionId, h.get("x-csrf-token"))) throw new UnauthorizedError("CSRF inválido");
  return r;
}
