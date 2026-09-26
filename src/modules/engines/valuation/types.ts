import type { Confidence, EvidenceStatus } from "@/modules/core/evidence-status";

export type ComparableType =
  "asking" | "transaction" | "internal" | "verified" | "professional" | "manual" | "partner";

export interface Comparable {
  id: string;
  type: ComparableType;
  sourceId: string;
  evidenceId?: string;
  price: number;
  areaM2: number;
  date: string; // ISO
  distanceM: number;
  condition: "renovated" | "unrenovated" | "new" | "unknown";
  assetUse: "residential" | "commercial" | "office" | "other";
  floor?: number;
  elevator?: boolean;
  exterior?: boolean;
  label?: string;
  /** Marked DEMO when synthetic. */
  demo?: boolean;
}

export interface ValuationAdjustments {
  /** Discount applied to asking prices to approximate transactions. */
  askingDiscount: number;
  /** Premium/discount vs target condition, e.g. unrenovated comps adjusted +x % to renovated. */
  conditionAdjustment: { renovated: number; unrenovated: number; new: number; unknown: number };
  /** Annual market drift applied to older comparables. */
  annualDrift: number;
  /** Comparables further than this are dropped. */
  maxDistanceM: number;
  /** Comparables older than this are dropped. */
  maxAgeMonths: number;
}

export interface ValuationResult {
  targetCondition: "renovated" | "unrenovated";
  pricePerM2: { low: number; point: number; high: number };
  value: { low: number; point: number; high: number };
  areaM2: number;
  comparablesUsed: Array<{
    id: string;
    type: ComparableType;
    rawPricePerM2: number;
    adjustedPricePerM2: number;
    weight: number;
    adjustments: Array<{ key: string; factor: number; note: string }>;
    distanceM: number;
    date: string;
    demo: boolean;
  }>;
  comparablesRejected: Array<{ id: string; reason: string }>;
  methodology: string;
  confidence: Confidence;
  status: EvidenceStatus;
  analysisDate: string;
}
