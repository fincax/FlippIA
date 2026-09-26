import {
  computeFinancials,
  computeMaximumAcquisitionPrice,
  type FinancialInputs,
} from "@/modules/engines/financial";
import { applyOverrides } from "@/modules/engines/scenario";
import type { InvestorDNA } from "@/modules/investor/types";
import type { AnalysisResult, StrategyResult } from "./types";
import { formatMoney, formatPercent } from "@/lib/format";

export interface MagicImprovement {
  key: string;
  strategyId: string;
  strategyLabel: string;
  lever: "price" | "financing" | "timeline" | "transformation" | "tax" | "exit";
  title: string;
  detail: string;
  deltaProfit: number;
  deltaRoe: number | null;
  equityAfter: number | null;
  conditions: string[];
  overrides: Record<string, number | string | boolean>;
  status: "VERIFIED" | "INFERRED" | "REVIEW_REQUIRED";
}

export interface MagicReport {
  headline: string;
  improvements: MagicImprovement[];
  bestCombination: {
    strategyId: string;
    deltaProfit: number;
    roe: number | null;
    equity: number | null;
    description: string;
  } | null;
  notes: string[];
}

/**
 * HAZ MAGIA / Discover potential. Re-examines each strategy looking for
 * reasonable, explicit improvements: negotiated price, capital stack, timeline,
 * transformation scope, tax treatment and exit. Every improvement is a
 * concrete override with its conditions; nothing is faked.
 */
export function discoverPotential(
  analysis: AnalysisResult,
  investor: InvestorDNA = analysis.investor,
): MagicReport {
  const improvements: MagicImprovement[] = [];
  const notes: string[] = [];
  const candidates = analysis.strategies.filter((s) => s.applicability.applicable).slice(0, 4);
  for (const s of candidates) improvements.push(...improveStrategy(s, analysis, investor));
  improvements.sort((a, b) => b.deltaProfit - a.deltaProfit);

  let best: MagicReport["bestCombination"] = null;
  for (const s of candidates) {
    const mine = improvements.filter((i) => i.strategyId === s.id && i.status !== "REVIEW_REQUIRED");
    if (!mine.length) continue;
    const combined = mine.reduce<Record<string, number | string | boolean>>(
      (acc, i) => ({ ...acc, ...i.overrides }),
      {},
    );
    const inputs = applyOverrides(s.scenarioSet.base, combined);
    const r = safeCompute(inputs);
    if (!r) continue;
    const base = baseOf(s);
    const delta = (r.metrics.netProfit.value ?? 0) - (base?.metrics.netProfit.value ?? 0);
    if (!best || delta > best.deltaProfit)
      best = {
        strategyId: s.id,
        deltaProfit: Math.round(delta),
        roe: r.metrics.roe.value,
        equity: r.metrics.equityRequired.value,
        description: `${s.label} con ${mine.map((i) => i.title.toLowerCase()).join(" + ")}.`,
      };
  }
  if (!improvements.length)
    notes.push(
      "No he encontrado mejoras razonables sin cambiar de activo: las palancas habituales ya están en su punto o dependen de comprobaciones.",
    );
  notes.push("Las mejoras son hipótesis explícitas; ninguna modifica tu escenario base sin confirmación.");
  const headline = improvements.length
    ? `He encontrado ${improvements.length} maneras de mejorar la operación.`
    : "No hay magia posible sin datos nuevos.";
  return { headline, improvements: improvements.slice(0, 12), bestCombination: best, notes };
}

function baseOf(s: StrategyResult) {
  return s.scenarioSet.scenarios.find((x) => x.kind === "base")?.result ?? null;
}

function safeCompute(inputs: FinancialInputs) {
  try {
    return computeFinancials(inputs);
  } catch {
    return null;
  }
}

function improveStrategy(
  s: StrategyResult,
  analysis: AnalysisResult,
  investor: InvestorDNA,
): MagicImprovement[] {
  const out: MagicImprovement[] = [];
  const base = baseOf(s);
  if (!base) return out;
  const inputs = s.scenarioSet.base;
  const baseProfit = base.metrics.netProfit.value ?? 0;
  const baseRoe = base.metrics.roe.value;
  const push = (
    partial: Omit<
      MagicImprovement,
      "strategyId" | "strategyLabel" | "deltaProfit" | "deltaRoe" | "equityAfter"
    > & { inputs: FinancialInputs },
  ) => {
    const r = safeCompute(partial.inputs);
    if (!r) return;
    const delta = (r.metrics.netProfit.value ?? 0) - baseProfit;
    if (delta < 500) return;
    const { inputs: _i, ...rest } = partial;
    void _i;
    out.push({
      ...rest,
      strategyId: s.id,
      strategyLabel: s.label,
      deltaProfit: Math.round(delta),
      deltaRoe:
        r.metrics.roe.value !== null && baseRoe !== null
          ? Math.round((r.metrics.roe.value - baseRoe) * 1000) / 1000
          : null,
      equityAfter: r.metrics.equityRequired.value,
    });
  };

  // 1. Negotiated price: target the max price for the investor's objectives, capped at 8 % below asking.
  const max = computeMaximumAcquisitionPrice(inputs, {
    minimumRoe: investor.targetRoe,
    minimumProfit: investor.targetProfit,
    maximumCapital: investor.maxEquityPerDeal,
  });
  const negotiated = Math.min(
    inputs.acquisition.purchasePrice * 0.92,
    Math.max(max.maximumPrice, inputs.acquisition.purchasePrice * 0.85),
  );
  if (negotiated < inputs.acquisition.purchasePrice - 1000) {
    push({
      key: `${s.id}:price`,
      lever: "price",
      title: `Negociar a ${formatMoney(Math.round(negotiated))}`,
      detail: `${formatPercent(1 - negotiated / inputs.acquisition.purchasePrice)} por debajo del precio solicitado; el precio máximo para tus objetivos es ${formatMoney(max.maximumPrice)} (límite: ${max.bindingConstraint}).`,
      conditions: ["Argumentario: comparables as-is, coste de obra y días en mercado."],
      overrides: { "acquisition.purchasePrice": Math.round(negotiated) },
      status: "INFERRED",
      inputs: { ...inputs, acquisition: { ...inputs.acquisition, purchasePrice: Math.round(negotiated) } },
    });
  }
  // 2. Capital stack alternatives.
  for (const stack of analysis.finance.stacks) {
    if (stack.id === "stack_equity" && inputs.financing.length === 0) continue;
    const alt: FinancialInputs = { ...inputs, financing: stack.instruments };
    const r = safeCompute(alt);
    if (!r) continue;
    const equity = r.metrics.equityRequired.value ?? Infinity;
    const roeGain = (r.metrics.roe.value ?? -1) - (baseRoe ?? -1);
    if (equity <= investor.maxEquityPerDeal && roeGain > 0.02) {
      out.push({
        key: `${s.id}:stack:${stack.id}`,
        strategyId: s.id,
        strategyLabel: s.label,
        lever: "financing",
        title: `Estructura: ${stack.label}`,
        detail: `${stack.description} ROE ${formatPercent(baseRoe ?? 0)} → ${formatPercent(r.metrics.roe.value ?? 0)}; capital ${formatMoney(base.metrics.equityRequired.value ?? 0)} → ${formatMoney(equity)}.`,
        deltaProfit: Math.round((r.metrics.netProfit.value ?? 0) - baseProfit),
        deltaRoe: Math.round(roeGain * 1000) / 1000,
        equityAfter: equity,
        conditions: stack.instruments.length ? ["Oferta indicativa: sujeta a aprobación de la entidad."] : [],
        overrides: {},
        status: "INFERRED",
      });
    }
  }
  // 3. Timeline: if liquidity is high and works are medium/integral, shave a month of commercialization.
  if (analysis.market.liquidity.level === "high" && inputs.holding.durationMonths > 4) {
    push({
      key: `${s.id}:timeline`,
      lever: "timeline",
      title: "Comercializar durante la obra",
      detail:
        "Con liquidez alta, anunciar en la última fase de obra ahorra un mes de tenencia y financiación.",
      conditions: ["Fotos/render y visita con obra avanzada."],
      overrides: { "holding.durationMonths": inputs.holding.durationMonths - 1 },
      status: "INFERRED",
      inputs: {
        ...inputs,
        holding: { ...inputs.holding, durationMonths: inputs.holding.durationMonths - 1 },
      },
    });
  }
  // 4. Reduced VAT on works (residential renovation) — review required.
  if (
    inputs.acquisition.assetUse === "residential" &&
    inputs.transformation.renovationBudget > 0 &&
    !inputs.transformation.worksVatReduced
  ) {
    push({
      key: `${s.id}:vat`,
      lever: "tax",
      title: "IVA reducido (10 %) en la obra",
      detail:
        "Las obras de renovación en vivienda pueden tributar al 10 % si el coste de materiales no supera el 40 % y se cumplen los requisitos del art. 91 LIVA.",
      conditions: ["Verificar requisitos con asesor fiscal y contratista; vivienda con más de dos años."],
      overrides: { "transformation.worksVatReduced": true },
      status: "REVIEW_REQUIRED",
      inputs: { ...inputs, transformation: { ...inputs.transformation, worksVatReduced: true } },
    });
  }
  // 5. Transformation scope: a cheaper level when the market spread does not pay for integral.
  if (s.transformation.level === "integral") {
    const medium = analysis.architecture.alternatives.find((a) => a.renovationLevel === "medium");
    const cosmetic = analysis.architecture.alternatives.find((a) => a.renovationLevel === "cosmetic");
    const alt = medium ?? cosmetic;
    if (alt && inputs.exit.kind === "sale") {
      const salePrice = Math.round(
        analysis.market.valuationUnrenovated.value.point +
          (inputs.exit.salePrice - analysis.market.valuationUnrenovated.value.point) * (medium ? 0.8 : 0.45),
      );
      push({
        key: `${s.id}:scope`,
        lever: "transformation",
        title: `Reducir alcance a ${alt.label.toLowerCase()}`,
        detail: `Obra ${formatMoney(alt.estimate.contractBudget)} en lugar de ${formatMoney(inputs.transformation.renovationBudget)}; salida estimada ${formatMoney(salePrice)}.`,
        conditions: ["Confirmar con arquitecto qué partidas aportan valor real en la zona."],
        overrides: {
          "transformation.renovationBudget": alt.estimate.contractBudget,
          "exit.salePrice": salePrice,
          "transformation.worksMonths": 3,
        },
        status: "INFERRED",
        inputs: {
          ...inputs,
          transformation: {
            ...inputs.transformation,
            renovationBudget: alt.estimate.contractBudget,
            worksMonths: 3,
          },
          exit: { ...inputs.exit, salePrice },
        },
      });
    }
  }
  // 6. Exit: sale to investor with tenant when rent strategy is strong.
  if (inputs.exit.kind === "rent" && s.headline.irr !== null && s.headline.irr < investor.targetRoe) {
    const sale: FinancialInputs = {
      ...inputs,
      holding: { ...inputs.holding, durationMonths: Math.max(4, inputs.transformation.worksMonths + 3) },
      exit: {
        kind: "sale",
        salePrice: inputs.exit.terminalValue,
        agencyRate: 0.03,
        otherSaleCosts: 800,
        sellerProfile: inputs.exit.sellerProfile,
        plusvaliaMunicipal: null,
      },
    };
    push({
      key: `${s.id}:exit`,
      lever: "exit",
      title: "Salida por venta tras la reforma",
      detail: "El alquiler no alcanza tu ROE objetivo; vender reformado acorta el plazo.",
      conditions: [],
      overrides: {},
      status: "INFERRED",
      inputs: sale,
    });
  }
  return out;
}
