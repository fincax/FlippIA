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
  opts: { city?: CityProfile; analysisDate?: string } = {},
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
  const failed: string[] = [];
  const roe = r.metrics.roe.value;
  const profit = r.metrics.netProfit.value ?? 0;
  const equity = r.metrics.equityRequired.value ?? 0;
  if (roe === null || roe < investor.targetRoe)
    failed.push(
      `ROE ${roe === null ? "n/d" : (roe * 100).toFixed(1) + " %"} < objetivo ${(investor.targetRoe * 100).toFixed(0)} %`,
    );
  if (profit < investor.targetProfit)
    failed.push(
      `Beneficio ${Math.round(profit).toLocaleString("es-ES")} € < objetivo ${investor.targetProfit.toLocaleString("es-ES")} €`,
    );
  if (equity > investor.maxEquityPerDeal)
    failed.push(
      `Capital ${Math.round(equity).toLocaleString("es-ES")} € > máximo ${investor.maxEquityPerDeal.toLocaleString("es-ES")} €`,
    );
  if (durationMonths > investor.horizonMonths)
    failed.push(`Duración ${durationMonths} meses > horizonte ${investor.horizonMonths}`);
  if (investor.zones.length && !investor.zones.includes(zone.id))
    failed.push(`Zona ${zone.name} fuera de tus zonas`);
  if (listing.askingPrice > investor.ticketMax || listing.askingPrice < investor.ticketMin)
    failed.push("Precio fuera de tu ticket");
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
}

/** Reverse investing: rank listings by fit with the investor's objective. */
export function radarSearch(
  listings: OpportunityListing[],
  investor: InvestorDNA,
  opts: { analysisDate?: string; includeNonMatching?: boolean } = {},
): RadarHit[] {
  const hits: RadarHit[] = [];
  for (const l of listings) {
    const u = quickUnderwrite(l, investor, { analysisDate: opts.analysisDate });
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
    hits.push({ listing: l, underwriting: u, score: Math.round(score), why });
  }
  return hits.sort((a, b) => b.score - a.score);
}
