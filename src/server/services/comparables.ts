import { and, asc, between, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { marketComparables } from "@/db/schema";
import { adapters as defaultAdapters, type AdapterSet } from "@/modules/adapters";
import {
  createMarketAdapter,
  parseMarketModes,
  type ComparablesRepository,
  type OwnComparable,
} from "@/modules/adapters/market";
import { defaultCity, microzoneFromPoint } from "@/modules/city/registry";
import { newId } from "@/modules/core/ids";
import { NotFoundError, requireRole, type TenantContext } from "../context";

export const comparableSchema = z.object({
  kind: z.enum(["sale", "rent"]),
  type: z.enum(["transaction", "verified", "professional", "internal", "manual", "partner"]),
  price: z.number().positive().max(1_000_000_000),
  areaM2: z.number().positive().max(100_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  microzoneId: z.string().max(100).optional(),
  condition: z.enum(["renovated", "unrenovated", "new", "unknown"]).default("unknown"),
  assetUse: z.enum(["residential", "commercial", "office", "other"]).default("residential"),
  floor: z.number().int().min(-5).max(100).optional(),
  elevator: z.boolean().optional(),
  exterior: z.boolean().optional(),
  label: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});
export type ComparableInput = z.infer<typeof comparableSchema>;
export const comparablesBatchSchema = z.object({ comparables: z.array(comparableSchema).min(1).max(500) });

const MAX_LIST = 500;

export async function listComparables(
  ctx: TenantContext,
  filter: { microzoneId?: string; kind?: "sale" | "rent" } = {},
) {
  const conditions = [eq(marketComparables.organizationId, ctx.organizationId)];
  if (filter.microzoneId) conditions.push(eq(marketComparables.microzoneId, filter.microzoneId));
  if (filter.kind) conditions.push(eq(marketComparables.kind, filter.kind));
  return ctx.db
    .select()
    .from(marketComparables)
    .where(and(...conditions))
    .orderBy(desc(marketComparables.date), asc(marketComparables.id))
    .limit(MAX_LIST);
}

export async function addComparables(ctx: TenantContext, input: ComparableInput[]) {
  requireRole(ctx, "analyst");
  const city = defaultCity();
  const rows = input.map((c) => {
    const parsed = comparableSchema.parse(c);
    const zone =
      parsed.microzoneId ?? microzoneFromPoint(city, { lat: parsed.lat, lng: parsed.lng })?.id ?? null;
    return {
      id: newId("cmp"),
      organizationId: ctx.organizationId,
      kind: parsed.kind,
      type: parsed.type,
      price: parsed.price,
      areaM2: parsed.areaM2,
      date: parsed.date,
      lat: parsed.lat,
      lng: parsed.lng,
      microzoneId: zone,
      condition: parsed.condition,
      assetUse: parsed.assetUse,
      floor: parsed.floor ?? null,
      elevator: parsed.elevator ?? null,
      exterior: parsed.exterior ?? null,
      label: parsed.label ?? null,
      reference: parsed.reference ?? null,
      note: parsed.note ?? null,
      createdBy: ctx.userId,
    };
  });
  if (!rows.length) return [];
  return ctx.db.insert(marketComparables).values(rows).returning();
}

export async function deleteComparable(ctx: TenantContext, id: string) {
  requireRole(ctx, "analyst");
  const deleted = await ctx.db
    .delete(marketComparables)
    .where(and(eq(marketComparables.organizationId, ctx.organizationId), eq(marketComparables.id, id)))
    .returning({ id: marketComparables.id });
  if (!deleted.length) throw new NotFoundError("Comparable no encontrado.");
}

/** Degrees of latitude/longitude that cover `radiusM` (generous; the adapter refines with haversine). */
function bbox(point: { lat: number; lng: number }, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  return {
    minLat: point.lat - dLat,
    maxLat: point.lat + dLat,
    minLng: point.lng - dLng,
    maxLng: point.lng + dLng,
  };
}

/** Repository the OwnComparablesAdapter uses; every query is bound to the tenant. */
export function comparablesRepository(ctx: TenantContext): ComparablesRepository {
  return {
    async list(q) {
      const scope = q.point
        ? (() => {
            const b = bbox(q.point, q.radiusM);
            return or(
              eq(marketComparables.microzoneId, q.microzoneId),
              and(
                between(marketComparables.lat, b.minLat, b.maxLat),
                between(marketComparables.lng, b.minLng, b.maxLng),
              ),
            );
          })()
        : eq(marketComparables.microzoneId, q.microzoneId);
      const rows = await ctx.db
        .select()
        .from(marketComparables)
        .where(and(eq(marketComparables.organizationId, ctx.organizationId), scope))
        .orderBy(desc(marketComparables.date))
        .limit(MAX_LIST);
      const compatible = (use: OwnComparable["assetUse"]) =>
        q.assetUse === "residential" ? use === "residential" : use === q.assetUse || use === "other";
      return rows
        .filter((r) => compatible(r.assetUse))
        .map<OwnComparable>((r) => ({
          id: r.id,
          kind: r.kind,
          type: r.type,
          price: r.price,
          areaM2: r.areaM2,
          date: r.date,
          point: { lat: r.lat, lng: r.lng },
          microzoneId: r.microzoneId ?? undefined,
          condition: r.condition,
          assetUse: r.assetUse,
          floor: r.floor ?? undefined,
          elevator: r.elevator ?? undefined,
          exterior: r.exterior ?? undefined,
          label: r.label ?? undefined,
          reference: r.reference ?? undefined,
          note: r.note ?? undefined,
        }));
    },
  };
}

/**
 * Adapter set for one request: the shared adapters plus a market adapter
 * that can read this tenant's own comparables. Only built when `own` is
 * configured; otherwise the cached global set is reused untouched.
 */
export function tenantAdapters(ctx: TenantContext): AdapterSet {
  const base = defaultAdapters();
  if (!parseMarketModes(process.env.MARKET_SOURCE_MODE).includes("own")) return base;
  return { ...base, market: createMarketAdapter(undefined, { ownComparables: comparablesRepository(ctx) }) };
}
