import type { RequiredCheck } from "@/modules/analysis/types";
import {
  estimateRenovation,
  type RenovationEstimate,
  type RenovationLevel,
} from "@/modules/engines/construction";
import type { FinancialInputs, FinancingInstrument } from "@/modules/engines/financial";
import type { Assumption } from "@/modules/engines/scenario/types";
import type { StrategyContext } from "./types";

export function assumption(
  path: string,
  label: string,
  value: number | string | boolean,
  source: Assumption["source"],
  status: Assumption["status"],
  note?: string,
  unit: Assumption["unit"] = "currency",
): Assumption {
  return { path, label, value, unit, source, evidenceIds: [], status, note };
}

export function renovationFor(
  ctx: StrategyContext,
  level: RenovationLevel,
  scope?: Parameters<typeof estimateRenovation>[0]["scope"],
): RenovationEstimate {
  const p = ctx.property.property;
  return estimateRenovation({
    areaM2: p.builtAreaM2,
    level,
    bathrooms: p.bathrooms ?? (p.builtAreaM2 > 90 ? 2 : 1),
    bedrooms: p.bedrooms ?? Math.max(1, Math.round(p.builtAreaM2 / 30)),
    scope,
    now: new Date(ctx.analysisDate),
  });
}

export function professionalFeesFor(level: RenovationLevel | "none", pem: number): number {
  switch (level) {
    case "none":
      return 0;
    case "cosmetic":
      return 400;
    case "medium":
      return Math.round(pem * 0.05);
    case "integral":
      return Math.round(pem * 0.08);
    case "change_of_use":
      return Math.round(pem * 0.11);
  }
}

export function worksMonthsFor(level: RenovationLevel | "none"): number {
  return { none: 0, cosmetic: 1, medium: 3, integral: 5, change_of_use: 6 }[level];
}

export function permitMonthsFor(level: RenovationLevel | "none"): number {
  return { none: 0, cosmetic: 0, medium: 1, integral: 2, change_of_use: 5 }[level];
}

/** Estimated IBI when the cadastral value is unknown: rate × ~45 % of as-is market value. */
export function estimatedIbi(ctx: StrategyContext): number {
  const asIs = ctx.market.valuationUnrenovated.value.point || ctx.property.askingPrice;
  return Math.round(asIs * 0.45 * 0.0045);
}

export function primaryFinancing(ctx: StrategyContext, prefer: "mortgage" | "bridge"): FinancingInstrument[] {
  if (!ctx.investor.usesFinancing) return [];
  const stack =
    ctx.finance.stacks.find((s) => s.id === (prefer === "mortgage" ? "stack_mortgage" : "stack_bridge")) ??
    ctx.finance.stacks[0];
  return stack ? stack.instruments : [];
}

export function baseInputs(
  ctx: StrategyContext,
  params: {
    level: RenovationLevel | "none";
    estimate?: RenovationEstimate;
    exit: FinancialInputs["exit"];
    extraMonths?: number;
    financing?: FinancingInstrument[];
    worksVatReduced?: boolean;
  },
): { inputs: FinancialInputs; assumptions: Assumption[] } {
  const p = ctx.property.property;
  const pem = params.estimate?.contractBudget ?? 0;
  const worksMonths = worksMonthsFor(params.level);
  const permitMonths = permitMonthsFor(params.level);
  const sellMonths =
    params.exit.kind === "sale" ? Math.max(1, Math.round(ctx.market.liquidity.daysToSell / 30)) + 1 : 0;
  const holdMonths = params.exit.kind === "rent" ? 60 : 0;
  const durationMonths = Math.max(
    1,
    permitMonths + worksMonths + sellMonths + holdMonths + (params.extraMonths ?? 0),
  );
  const isCommercial = p.assetUse !== "residential";
  const ibi = estimatedIbi(ctx);
  const inputs: FinancialInputs = {
    analysisDate: ctx.analysisDate,
    jurisdiction: ctx.city.taxJurisdiction,
    acquisition: {
      purchasePrice: ctx.property.askingPrice,
      transferTaxMode: p.condition === "new" ? "IVA_AJD" : "ITP",
      assetUse: p.assetUse,
      agencyFee: 0,
      dueDiligence: 600,
    },
    transformation: {
      renovationBudget: pem,
      contingencyRate: params.level === "change_of_use" ? 0.15 : params.level === "integral" ? 0.12 : 0.1,
      professionalFees: professionalFeesFor(params.level, pem),
      otherLicenceCosts: params.level === "change_of_use" ? 1_500 : 0,
      worksMonths: Math.max(1, worksMonths),
      worksVatReduced: params.worksVatReduced ?? false,
    },
    holding: {
      durationMonths,
      monthlyCommunityFees: isCommercial ? 40 : 60,
      monthlyInsurance: 25,
      monthlyUtilities: 50,
      annualPropertyTax: ibi,
      otherMonthly: 0,
    },
    financing: params.financing ?? [],
    exit: params.exit,
  };
  const assumptions: Assumption[] = [
    assumption(
      "acquisition.purchasePrice",
      "Precio de compra",
      ctx.property.askingPrice,
      ctx.property.askingPriceSource === "user"
        ? "user"
        : ctx.property.askingPriceSource === "listing"
          ? "adapter"
          : "engine",
      // A price the user typed is a declared input, not a verified fact; a listing price is observed at its source.
      ctx.property.askingPriceSource === "listing" ? "VERIFIED" : "INFERRED",
      ctx.property.askingPriceSource === "estimated"
        ? "Sin precio indicado: se usa el valor de mercado sin reformar."
        : ctx.property.askingPriceSource === "user"
          ? "Precio indicado por el usuario; no contrastado con ninguna fuente."
          : undefined,
    ),
    assumption(
      "transformation.renovationBudget",
      "Presupuesto de obra (PEM + GG/BI)",
      pem,
      "engine",
      params.estimate?.status ?? "UNKNOWN",
      params.estimate
        ? `Estimación paramétrica ${params.level}, biblioteca ${params.estimate.library}.`
        : "Sin obra.",
    ),
    assumption(
      "transformation.contingencyRate",
      "Contingencia",
      inputs.transformation.contingencyRate,
      "engine",
      "INFERRED",
      undefined,
      "ratio",
    ),
    assumption(
      "holding.durationMonths",
      "Duración total",
      durationMonths,
      "engine",
      "INFERRED",
      `Licencia ${permitMonths} m + obra ${worksMonths} m + ${params.exit.kind === "sale" ? `venta ${sellMonths} m` : `explotación ${holdMonths} m`}.`,
      "months",
    ),
    assumption(
      "holding.annualPropertyTax",
      "IBI anual",
      ibi,
      "engine",
      "INFERRED",
      "Valor catastral desconocido: estimado como 45 % del valor de mercado × tipo 0,45 %.",
    ),
  ];
  if (params.exit.kind === "sale") {
    assumptions.push(
      assumption(
        "exit.salePrice",
        "Precio de salida (ARV)",
        params.exit.salePrice,
        "market",
        ctx.market.valuationRenovated.status,
        `Rango ${ctx.market.valuationRenovated.value.low.toLocaleString("es-ES")}–${ctx.market.valuationRenovated.value.high.toLocaleString("es-ES")} €.`,
      ),
    );
    assumptions.push(
      assumption(
        "exit.agencyRate",
        "Comisión de venta",
        params.exit.agencyRate,
        "engine",
        "INFERRED",
        undefined,
        "ratio",
      ),
    );
  } else {
    assumptions.push(
      assumption(
        "exit.monthlyRent",
        "Renta mensual",
        params.exit.monthlyRent,
        "market",
        ctx.market.rent.status,
      ),
    );
    assumptions.push(
      assumption(
        "exit.vacancyRate",
        "Vacancia",
        params.exit.vacancyRate,
        "engine",
        "INFERRED",
        undefined,
        "ratio",
      ),
    );
    assumptions.push(
      assumption(
        "exit.terminalValue",
        "Valor terminal",
        params.exit.terminalValue,
        "market",
        ctx.market.valuationRenovated.status,
        "Sin revalorización asumida.",
      ),
    );
  }
  return { inputs, assumptions };
}

export function check(
  key: string,
  label: string,
  why: string,
  who: RequiredCheck["who"],
  blocking: boolean,
  topic?: RequiredCheck["topic"],
): RequiredCheck {
  return { key, label, why, who, blocking, topic };
}

export function saleExit(salePrice: number, ctx: StrategyContext): FinancialInputs["exit"] {
  return {
    kind: "sale",
    salePrice,
    agencyRate: 0.03,
    otherSaleCosts: 800,
    sellerProfile: ctx.investor.sellerProfile,
    plusvaliaMunicipal: null,
  };
}

export function rentExit(
  monthlyRent: number,
  terminalValue: number,
  ctx: StrategyContext,
  over: Partial<{ vacancyRate: number; opexRate: number }> = {},
): FinancialInputs["exit"] {
  return {
    kind: "rent",
    monthlyRent,
    vacancyRate: over.vacancyRate ?? 0.05,
    opexRate: over.opexRate ?? 0.12,
    terminalValue,
    terminalAgencyRate: 0.03,
    sellerProfile: ctx.investor.sellerProfile,
  };
}
