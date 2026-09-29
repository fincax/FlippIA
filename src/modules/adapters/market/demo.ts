import { findMicrozone } from "@/modules/city/registry";
import { err, ok, appError } from "@/modules/core/result";
import type { NewEvidence } from "@/modules/evidence/store";
import type { Comparable } from "@/modules/engines/valuation/types";
import { seededUnit, type AdapterResponse, type DataSourceAdapter } from "../types";
import type { MarketQuery, MarketSnapshot } from "./types";

/**
 * DEMO market adapter. Generates deterministic comparables around the
 * microzone's demo statistics. A partner/commercial feed replaces it through
 * the same interface (MARKET_SOURCE_MODE=partner).
 */
export class MarketDemoAdapter implements DataSourceAdapter<MarketQuery, MarketSnapshot> {
  sourceId = "market-demo";
  sourceType = "demo" as const;
  sourceName = "Mercado Sevilla (DEMO)";
  sourceAuthority = "FlippIA — comparables sintéticos de demostración";
  mode = "demo" as const;

  async isAvailable() {
    return true;
  }

  async query(q: MarketQuery) {
    const found = findMicrozone(q.microzoneId);
    if (!found) return err(appError("MICROZONE_NOT_FOUND", `Microzona ${q.microzoneId} desconocida.`));
    const { city, zone } = found;
    const seed = `${zone.id}:${q.assetUse}:${Math.round(q.areaM2 / 10)}`;
    const m = zone.demoMarket;
    const isCommercial = q.assetUse !== "residential";
    const renovatedBase = isCommercial ? m.commercialPerM2 * 1.25 : m.residentialRenovatedPerM2;
    const unrenovatedBase = isCommercial ? m.commercialPerM2 : m.residentialUnrenovatedPerM2;
    const rentBase = isCommercial ? m.rentCommercialPerM2Month : m.rentResidentialPerM2Month;
    const analysis = new Date(q.analysisDate);
    const dateAgo = (months: number) => {
      const d = new Date(analysis.getTime());
      d.setMonth(d.getMonth() - months);
      return d.toISOString().slice(0, 10);
    };

    const comparablesSale: Comparable[] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (salt: string) => seededUnit(seed, `${i}:${salt}`);
      const renovated = u("cond") < 0.55;
      const type: Comparable["type"] =
        u("type") < 0.4 ? "transaction" : u("type") < 0.5 ? "internal" : "asking";
      const base = renovated ? renovatedBase : unrenovatedBase;
      const noise = 1 + (u("noise") - 0.5) * 0.24;
      const askPremium = type === "asking" ? 1.05 : 1;
      const area = Math.round(q.areaM2 * (0.7 + u("area") * 0.6));
      const ppm2 = base * noise * askPremium;
      comparablesSale.push({
        id: `cmp_${zone.id}_${i}`,
        type,
        sourceId: this.sourceId,
        price: Math.round((ppm2 * area) / 500) * 500,
        areaM2: area,
        date: dateAgo(Math.floor(u("age") * 14)),
        distanceM: Math.round(80 + u("dist") * 900),
        condition: renovated ? "renovated" : "unrenovated",
        assetUse: isCommercial ? "commercial" : "residential",
        floor: isCommercial ? 0 : Math.floor(u("floor") * 5),
        elevator: u("lift") < 0.6,
        exterior: u("ext") < 0.7,
        label: `${renovated ? "Reformado" : "Para reformar"} · ${area} m² · ${zone.name}`,
        demo: true,
      });
    }
    const comparablesRent = Array.from({ length: 5 }, (_, i) => {
      const u = (salt: string) => seededUnit(seed, `rent:${i}:${salt}`);
      const area = Math.round(q.areaM2 * (0.75 + u("area") * 0.5));
      return {
        id: `rcmp_${zone.id}_${i}`,
        monthlyRent: Math.round((rentBase * area * (1 + (u("noise") - 0.5) * 0.2)) / 10) * 10,
        areaM2: area,
        date: dateAgo(Math.floor(u("age") * 8)),
        distanceM: Math.round(100 + u("dist") * 800),
        type: (u("type") < 0.3 ? "transaction" : "asking") as "asking" | "transaction",
        demo: true,
      };
    });

    const data: MarketSnapshot = {
      microzoneId: zone.id,
      microzoneName: zone.name,
      comparablesSale,
      comparablesRent,
      stats: {
        renovatedPerM2: Math.round(renovatedBase),
        unrenovatedPerM2: Math.round(unrenovatedBase),
        spreadPerM2: Math.round(renovatedBase - unrenovatedBase),
        rentPerM2Month: rentBase,
        daysToSell: m.daysToSell,
        liquidity: m.liquidity,
        demand: m.demand,
        sampleSize: m.sampleSize,
        confidenceNote:
          "DEMO: estadísticas sintéticas sin muestra real. El City Brain sustituirá estos valores por datos medidos con tamaño de muestra y confianza.",
      },
      demo: true,
    };
    const retrievedAt = new Date().toISOString();
    const evidence: NewEvidence[] = [
      {
        sourceType: "demo",
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceAuthority: this.sourceAuthority,
        retrievedAt,
        geographicScope: { level: "municipality", code: city.municipalityCode, label: zone.name },
        excerpt: `DEMO — ${zone.name}: reformado ~${Math.round(renovatedBase)} €/m², sin reformar ~${Math.round(unrenovatedBase)} €/m², alquiler ~${rentBase} €/m²/mes, ${m.daysToSell} días de venta.`,
        structuredData: data.stats,
        confidence: 0.3,
        verificationStatus: "INFERRED",
        demo: true,
      },
      ...comparablesSale.map<NewEvidence>((c) => ({
        sourceType: "demo",
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceAuthority: this.sourceAuthority,
        retrievedAt,
        sourcePublishedAt: c.date,
        geographicScope: { level: "point", label: c.label ?? zone.name },
        excerpt: `DEMO comparable ${c.type}: ${c.price.toLocaleString("es-ES")} € · ${c.areaM2} m² · ${c.condition} · ${c.distanceM} m`,
        structuredData: {
          comparableId: c.id,
          price: c.price,
          areaM2: c.areaM2,
          type: c.type,
          condition: c.condition,
        },
        confidence: c.type === "transaction" ? 0.5 : 0.3,
        verificationStatus: "INFERRED",
        demo: true,
      })),
    ];
    const response: AdapterResponse<MarketSnapshot> = {
      data,
      evidence,
      retrievedAt,
      freshness: q.analysisDate,
      mode: "demo",
    };
    return ok(response);
  }
}
