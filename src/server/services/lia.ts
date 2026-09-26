import { and, asc, desc, eq } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import { newId } from "@/modules/core/ids";
import type { TenantContext } from "../context";

export async function getOrCreateConversation(ctx: TenantContext, dealId?: string) {
  const where = dealId
    ? and(
        eq(conversations.organizationId, ctx.organizationId),
        eq(conversations.userId, ctx.userId),
        eq(conversations.dealId, dealId),
      )
    : and(eq(conversations.organizationId, ctx.organizationId), eq(conversations.userId, ctx.userId));
  const [existing] = await ctx.db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  if (existing) return existing;
  const [row] = await ctx.db
    .insert(conversations)
    .values({
      id: newId("cnv"),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dealId: dealId ?? null,
      title: dealId ? "Ask this property" : "LIA",
    })
    .returning();
  return row!;
}

export async function appendMessage(
  ctx: TenantContext,
  conversationId: string,
  role: "user" | "lia" | "system",
  content: string,
  structured?: Record<string, unknown>,
) {
  const [row] = await ctx.db
    .insert(messages)
    .values({
      id: newId("msg"),
      conversationId,
      organizationId: ctx.organizationId,
      role,
      content: content.slice(0, 20_000),
      structured: structured ?? null,
    })
    .returning();
  await ctx.db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, ctx.organizationId)));
  return row!;
}

export async function listMessages(ctx: TenantContext, conversationId: string, limit = 50) {
  return ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.organizationId, ctx.organizationId)))
    .orderBy(asc(messages.createdAt))
    .limit(limit);
}
