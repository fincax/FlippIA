import { boolean, doublePrecision, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { OpportunityListing } from "@/modules/adapters/sources/types";
import type { RegulationVersion } from "@/modules/regulatory/types";

/** Listings from authorised sources. organization_id null = shared (demo / public feeds). */
export const opportunityListings = pgTable(
  "opportunity_listings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    sourceId: text("source_id").notNull(),
    microzoneId: text("microzone_id"),
    assetUse: text("asset_use").notNull(),
    askingPrice: doublePrecision("asking_price").notNull(),
    status: text("status").$type<"active" | "withdrawn" | "sold">().notNull().default("active"),
    data: jsonb("data").$type<OpportunityListing>().notNull(),
    demo: boolean("demo").notNull().default(false),
    publishedAt: text("published_at").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listings_zone_price").on(t.microzoneId, t.askingPrice)],
);

export const regulationVersions = pgTable(
  "regulation_versions",
  {
    id: text("id").primaryKey(),
    regulationId: text("regulation_id").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    topics: jsonb("topics").$type<string[]>().notNull(),
    effectiveFrom: text("effective_from").notNull(),
    status: text("status").notNull(),
    data: jsonb("data").$type<RegulationVersion>().notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("regversions_regulation").on(t.regulationId)],
);

export const partners = pgTable("partners", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  kind: text("kind").$type<"architect" | "broker" | "agent" | "contractor" | "lawyer" | "lender" | "other">().notNull(),
  name: text("name").notNull(),
  contact: jsonb("contact").$type<Record<string, string>>().notNull().default({}),
  attribution: jsonb("attribution").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  dealId: text("deal_id").notNull(),
  status: text("status").$type<"planning" | "licensing" | "works" | "commercialization" | "completed">().notNull().default("planning"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const milestones = pgTable("milestones", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  plannedAt: text("planned_at"),
  completedAt: text("completed_at"),
  status: text("status").$type<"pending" | "done" | "delayed">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
