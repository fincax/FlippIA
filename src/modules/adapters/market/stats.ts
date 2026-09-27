import type { Comparable } from "@/modules/engines/valuation/types";
import { round0, round2 } from "@/modules/core/math";
import type { MarketSnapshot, RentComparable } from "./types";

/**
 * Days on market assumed for each liquidity level when no source measures it.
 * A stated assumption, applied identically everywhere and always labelled as
 * such in the snapshot — never presented as a measurement.
 */
export const LIQUIDITY_REFERENCE_DAYS: Record<MarketSnapshot["stats"]["liquidity"], number> = {
  high: 45,
  medium: 90,
  low: 150,
};

/** Active comparables within the search radius that mark a deep market. */
export const LIQUIDITY_DEPTH = { high: 30, medium: 10 };

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Liquidity level from market depth (how many active comparables the radius holds). */
export function liquidityFromDepth(activeListings: number): MarketSnapshot["stats"]["liquidity"] {
  if (activeListings >= LIQUIDITY_DEPTH.high) return "high";
  if (activeListings >= LIQUIDITY_DEPTH.medium) return "medium";
  return "low";
}

/**
 * Snapshot statistics derived from real comparables. €/m² by condition is the
 * median of the comparables in that condition; when a condition has no
 * comparables the overall median is shifted with the valuation engine's
 * condition adjustments and the note says so.
 */
export function deriveStats(params: {
  sale: Comparable[];
  rent: RentComparable[];
  /** Active listings the provider reported in the radius (defaults to the sale sample). */
  marketDepth?: number;
  notes?: string[];
  /** Liquidity figures decided elsewhere (e.g. the DEMO fallback), with their own explanation. */
  liquidity?: {
    level: MarketSnapshot["stats"]["liquidity"];
    demand: MarketSnapshot["stats"]["demand"];
    daysToSell: number;
    basis: NonNullable<MarketSnapshot["stats"]["liquidityBasis"]>;
    note: string;
  };
}): MarketSnapshot["stats"] {
  const ppm2 = (c: { price: number; areaM2: number }) => c.price / c.areaM2;
  const valid = params.sale.filter((c) => c.price > 0 && c.areaM2 > 0);
  const all = valid.map(ppm2);
  const renovated = valid.filter((c) => c.condition === "renovated" || c.condition === "new").map(ppm2);
  const unrenovated = valid.filter((c) => c.condition === "unrenovated").map(ppm2);
  const overall = median(all);
  const notes = [...(params.notes ?? [])];
  const renovatedPerM2 = renovated.length ? median(renovated) : overall * 1.15;
  const unrenovatedPerM2 = unrenovated.length ? median(unrenovated) : overall / 1.35;
  if (valid.length && !renovated.length)
    notes.push("€/m² reformado estimado desde la mediana general (+15 %).");
  if (valid.length && !unrenovated.length)
    notes.push("€/m² sin reformar estimado desde la mediana general (−26 %).");
  const rents = params.rent
    .filter((r) => r.monthlyRent > 0 && r.areaM2 > 0)
    .map((r) => r.monthlyRent / r.areaM2);
  const depth = params.marketDepth ?? valid.length;
  const level = params.liquidity?.level ?? liquidityFromDepth(depth);
  notes.push(
    params.liquidity?.note ??
      `Liquidez ${level} por profundidad de mercado (${depth} comparables activos en el radio); días de venta de referencia por nivel, no medidos.`,
  );
  return {
    renovatedPerM2: round0(renovatedPerM2),
    unrenovatedPerM2: round0(unrenovatedPerM2),
    spreadPerM2: round0(renovatedPerM2 - unrenovatedPerM2),
    rentPerM2Month: round2(median(rents)),
    daysToSell: params.liquidity?.daysToSell ?? LIQUIDITY_REFERENCE_DAYS[level],
    liquidity: level,
    demand: params.liquidity?.demand ?? level,
    sampleSize: valid.length,
    confidenceNote: notes.join(" "),
    liquidityBasis: params.liquidity?.basis ?? "reference",
  };
}
