import { ok } from "@/modules/core/result";
import type { NewEvidence } from "@/modules/evidence/store";
import type { AdapterResponse, DataSourceAdapter } from "../types";
import type { FinancingOffer, FinancingQuery } from "./types";

/**
 * DEMO financing provider. Produces indicative structures the Finance
 * Orchestrator compares. Real brokers/entities implement the same interface
 * (FinancingProviderAdapter) via FINANCING_PROVIDER_MODE=partner.
 */
export class FinancingDemoAdapter implements DataSourceAdapter<FinancingQuery, FinancingOffer[]> {
  sourceId = "financing-demo";
  sourceType = "demo" as const;
  sourceName = "FlippIA Funding (DEMO)";
  sourceAuthority = "FlippIA — condiciones indicativas de demostración";
  mode = "demo" as const;

  async isAvailable() {
    return true;
  }

  async query(q: FinancingQuery) {
    const residential = q.assetUse === "residential";
    const offers: FinancingOffer[] = [
      {
        id: "off_mortgage",
        providerId: "demo-bank",
        providerName: "Entidad bancaria (DEMO)",
        instrument: {
          kind: "mortgage",
          label: "Hipoteca",
          sizing: { type: "ltv", ratio: residential ? 0.7 : 0.6 },
          annualRate: residential ? 0.034 : 0.042,
          termMonths: 300,
          interestOnly: false,
          arrangementFeeRate: 0.005,
          drawMonth: 0,
        },
        maxAmount: Math.round(q.purchasePrice * (residential ? 0.7 : 0.6)),
        conditions: ["Tasación oficial", "Seguro de hogar", "Vinculación básica"],
        indicative: true,
        demo: true,
      },
      {
        id: "off_bridge",
        providerId: "demo-private",
        providerName: "Financiación puente (DEMO)",
        instrument: {
          kind: "bridge",
          label: "Préstamo puente",
          sizing: { type: "ltc", ratio: 0.65 },
          annualRate: 0.095,
          termMonths: Math.max(6, q.durationMonths),
          interestOnly: true,
          arrangementFeeRate: 0.02,
          drawMonth: 0,
        },
        maxAmount: Math.round(q.totalCost * 0.65),
        conditions: [
          "Garantía hipotecaria primer rango",
          "Plazo máximo 18 meses",
          "Salida por venta o refinanciación",
        ],
        indicative: true,
        demo: true,
      },
      {
        id: "off_reno",
        providerId: "demo-bank",
        providerName: "Línea de reforma (DEMO)",
        instrument: {
          kind: "renovation_facility",
          label: "Línea de reforma",
          sizing: { type: "amount", amount: Math.round(q.totalCost * 0.15) },
          annualRate: 0.065,
          termMonths: 84,
          interestOnly: false,
          arrangementFeeRate: 0.01,
          drawMonth: 1,
        },
        maxAmount: Math.round(q.totalCost * 0.15),
        conditions: ["Presupuesto y licencia", "Disposición contra certificaciones"],
        indicative: true,
        demo: true,
      },
      {
        id: "off_partner",
        providerId: "demo-coinvest",
        providerName: "Co-inversión (DEMO)",
        instrument: {
          kind: "co_investment",
          label: "Socio capitalista",
          sizing: { type: "ltc", ratio: 0.4 },
          annualRate: 0,
          termMonths: q.durationMonths,
          interestOnly: true,
          arrangementFeeRate: 0,
          drawMonth: 0,
          profitShare: 0.4,
        },
        maxAmount: Math.round(q.totalCost * 0.4),
        conditions: ["Reparto de beneficio 60/40", "Pacto de socios"],
        indicative: true,
        demo: true,
      },
    ];
    const retrievedAt = new Date().toISOString();
    const evidence: NewEvidence[] = [
      {
        sourceType: "demo",
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceAuthority: this.sourceAuthority,
        retrievedAt,
        geographicScope: { level: "country", code: "ES", label: "España" },
        excerpt:
          "DEMO — Condiciones de financiación indicativas: hipoteca 70 % LTV al 3,4 %; puente 65 % LTC al 9,5 %; línea de reforma; co-inversión 60/40.",
        confidence: 0.3,
        verificationStatus: "INFERRED",
        demo: true,
      },
    ];
    const response: AdapterResponse<FinancingOffer[]> = { data: offers, evidence, retrievedAt, mode: "demo" };
    return ok(response);
  }
}
