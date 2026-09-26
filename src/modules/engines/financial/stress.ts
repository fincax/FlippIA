import { round0, round4 } from "@/modules/core/math";
import { computeFinancials } from "./engine";
import type { FinancialInputs, FinancialResult } from "./types";

export interface StressScenarioDef {
  key: string;
  label: string;
  description: string;
  apply: (i: FinancialInputs) => FinancialInputs;
}

export interface StressOutcome {
  key: string;
  label: string;
  description: string;
  netProfit: number;
  roe: number | null;
  irr: number | null;
  equityRequired: number;
  deltaProfit: number;
  survives: boolean;
}

export interface StressReport {
  base: { netProfit: number; roe: number | null; equityRequired: number };
  outcomes: StressOutcome[];
  breakEvenPrice: number | null;
  marginOfSafety: number | null; // (salePrice − breakEven) / salePrice
  maximumRenovation: number | null; // renovation budget at which net profit = minProfit
  minimumExitPrice: number | null; // sale price at which net profit = minProfit
  maximumAcquisition: number | null; // purchase price at which net profit = minProfit
  capitalAtRisk: number; // equity that would be lost in the worst combined scenario, floored at 0
  worstCase: StressOutcome | null;
  survivalRate: number;
}

const scaleSale =
  (f: number) =>
  (i: FinancialInputs): FinancialInputs =>
    i.exit.kind === "sale"
      ? { ...i, exit: { ...i.exit, salePrice: round0(i.exit.salePrice * f) } }
      : { ...i, exit: { ...i.exit, terminalValue: round0(i.exit.terminalValue * f) } };
const scaleReno =
  (f: number) =>
  (i: FinancialInputs): FinancialInputs => ({
    ...i,
    transformation: { ...i.transformation, renovationBudget: round0(i.transformation.renovationBudget * f) },
  });
const delay =
  (months: number) =>
  (i: FinancialInputs): FinancialInputs => ({
    ...i,
    holding: { ...i.holding, durationMonths: i.holding.durationMonths + months },
  });
const dearerDebt =
  (bps: number) =>
  (i: FinancialInputs): FinancialInputs => ({
    ...i,
    financing: i.financing.map((f) => ({ ...f, annualRate: f.annualRate + bps / 10_000 })),
  });
const lowerRent =
  (f: number) =>
  (i: FinancialInputs): FinancialInputs =>
    i.exit.kind === "rent" ? { ...i, exit: { ...i.exit, monthlyRent: round0(i.exit.monthlyRent * f) } } : i;
const compose =
  (...fns: Array<(i: FinancialInputs) => FinancialInputs>) =>
  (i: FinancialInputs) =>
    fns.reduce((acc, fn) => fn(acc), i);

export const STANDARD_STRESS_SCENARIOS: StressScenarioDef[] = [
  {
    key: "sale-5",
    label: "Venta −5 %",
    description: "El precio de salida cae un 5 %.",
    apply: scaleSale(0.95),
  },
  {
    key: "sale-10",
    label: "Venta −10 %",
    description: "El precio de salida cae un 10 %.",
    apply: scaleSale(0.9),
  },
  {
    key: "reno+10",
    label: "Reforma +10 %",
    description: "El presupuesto de obra sube un 10 %.",
    apply: scaleReno(1.1),
  },
  {
    key: "reno+20",
    label: "Reforma +20 %",
    description: "El presupuesto de obra sube un 20 %.",
    apply: scaleReno(1.2),
  },
  {
    key: "debt+150",
    label: "Financiación +150 pb",
    description: "Todos los instrumentos de deuda 1,5 puntos más caros.",
    apply: dearerDebt(150),
  },
  {
    key: "delay+90",
    label: "Retraso +90 días",
    description: "Tres meses adicionales de tenencia y financiación.",
    apply: delay(3),
  },
  {
    key: "delay+180",
    label: "Retraso +180 días",
    description: "Seis meses adicionales de tenencia y financiación.",
    apply: delay(6),
  },
  {
    key: "rent-10",
    label: "Alquiler −10 %",
    description: "La renta mensual es un 10 % inferior.",
    apply: lowerRent(0.9),
  },
  {
    key: "combined-moderate",
    label: "Combinado moderado",
    description: "Venta −5 %, reforma +10 %, retraso +90 días.",
    apply: compose(scaleSale(0.95), scaleReno(1.1), delay(3)),
  },
  {
    key: "combined-severe",
    label: "Combinado severo",
    description: "Venta −10 %, reforma +20 %, retraso +180 días, deuda +150 pb.",
    apply: compose(scaleSale(0.9), scaleReno(1.2), delay(6), dearerDebt(150)),
  },
];

function solve(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  increasing: boolean,
  iterations = 60,
): number | null {
  let a = lo;
  let b = hi;
  const fa = f(a) - target;
  const fb = f(b) - target;
  if (fa * fb > 0) return null;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    const fm = f(mid) - target;
    if (Math.abs(b - a) < 1) break;
    const goLeft = increasing ? fm > 0 : fm < 0;
    if (goLeft) b = mid;
    else a = mid;
  }
  return round0((a + b) / 2);
}

export function runStressTest(
  base: FinancialInputs,
  opts: { scenarios?: StressScenarioDef[]; minimumProfit?: number } = {},
): StressReport {
  const scenarios = opts.scenarios ?? STANDARD_STRESS_SCENARIOS;
  const minProfit = opts.minimumProfit ?? 0;
  const baseResult = computeFinancials(base);
  const baseProfit = baseResult.metrics.netProfit.value ?? 0;
  const applicable = scenarios.filter((s) => !(s.key.startsWith("rent") && base.exit.kind !== "rent"));

  const outcomes: StressOutcome[] = applicable.map((s) => {
    const r = computeFinancials(s.apply(base));
    const np = r.metrics.netProfit.value ?? 0;
    return {
      key: s.key,
      label: s.label,
      description: s.description,
      netProfit: np,
      roe: r.metrics.roe.value,
      irr: r.metrics.irr.value,
      equityRequired: r.metrics.equityRequired.value ?? 0,
      deltaProfit: round0(np - baseProfit),
      survives: np >= minProfit,
    };
  });

  const profitAtPrice = (p: number) =>
    computeFinancials({ ...base, acquisition: { ...base.acquisition, purchasePrice: p } }).metrics.netProfit
      .value ?? 0;
  const profitAtReno = (b: number) =>
    computeFinancials({ ...base, transformation: { ...base.transformation, renovationBudget: b } }).metrics
      .netProfit.value ?? 0;
  const profitAtSale = (s: number) => computeFinancials(scaleSaleTo(base, s)).metrics.netProfit.value ?? 0;

  const salePrice = base.exit.kind === "sale" ? base.exit.salePrice : base.exit.terminalValue;
  const maximumAcquisition = solve(profitAtPrice, minProfit, 0, Math.max(salePrice * 2, 1), false);
  const maximumRenovation = solve(profitAtReno, minProfit, 0, Math.max(salePrice * 2, 1), false);
  const minimumExitPrice = solve(profitAtSale, minProfit, 0, Math.max(salePrice * 3, 1), true);
  const breakEvenPrice = baseResult.metrics.breakEvenPrice.value;
  const marginOfSafety =
    breakEvenPrice !== null && salePrice > 0 ? round4((salePrice - breakEvenPrice) / salePrice) : null;

  const worst = outcomes.reduce<StressOutcome | null>(
    (w, o) => (w === null || o.netProfit < w.netProfit ? o : w),
    null,
  );
  const capitalAtRisk = worst ? round0(Math.max(0, -worst.netProfit)) : 0;
  const survivalRate = outcomes.length
    ? round4(outcomes.filter((o) => o.survives).length / outcomes.length)
    : 1;

  return {
    base: {
      netProfit: baseProfit,
      roe: baseResult.metrics.roe.value,
      equityRequired: baseResult.metrics.equityRequired.value ?? 0,
    },
    outcomes,
    breakEvenPrice,
    marginOfSafety,
    maximumRenovation,
    minimumExitPrice,
    maximumAcquisition,
    capitalAtRisk,
    worstCase: worst,
    survivalRate,
  };
}

function scaleSaleTo(i: FinancialInputs, price: number): FinancialInputs {
  return i.exit.kind === "sale"
    ? { ...i, exit: { ...i.exit, salePrice: price } }
    : { ...i, exit: { ...i.exit, terminalValue: price } };
}

export function summarizeStress(report: StressReport): string {
  const failed = report.outcomes.filter((o) => !o.survives);
  if (failed.length === 0)
    return "La operación mantiene beneficio positivo en todos los escenarios de estrés estándar.";
  return `La operación deja de ser rentable en ${failed.length} de ${report.outcomes.length} escenarios: ${failed.map((f) => f.label).join(", ")}.`;
}

export type { FinancialResult };
