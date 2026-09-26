import type {
  ArchitectureAssessment,
  FinanceAssessment,
  MarketAssessment,
  PropertyProfile,
  StrategyResult,
  UrbanismAssessment,
} from "@/modules/analysis/types";
import { computeMaximumAcquisitionPrice, runStressTest } from "@/modules/engines/financial";
import { buildScenarioSet } from "@/modules/engines/scenario";
import type { InvestorDNA } from "@/modules/investor/types";
import { STRATEGY_PLUGINS, type StrategyContext } from "@/modules/strategies";
import type { AgentDefinition } from "../runtime/types";
import { output } from "../runtime/types";

/**
 * Investment Orchestrator → MultiExit Agent. Evaluates every strategy plugin,
 * builds its scenario set (base/optimistic/conservative/stress) and computes
 * stress + maximum price for each. Ranking happens in the synthesis.
 */
export function strategiesAgent(investor: InvestorDNA): AgentDefinition<StrategyResult[]> {
  return {
    type: "investment.strategies",
    label: "Estrategias MultiExit calculadas",
    domain: "investment",
    description: "Evalúa todas las estrategias compatibles con el activo y construye sus escenarios.",
    dependsOn: ["market.valuation", "urbanism.synthesis", "architecture.alternatives", "finance.offers"],
    timeoutMs: 30_000,
    async run(ctx) {
      const sctx: StrategyContext = {
        analysisDate: ctx.analysisDate,
        city: ctx.city,
        property: output<PropertyProfile>(ctx, "data.catastro"),
        market: output<MarketAssessment>(ctx, "market.valuation"),
        urbanism: output<UrbanismAssessment>(ctx, "urbanism.synthesis"),
        architecture: output<ArchitectureAssessment>(ctx, "architecture.alternatives"),
        finance: output<FinanceAssessment>(ctx, "finance.offers"),
        investor,
      };
      const results: StrategyResult[] = [];
      for (const plugin of STRATEGY_PLUGINS) {
        const ev = plugin.evaluate(sctx);
        if (!ev) continue;
        ctx.progress(`Escenarios: ${plugin.label}`);
        const scenarioSet = buildScenarioSet({
          dealId: ctx.dealId ?? "pending",
          strategyId: plugin.id,
          base: ev.inputs,
          assumptions: ev.assumptions,
          now: new Date(ctx.analysisDate),
        });
        const base = scenarioSet.scenarios.find((s) => s.kind === "base")!.result!;
        const stress = runStressTest(ev.inputs, { minimumProfit: 0 });
        const maxPrice = computeMaximumAcquisitionPrice(ev.inputs, {
          minimumRoe: investor.targetRoe,
          minimumProfit: investor.targetProfit,
          maximumCapital: investor.maxEquityPerDeal,
        });
        results.push({
          id: plugin.id,
          label: plugin.label,
          family: plugin.family,
          description: plugin.description,
          applicability: ev.applicability,
          topics: plugin.topics,
          exitKind: ev.exitKind,
          transformation: ev.transformation,
          scenarioSet,
          headline: {
            netProfit: base.metrics.netProfit.value,
            roe: base.metrics.roe.value,
            annualizedRoe: base.metrics.annualizedRoe.value,
            irr: base.metrics.irr.value,
            equityRequired: base.metrics.equityRequired.value,
            durationMonths: ev.inputs.holding.durationMonths,
            salePrice: ev.inputs.exit.kind === "sale" ? ev.inputs.exit.salePrice : null,
            monthlyRent: ev.inputs.exit.kind === "rent" ? ev.inputs.exit.monthlyRent : null,
            margin: base.metrics.margin.value,
          },
          stress,
          maxPrice,
          score: 0,
          rank: 0,
          whyRanked: [],
        });
      }
      return results;
    },
  };
}
