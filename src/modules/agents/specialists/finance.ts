import type {
  CapitalStack,
  FinanceAssessment,
  MarketAssessment,
  PropertyProfile,
} from "@/modules/analysis/types";
import type { FinancingOffer } from "@/modules/adapters/financing/types";
import type { AgentDefinition } from "../runtime/types";
import { output } from "../runtime/types";

/** Finance Orchestrator → Financing Offers + Capital Stack agents. */
export const financingAgent: AgentDefinition<FinanceAssessment> = {
  type: "finance.offers",
  label: "Financiación construyendo escenarios",
  domain: "finance",
  description: "Recoge ofertas indicativas y construye estructuras de capital comparables.",
  dependsOn: ["market.valuation"],
  async run(ctx) {
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const market = output<MarketAssessment>(ctx, "market.valuation");
    const purchasePrice = profile.askingPrice || market.valuationUnrenovated.value.point;
    const totalCost = Math.round(purchasePrice * 1.1 + profile.property.builtAreaM2 * 700);
    const res = await ctx.tool("financing.query", { purchasePrice }, () =>
      ctx.adapters.financing.query({
        purchasePrice,
        totalCost,
        durationMonths: 9,
        investorProfile: "private",
        assetUse: profile.property.assetUse,
      }),
    );
    if (!res.ok) {
      ctx.progress(`Proveedor de financiación no disponible: ${res.error.message}`);
      return {
        offers: [],
        stacks: [
          {
            id: "stack_equity",
            label: "100 % capital propio",
            instruments: [],
            description: "Sin ofertas de financiación disponibles: se analiza sin deuda.",
          },
        ],
        recommendedStackId: "stack_equity",
        summary: "Fuente de financiación no disponible; estructuras con deuda no evaluadas.",
        demo: false,
      };
    }
    ctx.evidence.addMany(res.value.evidence);
    const offers = res.value.data;
    const { stacks, recommendedStackId } = buildCapitalStacks(offers);
    ctx.progress(`${offers.length} ofertas, ${stacks.length} estructuras`);
    return {
      offers,
      stacks,
      recommendedStackId,
      summary: `${offers.length} ofertas indicativas; ${stacks.length} estructuras de capital comparables.`,
      demo: res.value.mode === "demo",
    };
  },
};

/**
 * Comparable capital structures from a set of offers. Pure: the Finance
 * agent and the Radar's quick pass build the same stacks.
 */
export function buildCapitalStacks(offers: FinancingOffer[]): {
  stacks: CapitalStack[];
  recommendedStackId: string;
} {
  const mortgage = offers.find((o) => o.instrument.kind === "mortgage");
  const bridge = offers.find((o) => o.instrument.kind === "bridge");
  const reno = offers.find((o) => o.instrument.kind === "renovation_facility");
  const partner = offers.find((o) => o.instrument.kind === "co_investment");
  const stacks: CapitalStack[] = [
    {
      id: "stack_equity",
      label: "100 % capital propio",
      instruments: [],
      description: "Sin deuda: máxima simplicidad, menor ROE.",
    },
    ...(mortgage
      ? [
          {
            id: "stack_mortgage",
            label: "Hipoteca + capital",
            instruments: [mortgage.instrument],
            description: `Hipoteca al ${Math.round(mortgage.instrument.annualRate * 1000) / 10} % sobre el ${Math.round((mortgage.instrument.sizing.type === "ltv" ? mortgage.instrument.sizing.ratio : 0) * 100)} % del precio.`,
          },
        ]
      : []),
    ...(mortgage && reno
      ? [
          {
            id: "stack_mortgage_reno",
            label: "Hipoteca + línea de reforma",
            instruments: [mortgage.instrument, reno.instrument],
            description: "Financia también parte de la obra; menor capital, más coste financiero.",
          },
        ]
      : []),
    ...(bridge
      ? [
          {
            id: "stack_bridge",
            label: "Préstamo puente",
            instruments: [bridge.instrument],
            description: `Puente al ${Math.round(bridge.instrument.annualRate * 1000) / 10} % sobre el 65 % del coste; rápido, caro.`,
          },
        ]
      : []),
    ...(partner
      ? [
          {
            id: "stack_partner",
            label: "Co-inversión",
            instruments: [partner.instrument],
            description: "Socio aporta 40 % del coste a cambio del 40 % del beneficio.",
          },
        ]
      : []),
  ];
  return { stacks, recommendedStackId: mortgage ? "stack_mortgage" : "stack_equity" };
}
