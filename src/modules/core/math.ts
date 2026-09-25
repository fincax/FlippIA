/** Deterministic numeric helpers used by every engine. No floating-point surprises leak to the UI. */

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export const round0 = (v: number) => round(v, 0);
export const round2 = (v: number) => round(v, 2);
export const round4 = (v: number) => round(v, 4);

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function pct(part: number, whole: number): number {
  if (whole === 0) return 0;
  return part / whole;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function assertFinite(v: number, label: string): number {
  if (!Number.isFinite(v)) throw new Error(`Non-finite value for ${label}`);
  return v;
}

/** Monthly rate from an annual nominal rate (bank convention, /12). */
export function monthlyRate(annualRate: number): number {
  return annualRate / 12;
}

/** Annualize a total return achieved over `months`. */
export function annualize(totalReturn: number, months: number): number {
  if (months <= 0) return 0;
  const years = months / 12;
  if (totalReturn <= -1) return -1;
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}
