import { and, eq, sql } from "drizzle-orm";
import { investorProfiles } from "@/db/schema";
import { newId } from "@/modules/core/ids";
import { DEFAULT_INVESTOR_DNA, type InvestorDNA } from "@/modules/investor/types";
import type { TenantContext } from "../context";
import { z } from "zod";

export const investorDnaSchema = z.object({
  profileType: z.enum([
    "private_investor",
    "professional_investor",
    "developer",
    "family_office",
    "fund",
    "foreign_investor",
    "real_estate_company",
    "architect_partner",
    "broker_partner",
    "agent_partner",
  ]),
  capitalAvailable: z.number().min(0).max(1e9),
  maxEquityPerDeal: z.number().min(0).max(1e9),
  usesFinancing: z.boolean(),
  experience: z.enum(["none", "some", "experienced", "professional"]),
  ticketMin: z.number().min(0).max(1e9),
  ticketMax: z.number().min(0).max(1e9),
  horizonMonths: z.number().int().min(1).max(480),
  objective: z.enum(["capital_gain", "income", "mixed"]),
  targetRoe: z.number().min(0).max(5),
  targetProfit: z.number().min(0).max(1e9),
  riskTolerance: z.enum(["low", "medium", "high"]),
  zones: z.array(z.string().max(64)).max(50),
  strategies: z.array(z.string().max(64)).max(50),
  liquidityNeeds: z.enum(["low", "medium", "high"]),
  availabilityHoursPerWeek: z.number().min(0).max(168),
  sellerProfile: z.enum(["individual", "company"]),
  notes: z.string().max(2000).optional(),
});

export async function getInvestorDNA(ctx: TenantContext): Promise<{ dna: InvestorDNA; completed: boolean }> {
  const [row] = await ctx.db
    .select()
    .from(investorProfiles)
    .where(
      and(eq(investorProfiles.organizationId, ctx.organizationId), eq(investorProfiles.userId, ctx.userId)),
    )
    .limit(1);
  return row
    ? { dna: { ...DEFAULT_INVESTOR_DNA, ...row.dna }, completed: row.completed }
    : { dna: DEFAULT_INVESTOR_DNA, completed: false };
}

export async function saveInvestorDNA(ctx: TenantContext, dna: InvestorDNA): Promise<void> {
  const parsed = investorDnaSchema.parse(dna);
  // One profile per (organization, user): the unique index makes this atomic under concurrency.
  await ctx.db
    .insert(investorProfiles)
    .values({
      id: newId("inv"),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dna: parsed,
      completed: true,
    })
    .onConflictDoUpdate({
      target: [investorProfiles.organizationId, investorProfiles.userId],
      set: {
        dna: parsed,
        completed: true,
        version: sql`${investorProfiles.version} + 1`,
        updatedAt: new Date(),
      },
    });
}
