import type { OpportunityListing } from "@/modules/adapters/sources/types";
import { defaultCity } from "@/modules/city/registry";
import type { CityProfile, Microzone } from "@/modules/city/types";
import { estimateRenovation } from "@/modules/engines/construction";
import {
  computeFinancials,
  computeMaximumAcquisitionPrice,
  type FinancialInputs,
} from "@/modules/engines/financial";
import type { InvestorDNA } from "@/modules/investor/types";
import type { ProjectBrief } from "./brief";
import { strategySetFor } from "./brief";
import { assetConstraintFailures, investorCriteriaFailures, type AssetConstraints } from "./criteria";
import { isStrategyUnderwriting, quickUnderwriteStrategies, type StrategyQuickResult } from "./strategies";

export interface QuickUnderwriting {
  listingId: string;
  microzone: Microzone;
  asIsValue: number;
  arv: number;
  discountVsAsIs: number; // (asIs − asking)/asIs
  renovationBudget: number;
  netProfit: number;
  roe: number | null;
  annualizedRoe: number | null;
  equityRequired: number;
  durationMonths: number;
  maximumPrice: number;
  meetsCriteria: boolean;
  failedCriteria: string[];
  /** Price below which the listing would meet every criterion. */
  reentryPrice: number;
  opportunityGap: number;
  demo: boolean;
}

/**
 * Radar quick underwriting. A fast, deterministic pass of the financial engine
 * over a listing using microzone statistics, to rank value discrepancies and
 * check them against the investor's DNA. A full analysis refines it.
 */
export function quickUnderwrite(
  listing: OpportunityListing,
  investor: InvestorDNA,
  opts: { city?: CityProfile; analysisDate?: string; constraints?: AssetConstraints } = {},
): QuickUnderwriting | null {
  const city = opts.city ?? defaultCity();
  const zone = city.microzones.find((m) => m.id === listing.microzoneId);
  if (!zone) return null;
  const analysisDate = opts.analysisDate ?? new Date().toISOString().slice(0, 10);
  const residential = listing.assetUse === "residential";
  const m = zone.demoMarket;
  const renovatedPerM2 = residential ? m.residentialRenovatedPerM2 : m.commercialPerM2 * 1.25;
  const unrenovatedPerM2 = residential ? m.residentialUnrenovatedPerM2 : m.commercialPerM2;
  const asIsValue = Math.round(
    (listing.condition === "renovated" ? renovatedPerM2 : unrenovatedPerM2) * listing.builtAreaM2,
  );
  const arv = Math.round(renovatedPerM2 * listing.builtAreaM2);
  const level = listing.condition === "renovated" ? "cosmetic" : residential ? "integral" : "medium";
  const estimate = estimateRenovation({
    areaM2: listing.builtAreaM2,
    level,
    bathrooms: listing.bathrooms ?? 1,
    bedrooms: listing.bedrooms ?? 2,
    now: new Date(analysisDate),
  });
  const worksMonths = level === "cosmetic" ? 1 : level === "medium" ? 3 : 5;
  const durationMonths =
    worksMonths + (level === "cosmetic" ? 0 : 1) + Math.max(1, Math.round(m.daysToSell / 30)) + 1;
  const inputs: FinancialInputs = {
    analysisDate,
    jurisdiction: city.taxJurisdiction,
    acquisition: {
      purchasePrice: listing.askingPrice,
      transferTaxMode: "ITP",
      assetUse: listing.assetUse,
      agencyFee: 0,
      dueDiligence: 600,
    },
    transformation: {
      renovationBudget: estimate.contractBudget,
      contingencyRate: 0.1,
      professionalFees: Math.round(estimate.contractBudget * (level === "integral" ? 0.08 : 0.05)),
      otherLicenceCosts: 0,
      worksMonths,
      worksVatReduced: false,
    },
    holding: {
      durationMonths,
      monthlyCommunityFees: 60,
      monthlyInsurance: 25,
      monthlyUtilities: 50,
      annualPropertyTax: Math.round(asIsValue * 0.45 * 0.0045),
      otherMonthly: 0,
    },
    financing: investor.usesFinancing
      ? [
          {
            kind: "mortgage",
            label: "Hipoteca",
            sizing: { type: "ltv", ratio: residential ? 0.7 : 0.6 },
            annualRate: residential ? 0.034 : 0.042,
            termMonths: 300,
            interestOnly: false,
            arrangementFeeRate: 0.005,
            drawMonth: 0,
          },
        ]
      : [],
    exit: {
      kind: "sale",
      salePrice: arv,
      agencyRate: 0.03,
      otherSaleCosts: 800,
      sellerProfile: investor.sellerProfile,
      plusvaliaMunicipal: null,
    },
  };
  const r = computeFinancials(inputs);
  const constraints = {
    minimumRoe: investor.targetRoe,
    minimumProfit: investor.targetProfit,
    maximumCapital: investor.maxEquityPerDeal,
    maximumDuration: investor.horizonMonths,
  };
  const max = computeMaximumAcquisitionPrice(inputs, constraints);
  const roe = r.metrics.roe.value;
  const profit = r.metrics.netProfit.value ?? 0;
  const equity = r.metrics.equityRequired.value ?? 0;
  const failed = [
    ...investorCriteriaFailures(listing, zone, investor, {
      roe,
      netProfit: profit,
      equityRequired: equity,
      durationMonths,
    }),
    ...(opts.constraints ? assetConstraintFailures(listing, opts.constraints) : []),
  ];
  return {
    listingId: listing.id,
    microzone: zone,
    asIsValue,
    arv,
    discountVsAsIs:
      asIsValue > 0 ? Math.round(((asIsValue - listing.askingPrice) / asIsValue) * 1000) / 1000 : 0,
    renovationBudget: estimate.contractBudget,
    netProfit: Math.round(profit),
    roe,
    annualizedRoe: r.metrics.annualizedRoe.value,
    equityRequired: Math.round(equity),
    durationMonths,
    maximumPrice: max.maximumPrice,
    meetsCriteria: failed.length === 0,
    failedCriteria: failed,
    reentryPrice: max.maximumPrice,
    opportunityGap: Math.round(arv - asIsValue),
    demo: listing.demo,
  };
}

export interface RadarHit {
  listing: OpportunityListing;
  underwriting: QuickUnderwriting;
  score: number;
  why: string[];
  /** Present when the search evaluated MultiExit strategies (project brief or DNA preferences). */
  strategies?: StrategyQuickResult[];
  bestStrategyId?: string | null;
}

export interface RadarSearchOptions {
  analysisDate?: string;
  includeNonMatching?: boolean;
  /** Spoken project: asset constraints and strategies. Without one the classic quick pass runs. */
  brief?: ProjectBrief;
  /** Explicit strategy set; overrides what the brief and the DNA would choose. */
  strategyIds?: string[];
}

/** Strategies a search will evaluate, or undefined for the classic quick pass. */
export function radarStrategySet(investor: InvestorDNA, opts: RadarSearchOptions = {}): string[] | undefined {
  return opts.strategyIds?.length ? opts.strategyIds : strategySetFor(opts.brief, investor);
}

/**
 * Reverse investing: rank listings by fit with the investor's objective.
 * Classic mode underwrites buy-renovate-sell; with a project brief or DNA
 * strategy preferences every listing is underwritten through the chosen
 * MultiExit plugins and the best way in is reported.
 */
export function radarSearch(
  listings: OpportunityListing[],
  investor: InvestorDNA,
  opts: RadarSearchOptions = {},
): RadarHit[] {
  const hits: RadarHit[] = [];
  const strategyIds = radarStrategySet(investor, opts);
  const constraints = opts.brief?.asset;
  for (const l of listings) {
    const u = strategyIds
      ? quickUnderwriteStrategies(l, investor, { strategyIds, constraints, analysisDate: opts.analysisDate })
      : quickUnderwrite(l, investor, { analysisDate: opts.analysisDate, constraints });
    if (!u) continue;
    if (!u.meetsCriteria && !opts.includeNonMatching) continue;
    const why: string[] = [];
    let score = 0;
    if (u.discountVsAsIs > 0.05) {
      score += Math.min(40, u.discountVsAsIs * 120);
      why.push(`Precio ${Math.round(u.discountVsAsIs * 100)} % por debajo del valor as-is de la zona.`);
    }
    if ((u.roe ?? 0) >= investor.targetRoe) {
      score += Math.min(30, 15 + ((u.roe ?? 0) - investor.targetRoe) * 60);
      why.push(`ROE ${((u.roe ?? 0) * 100).toFixed(1)} % en escenario rápido.`);
    }
    if (u.equityRequired <= investor.maxEquityPerDeal) score += 15;
    if (u.durationMonths <= investor.horizonMonths) score += 10;
    if (u.microzone.demoMarket.liquidity === "high") {
      score += 5;
      why.push("Microzona con liquidez alta.");
    }
    if (l.priceHistory.length > 1)
      why.push(
        `Bajada de precio reciente: ${l.priceHistory[0]!.price.toLocaleString("es-ES")} → ${l.askingPrice.toLocaleString("es-ES")} €.`,
      );
    if (isStrategyUnderwriting(u)) {
      const best = u.strategies.find((s) => s.strategyId === u.bestStrategyId);
      if (best) {
        const ok = u.strategies.filter((s) => s.meetsCriteria).length;
        why.push(
          `Mejor vía: ${best.label}${best.conditional ? ` (condicionada a ${best.blockingChecks} comprobación${best.blockingChecks === 1 ? "" : "es"})` : ""}. ${ok} de ${u.strategies.length} vías cumplen tus criterios.`,
        );
        if (ok > 1) score += Math.min(10, (ok - 1) * 3);
      }
      hits.push({
        listing: l,
        underwriting: u,
        score: Math.round(score),
        why,
        strategies: u.strategies,
        bestStrategyId: u.bestStrategyId,
      });
      continue;
    }
    hits.push({ listing: l, underwriting: u, score: Math.round(score), why });
  }
  return hits.sort((a, b) => b.score - a.score);
}
