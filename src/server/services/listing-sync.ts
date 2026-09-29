import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { opportunityListings } from "@/db/schema";
import { adapters } from "@/modules/adapters";
import type { OpportunityListing, SourceAdapter } from "@/modules/adapters/sources/types";
import { logger } from "@/modules/core/logger";

export interface SourceSyncReport {
  sourceId: string;
  sourceName: string;
  fetched: number;
  inserted: number;
  updated: number;
  priceChanges: number;
  withdrawn: number;
  complete: boolean;
  errors: string[];
}

export interface SyncReport {
  syncedAt: string;
  sources: SourceSyncReport[];
}

const MAX_HISTORY = 30;

/**
 * Pulls every non-DEMO listing source into `opportunity_listings` (shared
 * rows, organization_id null). First sight fixes `publishedAt`; a changed
 * price appends to `priceHistory`; listings missing from a complete pull are
 * marked withdrawn. DEMO listings come from the seed and are left alone.
 */
export async function syncListingSources(
  d: Database,
  sources: SourceAdapter[] = adapters().sources,
  opts: { now?: () => number } = {},
): Promise<SyncReport> {
  const now = opts.now ?? Date.now;
  const reports: SourceSyncReport[] = [];
  for (const source of sources) {
    if (source.kind === "demo") continue;
    reports.push(await syncSource(d, source, now));
  }
  return { syncedAt: new Date(now()).toISOString(), sources: reports };
}

async function syncSource(d: Database, source: SourceAdapter, now: () => number): Promise<SourceSyncReport> {
  const report: SourceSyncReport = {
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    fetched: 0,
    inserted: 0,
    updated: 0,
    priceChanges: 0,
    withdrawn: 0,
    complete: false,
    errors: [],
  };
  let fetched: { listings: OpportunityListing[]; complete: boolean; errors: string[] };
  try {
    fetched = source.fetchAll
      ? await source.fetchAll()
      : { listings: await source.listings(), complete: true, errors: [] };
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e));
    logger.warn("radar.sync_failed", { sourceId: source.sourceId, error: report.errors[0] });
    return report;
  }
  report.fetched = fetched.listings.length;
  report.complete = fetched.complete && fetched.errors.length === 0;
  report.errors.push(...fetched.errors);
  const today = new Date(now()).toISOString().slice(0, 10);

  const existing = await d
    .select({
      id: opportunityListings.id,
      askingPrice: opportunityListings.askingPrice,
      status: opportunityListings.status,
      data: opportunityListings.data,
    })
    .from(opportunityListings)
    .where(
      and(eq(opportunityListings.sourceId, source.sourceId), isNull(opportunityListings.organizationId)),
    );
  const known = new Map(existing.map((r) => [r.id, r]));
  const seen = new Set<string>();

  for (const l of fetched.listings) {
    if (l.demo || seen.has(l.id)) continue;
    seen.add(l.id);
    const previous = known.get(l.id);
    if (!previous) {
      await d.insert(opportunityListings).values({
        id: l.id,
        organizationId: null,
        sourceId: source.sourceId,
        microzoneId: l.microzoneId ?? null,
        assetUse: l.assetUse,
        askingPrice: l.askingPrice,
        status: "active",
        data: l,
        demo: false,
        publishedAt: l.publishedAt,
      });
      report.inserted++;
      continue;
    }
    const history = [...previous.data.priceHistory];
    const priceChanged = Math.round(previous.askingPrice) !== Math.round(l.askingPrice);
    if (priceChanged) {
      history.push({ date: today, price: l.askingPrice });
      report.priceChanges++;
    }
    const merged: OpportunityListing = {
      ...l,
      publishedAt: previous.data.publishedAt,
      priceHistory: history.slice(-MAX_HISTORY),
    };
    await d
      .update(opportunityListings)
      .set({
        microzoneId: merged.microzoneId ?? null,
        assetUse: merged.assetUse,
        askingPrice: merged.askingPrice,
        status: "active",
        data: merged,
        updatedAt: new Date(now()),
      })
      .where(eq(opportunityListings.id, l.id));
    report.updated++;
  }

  if (report.complete) {
    const gone = existing.filter((r) => r.status === "active" && !seen.has(r.id)).map((r) => r.id);
    if (gone.length) {
      await d
        .update(opportunityListings)
        .set({ status: "withdrawn", updatedAt: new Date(now()) })
        .where(inArray(opportunityListings.id, gone));
      report.withdrawn = gone.length;
    }
  }
  logger.info("radar.sync", { ...report });
  return report;
}
