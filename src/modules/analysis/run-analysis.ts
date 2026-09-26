import { adapters as defaultAdapters, sourceStatuses, type AdapterSet } from "@/modules/adapters";
import { aiProvider, type AIProvider } from "@/modules/ai/provider";
import {
  devilsAdvocateAgent,
  regulatoryConflictAgent,
  dataIntegrityAgent,
  assumptionChallengerAgent,
  anomalyAgent,
  riskSynthesisAgent,
} from "@/modules/agents/adversarial/agents";
import { executePlan } from "@/modules/agents/runtime/runner";
import type { AgentDefinition, AgentRunRecord, AnalysisEvent, Budget } from "@/modules/agents/runtime/types";
import { alternativesAgent, existingLayoutAgent } from "@/modules/agents/specialists/architecture";
import { catastroAgent } from "@/modules/agents/specialists/data";
import { exitAgent } from "@/modules/agents/specialists/exit";
import { financingAgent } from "@/modules/agents/specialists/finance";
import { strategiesAgent } from "@/modules/agents/specialists/investment";
import { comparablesAgent, valuationAgent } from "@/modules/agents/specialists/market";
import { intakeAgent } from "@/modules/agents/specialists/opportunity";
import { regulatorySnapshotAgent } from "@/modules/agents/specialists/regulatory";
import {
  changeOfUseAgent,
  licenceAgent,
  planningAgent,
  protectionAgent,
  tourismAgent,
  urbanismSynthesisAgent,
  zoningAgent,
} from "@/modules/agents/specialists/urbanism";
import { defaultCity } from "@/modules/city/registry";
import type { CityProfile } from "@/modules/city/types";
import { newId } from "@/modules/core/ids";
import { createLogger } from "@/modules/core/logger";
import { EvidenceCollector } from "@/modules/evidence/store";
import { DEFAULT_INVESTOR_DNA, type InvestorDNA } from "@/modules/investor/types";
import type { IntakeRequest } from "@/modules/property/intake";
import type { RegulatorySnapshot } from "@/modules/regulatory";
import { narrateSynthesis } from "./narrative";
import { computeOpportunityDNA, computeOpportunityGap, rankStrategies, templateSynthesis } from "./synthesis";
import type {
  AnalysisResult,
  ArchitectureAssessment,
  ExitAssessment,
  FinanceAssessment,
  MarketAssessment,
  PropertyProfile,
  RiskAssessment,
  StrategyResult,
  UrbanismAssessment,
} from "./types";

export interface AnalysisParams {
  intake: IntakeRequest;
  organizationId: string;
  userId: string;
  dealId?: string;
  investor?: InvestorDNA;
  city?: CityProfile;
  adapters?: AdapterSet;
  ai?: AIProvider;
  analysisDate?: string;
  budget?: Partial<Budget>;
  emit?: (event: AnalysisEvent) => void;
  onRunRecord?: (r: AgentRunRecord) => void;
  /** Cancels the plan (client disconnect, shutdown). */
  signal?: AbortSignal;
}

/** The Core Orchestrator's plan for a property analysis. Domain orchestrators are groups of specialist agents. */
export function buildAnalysisPlan(intake: IntakeRequest, investor: InvestorDNA): AgentDefinition[] {
  return [
    intakeAgent(intake),
    catastroAgent,
    comparablesAgent,
    valuationAgent,
    regulatorySnapshotAgent,
    planningAgent,
    zoningAgent,
    protectionAgent,
    licenceAgent,
    changeOfUseAgent,
    tourismAgent,
    urbanismSynthesisAgent,
    existingLayoutAgent,
    alternativesAgent,
    financingAgent,
    strategiesAgent(investor),
    exitAgent,
    devilsAdvocateAgent,
    regulatoryConflictAgent,
    dataIntegrityAgent,
    assumptionChallengerAgent,
    anomalyAgent,
    riskSynthesisAgent,
  ] as AgentDefinition[];
}

/**
 * Runs the full agentic analysis of a property and returns the structured
 * AnalysisResult. Emits streaming events for the UI. Deterministic engines do
 * every calculation; the model (if configured) only writes the narrative.
 */
export async function runAnalysis(params: AnalysisParams): Promise<AnalysisResult> {
  const analysisId = newId("an");
  const investor = params.investor ?? DEFAULT_INVESTOR_DNA;
  const city = params.city ?? defaultCity();
  const adapterSet = params.adapters ?? defaultAdapters();
  const ai = params.ai ?? aiProvider();
  const analysisDate = params.analysisDate ?? new Date().toISOString().slice(0, 10);
  const evidence = new EvidenceCollector();
  const emit = params.emit ?? (() => {});
  const started = Date.now();
  const plan = { agents: buildAnalysisPlan(params.intake, investor) };

  const outcome = await executePlan(
    plan,
    {
      analysisId,
      organizationId: params.organizationId,
      userId: params.userId,
      dealId: params.dealId,
      analysisDate,
      city,
      adapters: adapterSet,
      evidence,
      ai,
      logger: createLogger({ analysisId }),
    },
    { emit, budget: params.budget, onRunRecord: params.onRunRecord, signal: params.signal },
  );
  const o = outcome.outputs;
  const profile = o.get("data.catastro") as PropertyProfile | undefined;
  const market = o.get("market.valuation") as MarketAssessment | undefined;
  if (!profile || !market)
    throw new Error(`Analysis could not complete: ${outcome.failed.join(", ") || "unknown failure"}`);
  const urbanism = o.get("urbanism.synthesis") as UrbanismAssessment | undefined;
  const architecture = o.get("architecture.alternatives") as ArchitectureAssessment | undefined;
  const finance = o.get("finance.offers") as FinanceAssessment | undefined;
  const regulatory = o.get("regulatory.snapshot") as RegulatorySnapshot | undefined;
  if (!urbanism || !architecture || !finance || !regulatory) {
    const missing = [
      !urbanism && "urbanism.synthesis",
      !architecture && "architecture.alternatives",
      !finance && "finance.offers",
      !regulatory && "regulatory.snapshot",
    ].filter(Boolean);
    throw new Error(
      `Analysis could not complete: missing ${missing.join(", ")} (failed: ${outcome.failed.join(", ") || "none"})`,
    );
  }
  const rawStrategies = (o.get("investment.strategies") as StrategyResult[] | undefined) ?? [];
  const risk = (o.get("risk.synthesis") as RiskAssessment | undefined) ?? {
    stressByStrategy: {},
    findings: [],
    overall: "medium",
    summary: "Análisis de riesgo incompleto.",
  };
  const exit = (o.get("exit.liquidity") as ExitAssessment | undefined) ?? {
    daysToSell: market.liquidity.daysToSell,
    liquidity: market.liquidity.level,
    options: [],
    summary: "",
  };

  const strategies = rankStrategies(rawStrategies, investor);
  const gap = computeOpportunityGap(strategies, market, profile.askingPrice);
  const dna = computeOpportunityDNA({
    strategies,
    market,
    urbanism,
    architecture,
    finance,
    risk,
    profile,
    gap,
  });
  const template = templateSynthesis({ profile, strategies, gap, risk, urbanism, market, investor });
  const synthesis = await narrateSynthesis(ai, template, { profile, strategies, gap, risk });
  const sources = await sourceStatuses(adapterSet);
  const allEvidence = evidence.all();

  return {
    id: analysisId,
    dealId: params.dealId,
    organizationId: params.organizationId,
    analysisDate,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    intake: params.intake,
    investor,
    property: profile,
    market,
    urbanism,
    architecture,
    finance,
    regulatory,
    strategies,
    risk,
    exit,
    gap,
    dna,
    synthesis,
    evidence: allEvidence,
    agentRuns: outcome.records,
    sources,
    failedAgents: outcome.failed,
    demo: allEvidence.some((e) => e.demo),
  };
}
