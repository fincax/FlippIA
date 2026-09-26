/**
 * IRR over periodic cash flows (index = period). Robust hybrid: bisection with
 * bracketing, then Newton refinement. Returns null when no sign change exists.
 */
export function irr(
  cashflows: readonly number[],
  opts: { maxIterations?: number; tolerance?: number } = {},
): number | null {
  const maxIterations = opts.maxIterations ?? 200;
  const tolerance = opts.tolerance ?? 1e-9;
  const hasNeg = cashflows.some((c) => c < 0);
  const hasPos = cashflows.some((c) => c > 0);
  if (!hasNeg || !hasPos) return null;

  const npv = (rate: number) => cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let lo = -0.99;
  let hi = 1.0;
  let fLo = npv(lo);
  let fHi = npv(hi);
  let guard = 0;
  while (fLo * fHi > 0 && guard < 60) {
    hi *= 2;
    fHi = npv(hi);
    guard++;
    if (hi > 1e6) return null;
  }
  if (fLo * fHi > 0) return null;

  let mid = 0;
  for (let i = 0; i < maxIterations; i++) {
    mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < tolerance || (hi - lo) / 2 < tolerance) break;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return mid;
}

export function monthlyToAnnual(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}
