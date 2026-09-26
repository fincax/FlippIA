import type { ExitAssessment, MarketAssessment, PropertyProfile } from "@/modules/analysis/types";
import type { AgentDefinition } from "../runtime/types";
import { output } from "../runtime/types";

/** Exit Orchestrator → Liquidity Agent. */
export const exitAgent: AgentDefinition<ExitAssessment> = {
  type: "exit.liquidity",
  label: "Salidas evaluadas",
  domain: "exit",
  description: "Liquidez, tiempos de venta y vías de salida del activo.",
  dependsOn: ["market.valuation"],
  async run(ctx) {
    const market = output<MarketAssessment>(ctx, "market.valuation");
    const { property } = output<PropertyProfile>(ctx, "data.catastro");
    const residential = property.assetUse === "residential";
    const options = [
      { kind: "sale_retail", label: "Venta a particular", note: `~${market.liquidity.daysToSell} días de comercialización en la microzona (demanda ${market.liquidity.demand}).` },
      { kind: "sale_investor", label: "Venta a inversor con renta", note: residential ? "Activo alquilado: descuento habitual del 5–10 % sobre valor libre." : "Local con operador: valoración por rentabilidad (cap rate)." },
      { kind: "refinance", label: "Refinanciación y mantenimiento", note: "Recuperar capital vía hipoteca sobre valor reformado y conservar el activo." },
    ];
    return { daysToSell: market.liquidity.daysToSell, liquidity: market.liquidity.level, options, summary: `Liquidez ${market.liquidity.level}; ${market.liquidity.daysToSell} días de venta estimados.` };
  },
};
