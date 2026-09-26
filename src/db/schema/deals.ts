import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { geometry } from "drizzle-orm/pg-core";
import type { AnalysisResult } from "@/modules/analysis/types";
import type { AgentRunRecord } from "@/modules/agents/runtime/types";
import type { Evidence } from "@/modules/evidence/types";
import type { ScenarioSet } from "@/modules/engines/scenario/types";
import type { InvestorDNA } from "@/modules/investor/types";
import type { IntakeRequest } from "@/modules/property/intake";
import type { Property } from "@/modules/property/types";
import type { RegulatorySnapshot } from "@/modules/regulatory/types";
import { organizations, users } from "./core";

export const investorProfiles = pgTable(
  "investor_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dna: jsonb("dna").$type<InvestorDNA>().notNull(),
    version: integer("version").notNull().default(1),
    completed: boolean("completed").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("investor_profiles_org_user").on(t.organizationId, t.userId)],
);

export const properties = pgTable(
  "properties",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cityId: text("city_id").notNull(),
    microzoneId: text("microzone_id"),
    cadastralRef: text("cadastral_ref"),
    address: text("address").notNull(),
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }),
    data: jsonb("data").$type<Property>().notNull(),
    demo: boolean("demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("properties_org").on(t.organizationId), index("properties_cadastral").on(t.cadastralRef)],
);

export type DealStatus =
  | "draft"
  | "analyzing"
  | "analyzed"
  | "watching"
  | "rejected"
  | "approved"
  | "acquired"
  | "project"
  | "closed";

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: text("property_id").references(() => properties.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").$type<DealStatus>().notNull().default("draft"),
    mode: text("mode").$type<"deal" | "project">().notNull().default("deal"),
    askingPrice: doublePrecision("asking_price"),
    intake: jsonb("intake").$type<IntakeRequest>().notNull(),
    latestAnalysisId: text("latest_analysis_id"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    demo: boolean("demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deals_org_updated").on(t.organizationId, t.updatedAt)],
);

export const analyses = pgTable(
  "analyses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    status: text("status").$type<"running" | "completed" | "failed">().notNull(),
    analysisDate: text("analysis_date").notNull(),
    result: jsonb("result").$type<AnalysisResult>(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analyses_deal").on(t.dealId)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    agentType: text("agent_type").notNull(),
    domain: text("domain").notNull(),
    label: text("label").notNull(),
    parentRunId: text("parent_run_id"),
    orchestratorRunId: text("orchestrator_run_id").notNull(),
    status: text("status").notNull(),
    record: jsonb("record").$type<AgentRunRecord>().notNull(),
    latencyMs: integer("latency_ms").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_runs_analysis").on(t.analysisId),
    index("agent_runs_org_started").on(t.organizationId, t.startedAt),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    verificationStatus: text("verification_status").notNull(),
    demo: boolean("demo").notNull().default(false),
    record: jsonb("record").$type<Evidence>().notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("evidence_deal").on(t.dealId), index("evidence_analysis").on(t.analysisId)],
);

export const regulatorySnapshots = pgTable(
  "regulatory_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    analysisDate: text("analysis_date").notNull(),
    fingerprint: text("fingerprint").notNull(),
    snapshot: jsonb("snapshot").$type<RegulatorySnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("regsnap_deal").on(t.dealId)],
);

export const scenarioSets = pgTable(
  "scenario_sets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    strategyId: text("strategy_id").notNull(),
    set: jsonb("set").$type<ScenarioSet>().notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scenario_sets_deal").on(t.dealId, t.strategyId)],
);

export interface WatchRule {
  kind:
    | "price_below"
    | "price_drop_pct"
    | "regulation_change"
    | "days_on_market"
    | "meets_criteria"
    | "new_comparable";
  value?: number;
  note?: string;
}

export const watches = pgTable(
  "watches",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    listingId: text("listing_id"),
    userId: text("user_id").notNull(),
    label: text("label").notNull(),
    rules: jsonb("rules").$type<WatchRule[]>().notNull(),
    status: text("status").$type<"active" | "triggered" | "paused">().notNull().default("active"),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("watches_org").on(t.organizationId, t.status)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    severity: text("severity").$type<"info" | "opportunity" | "risk">().notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alerts_org_created").on(t.organizationId, t.createdAt)],
);

export const humanReviews = pgTable(
  "human_reviews",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id").notNull(),
    role: text("role")
      .$type<"ai_precheck" | "technical" | "architect" | "real_estate" | "legal" | "tax">()
      .notNull(),
    scope: text("scope").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"approved" | "rejected" | "changes_requested">().notNull(),
    professionalId: text("professional_id"),
    comments: text("comments").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("human_reviews_deal").on(t.dealId)],
);

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("other"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    scanStatus: text("scan_status").$type<"pending" | "clean" | "flagged">().notNull().default("pending"),
    uploadedBy: text("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_deal").on(t.dealId)],
);

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_org_created").on(t.organizationId, t.createdAt),
    index("activities_deal").on(t.dealId),
  ],
);
