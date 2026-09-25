import type { Result } from "@/modules/core/result";
import type { NewEvidence } from "@/modules/evidence/store";
import type { SourceType } from "@/modules/evidence/types";

export type AdapterMode = "demo" | "public" | "official" | "partner" | "unavailable";

export interface AdapterResponse<T> {
  data: T;
  evidence: NewEvidence[];
  retrievedAt: string;
  /** Last known update of the source itself (not of our retrieval). */
  freshness?: string;
  mode: AdapterMode;
}

/**
 * Every external source implements this. UI components never talk to a
 * provider directly: they receive data + evidence + a source status.
 */
export interface DataSourceAdapter<TQuery, TResult> {
  sourceId: string;
  sourceType: SourceType;
  sourceName: string;
  sourceAuthority: string;
  mode: AdapterMode;
  isAvailable(): Promise<boolean>;
  query(input: TQuery): Promise<Result<AdapterResponse<TResult>>>;
}

export interface SourceStatus {
  sourceId: string;
  name: string;
  authority: string;
  mode: AdapterMode;
  available: boolean;
  lastVerified?: string;
  lastSourceUpdate?: string;
  note: string;
  demo: boolean;
}

export function unavailable(sourceId: string, message: string) {
  return { ok: false as const, error: { code: "SOURCE_UNAVAILABLE", message, details: { sourceId } } };
}

/** Deterministic pseudo-random in [0,1) from a string seed and a salt. Demo generators use it so the same address always yields the same fixtures. */
export function seededUnit(seed: string, salt: string | number): number {
  let h = 2166136261;
  const s = `${seed}::${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}
