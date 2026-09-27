import { and, eq, isNull, or } from "drizzle-orm";
import { opportunityListings } from "@/db/schema";
import type { OpportunityListing } from "@/modules/adapters/sources/types";
import type { InvestorDNA } from "@/modules/investor/types";
import { radarSearch, type RadarHit, type RadarSearchOptions } from "@/modules/radar/underwrite";
import type { TenantContext } from "../context";

/** Listings visible to a tenant: its own plus shared (demo/public) ones. */
export async function visibleListings(ctx: TenantContext): Promise<OpportunityListing[]> {
  const rows = await ctx.db
    .select({ data: opportunityListings.data })
    .from(opportunityListings)
    .where(
      and(
        eq(opportunityListings.status, "active"),
        or(
          isNull(opportunityListings.organizationId),
          eq(opportunityListings.organizationId, ctx.organizationId),
        ),
      ),
    )
    .limit(500);
  return rows.map((r) => r.data);
}

export async function getListing(ctx: TenantContext, id: string): Promise<OpportunityListing | null> {
  const [row] = await ctx.db
    .select({ data: opportunityListings.data })
    .from(opportunityListings)
    .where(
      and(
        eq(opportunityListings.id, id),
        or(
          isNull(opportunityListings.organizationId),
          eq(opportunityListings.organizationId, ctx.organizationId),
        ),
      ),
    )
    .limit(1);
  return row?.data ?? null;
}

export async function runRadar(
  ctx: TenantContext,
  investor: InvestorDNA,
  opts: Pick<RadarSearchOptions, "includeNonMatching" | "brief" | "strategyIds"> = {},
): Promise<RadarHit[]> {
  const listings = await visibleListings(ctx);
  return radarSearch(listings, investor, opts);
}
