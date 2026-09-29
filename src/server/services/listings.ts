import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { opportunityListings } from "@/db/schema";
import type { OpportunityListing } from "@/modules/adapters/sources/types";
import { findMicrozone, listCities, microzoneFromText, nearestMicrozone } from "@/modules/city/registry";
import { newId } from "@/modules/core/ids";
import { TYPOLOGY_LABEL } from "@/modules/radar/criteria";
import { NotFoundError, requireRole, type TenantContext } from "../context";

/** Source id of listings an organisation supplies itself (API, CSV, manual). */
export const OWN_LISTINGS_SOURCE_ID = "listings-own";

export const listingSchema = z.object({
  title: z.string().max(200).optional(),
  address: z.string().min(4).max(300),
  askingPrice: z.number().positive().max(1_000_000_000),
  builtAreaM2: z.number().positive().max(100_000),
  assetUse: z.enum(["residential", "commercial", "office", "industrial", "land", "other"]),
  typology: z.enum([
    "flat",
    "ground_floor_flat",
    "penthouse",
    "house",
    "premises",
    "office",
    "building",
    "plot",
    "warehouse",
    "garage",
    "other",
  ]),
  condition: z.enum(["to_renovate", "good", "renovated", "unknown"]).default("unknown"),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  floor: z.number().int().min(-5).max(100).optional(),
  elevator: z.boolean().optional(),
  microzoneId: z.string().max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD")
    .optional(),
  reference: z.string().max(200).optional(),
});
export type ListingInput = z.infer<typeof listingSchema>;
export const listingsBatchSchema = z.object({ listings: z.array(listingSchema).min(1).max(500) });

/** Rows that could not be placed on the map. Nothing is imported when it is thrown. */
export class ListingImportError extends Error {
  constructor(public issues: string[]) {
    super("Algunos listados no se han podido situar en una microzona.");
  }
}

const MAX_LIST = 500;

export async function listOwnListings(ctx: TenantContext) {
  return ctx.db
    .select({
      id: opportunityListings.id,
      status: opportunityListings.status,
      data: opportunityListings.data,
      updatedAt: opportunityListings.updatedAt,
    })
    .from(opportunityListings)
    .where(eq(opportunityListings.organizationId, ctx.organizationId))
    .orderBy(desc(opportunityListings.updatedAt))
    .limit(MAX_LIST);
}

/**
 * Adds an organisation's own listings to its Radar. The microzone comes from
 * `microzoneId`, from the point or from the address text, in that order; a
 * listing with no microzone would never be underwritten, so it is rejected
 * by row instead of silently ignored.
 */
export async function addListings(
  ctx: TenantContext,
  input: ListingInput[],
  opts: { now?: Date } = {},
): Promise<OpportunityListing[]> {
  requireRole(ctx, "analyst");
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const issues: string[] = [];
  const listings = input.map((raw, i) => {
    const l = listingSchema.parse(raw);
    const zone =
      (l.microzoneId && findMicrozone(l.microzoneId)?.zone) ||
      (l.lat !== undefined && l.lng !== undefined && nearestMicrozone({ lat: l.lat, lng: l.lng })?.zone) ||
      listCities()
        .map((c) => microzoneFromText(c, l.address))
        .find(Boolean);
    if (!zone) {
      issues.push(
        `fila ${i + 1} (${l.address}): microzona no reconocida; indica microzone_id, lat/lng o el barrio en la dirección.`,
      );
      return null;
    }
    const publishedAt = l.publishedAt ?? today;
    const typologyLabel = TYPOLOGY_LABEL[l.typology];
    const listing: OpportunityListing = {
      id: newId("lst"),
      sourceId: OWN_LISTINGS_SOURCE_ID,
      reference: l.reference,
      title: l.title ?? `${typologyLabel.charAt(0).toUpperCase()}${typologyLabel.slice(1)} en ${zone.name}`,
      address: l.address,
      microzoneId: zone.id,
      typology: l.typology,
      assetUse: l.assetUse,
      builtAreaM2: l.builtAreaM2,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      floor: l.floor,
      elevator: l.elevator,
      condition: l.condition,
      askingPrice: l.askingPrice,
      publishedAt,
      priceHistory: [{ date: publishedAt, price: l.askingPrice }],
      demo: false,
    };
    return listing;
  });
  if (issues.length) throw new ListingImportError(issues);
  const rows = listings.filter((l): l is OpportunityListing => l !== null);
  if (!rows.length) return [];
  await ctx.db.insert(opportunityListings).values(
    rows.map((l) => ({
      id: l.id,
      organizationId: ctx.organizationId,
      sourceId: l.sourceId,
      microzoneId: l.microzoneId ?? null,
      assetUse: l.assetUse,
      askingPrice: l.askingPrice,
      status: "active" as const,
      data: l,
      demo: false,
      publishedAt: l.publishedAt,
    })),
  );
  return rows;
}

/** Withdraws one of the organisation's own listings from its Radar (shared DEMO listings are not the tenant's to withdraw). */
export async function withdrawListing(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, "analyst");
  const updated = await ctx.db
    .update(opportunityListings)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(and(eq(opportunityListings.organizationId, ctx.organizationId), eq(opportunityListings.id, id)))
    .returning({ id: opportunityListings.id });
  if (!updated.length) throw new NotFoundError("Listado no encontrado.");
}
