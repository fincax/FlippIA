import type { MarketAssessment, PropertyProfile, RentEstimate } from "@/modules/analysis/types";
import type { MarketSnapshot } from "@/modules/adapters/market/types";
import { buildConfidence } from "@/modules/core/evidence-status";
import { round0 } from "@/modules/core/math";
import { estimateValue } from "@/modules/engines/valuation";
import type { AgentDefinition } from "../runtime/types";
import { output } from "../runtime/types";

export const comparablesAgent: AgentDefinition<{
  snapshot: MarketSnapshot;
  evidenceIds: string[];
  summary: string;
}> = {
  type: "market.comparables",
  label: "Comparables recopilados",
  domain: "market",
  description: "Obtiene comparables de venta y alquiler de la microzona.",
  dependsOn: ["data.catastro"],
  async run(ctx) {
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const p = profile.property;
    const res = await ctx.tool("market.query", { microzoneId: profile.microzone.id }, () =>
      ctx.adapters.market.query({
        microzoneId: profile.microzone.id,
        point: p.coordinates,
        assetUse:
          p.assetUse === "residential"
            ? "residential"
            : p.assetUse === "commercial"
              ? "commercial"
              : p.assetUse === "office"
                ? "office"
                : "other",
        areaM2: p.builtAreaM2,
        analysisDate: ctx.analysisDate,
      }),
    );
    if (!res.ok) throw new Error(res.error.message);
    const evs = ctx.evidence.addMany(res.value.evidence);
    ctx.progress(
      `${res.value.data.comparablesSale.length} comparables de venta, ${res.value.data.comparablesRent.length} de alquiler`,
    );
    return {
      snapshot: res.value.data,
      evidenceIds: evs.map((e) => e.id),
      summary: `${res.value.data.comparablesSale.length} comparables en ${res.value.data.microzoneName}`,
    };
  },
};

export const valuationAgent: AgentDefinition<MarketAssessment> = {
  type: "market.valuation",
  label: "Mercado analizado",
  domain: "market",
  description: "Estima valor reformado, sin reformar y renta con metodología explicada.",
  dependsOn: ["market.comparables"],
  async run(ctx) {
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const { snapshot } = output<{ snapshot: MarketSnapshot }>(ctx, "market.comparables");
    const area = profile.property.builtAreaM2;
    const valuationRenovated = estimateValue({
      areaM2: area,
      targetCondition: "renovated",
      comparables: snapshot.comparablesSale,
      analysisDate: ctx.analysisDate,
    });
    const valuationUnrenovated = estimateValue({
      areaM2: area,
      targetCondition: "unrenovated",
      comparables: snapshot.comparablesSale,
      analysisDate: ctx.analysisDate,
    });
    const rentPerM2 = snapshot.comparablesRent.length
      ? snapshot.comparablesRent.reduce((a, r) => a + r.monthlyRent / r.areaM2, 0) /
        snapshot.comparablesRent.length
      : snapshot.stats.rentPerM2Month;
    const rentPoint = round0(rentPerM2 * area);
    const rent: RentEstimate = {
      monthly: { low: round0(rentPoint * 0.92), point: rentPoint, high: round0(rentPoint * 1.08) },
      perM2Month: Math.round(rentPerM2 * 100) / 100,
      comparables: snapshot.comparablesRent.length,
      conditionFactor: 1,
      status: snapshot.demo ? "INFERRED" : "INFERRED",
    };
    const askingPrice = profile.askingPrice || valuationUnrenovated.value.point;
    if (!profile.askingPrice) {
      profile.askingPrice = askingPrice;
      profile.askingPriceSource = "estimated";
    }
    const asIs = valuationUnrenovated.value.point;
    const discount = asIs > 0 ? (asIs - askingPrice) / asIs : 0;
    const confidence = buildConfidence(
      [
        {
          key: "sourceQuality",
          weight: 3,
          score: snapshot.demo ? 0.25 : 0.7,
          note: snapshot.demo ? "Comparables DEMO." : "Comparables de fuente autorizada.",
        },
        {
          key: "quantity",
          weight: 2,
          score: Math.min(1, snapshot.comparablesSale.length / 8),
          note: `${snapshot.comparablesSale.length} comparables de venta.`,
        },
        {
          key: "consistency",
          weight: 2,
          score: valuationRenovated.confidence.score,
          note: "Consistencia de la valoración reformada.",
        },
      ],
      "Confianza del análisis de mercado.",
    );
    ctx.progress(
      `ARV ${valuationRenovated.value.point.toLocaleString("es-ES")} € · as-is ${asIs.toLocaleString("es-ES")} €`,
    );
    return {
      microzoneId: snapshot.microzoneId,
      microzoneName: snapshot.microzoneName,
      snapshot,
      valuationRenovated,
      valuationUnrenovated,
      rent,
      askingVsValue: {
        askingPrice,
        asIsValue: asIs,
        discount: Math.round(discount * 1000) / 1000,
        note:
          discount > 0.05
            ? "Precio solicitado por debajo del valor de mercado sin reformar."
            : discount < -0.05
              ? "Precio solicitado por encima del valor de mercado sin reformar."
              : "Precio en línea con el mercado sin reformar.",
      },
      liquidity: {
        daysToSell: snapshot.stats.daysToSell,
        level: snapshot.stats.liquidity,
        demand: snapshot.stats.demand,
      },
      status: valuationRenovated.status,
      confidence,
      summary: `Reformado ${valuationRenovated.pricePerM2.point} €/m² (${valuationRenovated.value.low.toLocaleString("es-ES")}–${valuationRenovated.value.high.toLocaleString("es-ES")} €); sin reformar ${valuationUnrenovated.pricePerM2.point} €/m²; renta ${rentPoint} €/mes; ${snapshot.stats.daysToSell} días de venta.`,
      demo: snapshot.demo,
    };
  },
};
