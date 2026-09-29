import type { OpportunityListing } from "@/modules/adapters/sources/types";
import type { CityProfile } from "@/modules/city/types";
import { computeFinancials, computeMaximumAcquisitionPrice } from "@/modules/engines/financial";
import type { InvestorDNA } from "@/modules/investor/types";
import { STRATEGY_PLUGINS } from "@/modules/strategies/plugins";
import type { StrategyPlugin } from "@/modules/strategies/types";
import { listingStrategyContext } from "./context";
import type { MarketReference } from "./reference";
import { assetConstraintFailures, investorCriteriaFailures, type AssetConstraints } from "./criteria";
import type { QuickUnderwriting } from "./underwrite";

/** One MultiExit strategy evaluated on a listing by the quick pass. */
export interface StrategyQuickResult {
  strategyId: string;
  label: string;
  family: StrategyPlugin["family"];
  exitKind: "sale" | "rent";
  conditional: boolean;
  blockingChecks: number;
  netProfit: number;
  roe: number | null;
  annualizedRoe: number | null;
  equityRequired: number;
  durationMonths: number;
  maximumPrice: number;
  meetsCriteria: boolean;
  failedCriteria: string[];
}

/** Quick underwriting where the figures come from the best of several strategies. */
export interface StrategyUnderwriting extends QuickUnderwriting {
  strategies: StrategyQuickResult[];
  bestStrategyId: string | null;
  /** The asset is what the brief asks for and at least one requested strategy applies to it. */
  projectFit: boolean;
}

export function isStrategyUnderwriting(u: QuickUnderwriting): u is StrategyUnderwriting {
  return Array.isArray((u as Partial<StrategyUnderwriting>).strategies);
}

function rank(a: StrategyQuickResult, b: StrategyQuickResult): number {
  if (a.meetsCriteria !== b.meetsCriteria) return a.meetsCriteria ? -1 : 1;
  if (a.failedCriteria.length !== b.failedCriteria.length)
    return a.failedCriteria.length - b.failedCriteria.length;
  const roeA = a.roe ?? -Infinity;
  const roeB = b.roe ?? -Infinity;
  if (roeA !== roeB) return roeB - roeA;
  return b.netProfit - a.netProfit;
}

/**
 * MultiExit quick pass: runs the chosen strategy plugins on a listing through
 * the same deterministic engine the full analysis uses, checks every result
 * against the investor's criteria and the brief's asset constraints, and
 * reports the best way in. A full analysis refines it.
 */
export function quickUnderwriteStrategies(
  listing: OpportunityListing,
  investor: InvestorDNA,
  opts: {
    strategyIds?: string[];
    constraints?: AssetConstraints;
    city?: CityProfile;
    analysisDate?: string;
    reference?: MarketReference;
  } = {},
): StrategyUnderwriting | null {
  const ctx = listingStrategyContext(listing, investor, {
    city: opts.city,
    analysisDate: opts.analysisDate,
    reference: opts.reference,
  });
  if (!ctx) return null;
  const referenceBasis: MarketReference["basis"] = opts.reference?.basis ?? "demo";
  const demo = listing.demo || referenceBasis === "demo";
  const wanted = opts.strategyIds?.length ? new Set(opts.strategyIds) : null;
  const plugins = STRATEGY_PLUGINS.filter((p) => !wanted || wanted.has(p.id));
  const assetFailures = opts.constraints ? assetConstraintFailures(listing, opts.constraints) : [];
  const zone = ctx.property.microzone;
  const constraints = {
    minimumRoe: investor.targetRoe,
    minimumProfit: investor.targetProfit,
    maximumCapital: investor.maxEquityPerDeal,
    maximumDuration: investor.horizonMonths,
  };

  const evaluated: Array<{ result: StrategyQuickResult; renovationBudget: number }> = [];
  for (const plugin of plugins) {
    const ev = plugin.evaluate(ctx);
    if (!ev) continue;
    const r = computeFinancials(ev.inputs);
    const roe = r.metrics.roe.value;
    const netProfit = Math.round(r.metrics.netProfit.value ?? 0);
    const equityRequired = Math.round(r.metrics.equityRequired.value ?? 0);
    const durationMonths = ev.inputs.holding.durationMonths;
    // An income project holds the asset by definition: the horizon governs capital rotation, not a rental.
    const ignoreDuration = ev.exitKind === "rent" && investor.objective !== "capital_gain";
    const failed = [
      ...investorCriteriaFailures(
        listing,
        zone,
        investor,
        { roe, netProfit, equityRequired, durationMonths },
        { ignoreDuration },
      ),
      ...assetFailures,
    ];
    const max = computeMaximumAcquisitionPrice(ev.inputs, constraints);
    evaluated.push({
      result: {
        strategyId: plugin.id,
        label: plugin.label,
        family: plugin.family,
        exitKind: ev.exitKind,
        conditional: ev.applicability.conditional,
        blockingChecks: ev.applicability.requiredChecks.filter((c) => c.blocking).length,
        netProfit,
        roe,
        annualizedRoe: r.metrics.annualizedRoe.value,
        equityRequired,
        durationMonths,
        maximumPrice: max.maximumPrice,
        meetsCriteria: failed.length === 0,
        failedCriteria: failed,
      },
      renovationBudget: ev.inputs.transformation.renovationBudget,
    });
  }

  evaluated.sort((a, b) => rank(a.result, b.result));
  const strategies = evaluated.map((e) => e.result);
  const best = evaluated[0];
  const asIsValue = ctx.market.askingVsValue.asIsValue;
  const arv = ctx.market.valuationRenovated.value.point;
  const discountVsAsIs = ctx.market.askingVsValue.discount;

  if (!best) {
    // No strategy applies to this asset (e.g. a renovated flat for a change-of-use brief).
    const failed = [
      ...assetFailures,
      ...(wanted
        ? ["Ninguna de las vías pedidas aplica a este activo"]
        : ["Ninguna estrategia aplica a este activo"]),
    ];
    return {
      listingId: listing.id,
      microzone: zone,
      asIsValue,
      arv,
      discountVsAsIs,
      renovationBudget: 0,
      netProfit: 0,
      roe: null,
      annualizedRoe: null,
      equityRequired: listing.askingPrice,
      durationMonths: 0,
      maximumPrice: 0,
      meetsCriteria: false,
      failedCriteria: failed,
      reentryPrice: 0,
      opportunityGap: Math.round(arv - asIsValue),
      referenceBasis,
      demo,
      strategies: [],
      bestStrategyId: null,
      projectFit: false,
    };
  }

  return {
    listingId: listing.id,
    microzone: zone,
    asIsValue,
    arv,
    discountVsAsIs,
    renovationBudget: best.renovationBudget,
    netProfit: best.result.netProfit,
    roe: best.result.roe,
    annualizedRoe: best.result.annualizedRoe,
    equityRequired: best.result.equityRequired,
    durationMonths: best.result.durationMonths,
    maximumPrice: best.result.maximumPrice,
    meetsCriteria: best.result.meetsCriteria,
    failedCriteria: best.result.failedCriteria,
    reentryPrice: best.result.maximumPrice,
    opportunityGap: Math.round(arv - asIsValue),
    referenceBasis,
    demo,
    strategies,
    bestStrategyId: best.result.strategyId,
    projectFit: assetFailures.length === 0,
  };
}
