import { and, desc, eq } from "drizzle-orm";
import { humanReviews } from "@/db/schema";
import { newId } from "@/modules/core/ids";
import { eventBus } from "@/modules/core/events";
import { requireRole, type TenantContext } from "../context";
import { logActivity } from "./deals";
import { z } from "zod";

export const reviewSchema = z.object({
  dealId: z.string().min(1),
  analysisId: z.string().optional(),
  role: z.enum(["ai_precheck", "technical", "architect", "real_estate", "legal", "tax"]),
  scope: z.string().min(1).max(200),
  status: z.enum(["approved", "rejected", "changes_requested"]),
  professionalId: z.string().max(100).optional(),
  comments: z.string().max(4000).default(""),
});

export async function recordReview(ctx: TenantContext, input: z.infer<typeof reviewSchema>) {
  requireRole(ctx, "analyst");
  const parsed = reviewSchema.parse(input);
  const previous = await ctx.db
    .select({ version: humanReviews.version })
    .from(humanReviews)
    .where(
      and(
        eq(humanReviews.organizationId, ctx.organizationId),
        eq(humanReviews.dealId, parsed.dealId),
        eq(humanReviews.role, parsed.role),
      ),
    )
    .orderBy(desc(humanReviews.version))
    .limit(1);
  const version = (previous[0]?.version ?? 0) + 1;
  const [row] = await ctx.db
    .insert(humanReviews)
    .values({
      id: newId("rev"),
      organizationId: ctx.organizationId,
      dealId: parsed.dealId,
      analysisId: parsed.analysisId ?? null,
      reviewerUserId: ctx.userId,
      role: parsed.role,
      scope: parsed.scope,
      version,
      status: parsed.status,
      professionalId: parsed.professionalId ?? null,
      comments: parsed.comments,
    })
    .returning();
  await logActivity(ctx, parsed.dealId, "review.recorded", `Revisión ${parsed.role}: ${parsed.status}`, {
    version,
    scope: parsed.scope,
  });
  await eventBus().emit({
    id: newId("evt"),
    name: "HumanReviewRecorded",
    occurredAt: new Date().toISOString(),
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    dealId: parsed.dealId,
    payload: { role: parsed.role, status: parsed.status },
  });
  return row!;
}

export async function listReviews(ctx: TenantContext, dealId: string) {
  return ctx.db
    .select()
    .from(humanReviews)
    .where(and(eq(humanReviews.organizationId, ctx.organizationId), eq(humanReviews.dealId, dealId)))
    .orderBy(desc(humanReviews.createdAt));
}
