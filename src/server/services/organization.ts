import { eq, notInArray, sql } from "drizzle-orm";
import { memberships, organizations, users } from "@/db/schema";
import { logger } from "@/modules/core/logger";
import { ForbiddenError, requireRole, type TenantContext } from "../context";
import { revokeAllSessionsForUser } from "../auth/session";

/**
 * Deletes an organization and everything it owns (deals, analyses, evidence,
 * watches, alerts, conversations…) through the cascading foreign keys, then
 * removes users left without any membership. Irreversible: the caller must
 * be an owner and repeat the organization slug.
 */
export async function deleteOrganization(ctx: TenantContext, confirmSlug: string): Promise<{ deletedUsers: number }> {
  requireRole(ctx, "owner");
  const [org] = await ctx.db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, ctx.organizationId))
    .limit(1);
  if (!org || org.slug !== confirmSlug) throw new ForbiddenError("La confirmación no coincide con la organización.");
  const members = await ctx.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.organizationId, ctx.organizationId));
  for (const m of members) await revokeAllSessionsForUser(ctx.db, m.userId);
  await ctx.db.delete(organizations).where(eq(organizations.id, ctx.organizationId));
  const remaining = ctx.db.select({ userId: memberships.userId }).from(memberships);
  const orphanIds = members.map((m) => m.userId);
  let deletedUsers = 0;
  if (orphanIds.length) {
    const deleted = await ctx.db
      .delete(users)
      .where(sql`${users.id} in ${orphanIds} and ${notInArray(users.id, remaining)}`)
      .returning({ id: users.id });
    deletedUsers = deleted.length;
  }
  logger.info("organization.deleted", { organizationId: ctx.organizationId, deletedUsers });
  return { deletedUsers };
}
