import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    dealId: text("deal_id"),
    title: text("title").notNull().default("Conversación con LIA"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_org_user").on(t.organizationId, t.userId), index("conversations_deal").on(t.dealId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    role: text("role").$type<"user" | "lia" | "system">().notNull(),
    content: text("content").notNull(),
    structured: jsonb("structured").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation").on(t.conversationId, t.createdAt)],
);
