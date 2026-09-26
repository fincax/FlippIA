import type { Database } from "@/db/client";

export type Role = "owner" | "admin" | "analyst" | "viewer";

/**
 * Everything a service needs to act on behalf of a user inside one tenant.
 * Every repository query filters by `organizationId`; there is no code path
 * that reads another organization's rows.
 */
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: Role;
  db: Database;
}

const ROLE_RANK: Record<Role, number> = { viewer: 0, analyst: 1, admin: 2, owner: 3 };

export function requireRole(ctx: TenantContext, minimum: Role): void {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[minimum]) {
    throw new ForbiddenError(`Requires role ${minimum}`);
  }
}

export class ForbiddenError extends Error {
  status = 403;
}

export class NotFoundError extends Error {
  status = 404;
}

export class UnauthorizedError extends Error {
  status = 401;
}
