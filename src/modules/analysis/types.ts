import type { FinancingOffer } from "@/modules/adapters/financing/types";
import type { MarketSnapshot } from "@/modules/adapters/market/types";
import type { PlanningInfo } from "@/modules/adapters/urbanismo-sevilla/types";
import type { SourceStatus } from "@/modules/adapters/types";
import type { AgentRunRecord } from "@/modules/agents/runtime/types";
import type { Microzone } from "@/modules/city/types";
import type { Confidence, EvidenceStatus } from "@/modules/core/evidence-status";
import type { RenovationEstimate, RenovationLevel } from "@/modules/engines/construction";
import type {
  FinancialInputs,
  FinancingInstrument,
  MaxPriceResult,
  StressReport,
} from "@/modules/engines/financial";
import type { ScenarioSet } from "@/modules/engines/scenario/types";
import type { ValuationResult } from "@/modules/engines/valuation/types";
import type { Evidence } from "@/modules/evidence/types";
import type { InvestorDNA } from "@/modules/investor/types";
import type { IntakeRequest } from "@/modules/property/intake";
import type { Property } from "@/modules/property/types";
import type { RegulatorySnapshot, RegulatoryTopic } from "@/modules/regulatory/types";

export interface PropertyProfile {
  property: Property;
  microzone: Microzone;
  cadastral: {
    found: boolean;
    cadastralRef?: string;
    builtAreaM2?: number;
    yearBuilt?: number;
    useLabel?: string;
    accessLevel?: "public" | "protected";
    mode: string;
  };
  askingPrice: number;
  askingPriceSource: "user" | "listing" | "estimated";
  summary: string;
}

export interface RentEstimate {
  monthly: { low: number; point: number; high: number };
  perM2Month: number;
  comparables: number;
  conditionFactor: number;
  status: EvidenceStatus;
}

export interface MarketAssessment {
  microzoneId: string;
  microzoneName: string;
  snapshot: MarketSnapshot;
  valuationRenovated: ValuationResult;
  valuationUnrenovated: ValuationResult;
  rent: RentEstimate;
  askingVsValue: { askingPrice: number; asIsValue: number; discount: number; note: string };
  liquidity: { daysToSell: number; level: "high" | "medium" | "low"; demand: "high" | "medium" | "low" };
  status: EvidenceStatus;
  confidence: Confidence;
  summary: string;
  demo: boolean;
}

export interface RequiredCheck {
  key: string;
  label: string;
  why: string;
  who: "architect" | "lawyer" | "municipality" | "technician" | "tax_advisor" | "community";
  blocking: boolean;
  topic?: RegulatoryTopic;
}

export interface UrbanismFinding {
  key: string;
  title: string;
  detail: string;
  status: EvidenceStatus;
  kind: "constraint" | "opportunity" | "info";
  regulationIds: string[];
}

export interface UrbanismAssessment {
  status: EvidenceStatus;
  planning: PlanningInfo;
  applicableRuleIds: string[];
  findings: UrbanismFinding[];
  constraints: string[];
  opportunities: string[];
  requiredChecks: RequiredCheck[];
  confidence: Confidence;
  humanReviewRequired: boolean;
  summary: string;
  demo: boolean;
}

export interface ArchitectureAlternative {
  id: string;
  label: string;
  description: string;
  program: { areaM2: number; bedrooms: number; bathrooms: number; units: number };
  renovationLevel: RenovationLevel;
  estimate: RenovationEstimate;
  valueUplift: number; // ratio over renovated value, e.g. 0.04
  feasibility: "feasible" | "conditional" | "unlikely";
  requiredChecks: RequiredCheck[];
  notes: string[];
}

export interface ArchitectureAssessment {
  current: { areaM2: number; bedrooms: number; bathrooms: number; units: number; condition: string };
  alternatives: ArchitectureAlternative[];
  status: EvidenceStatus;
  confidence: Confidence;
  summary: string;
}

export interface CapitalStack {
  id: string;
  label: string;
  instruments: FinancingInstrument[];
  description: string;
}

export interface FinanceAssessment {
  offers: FinancingOffer[];
  stacks: CapitalStack[];
  recommendedStackId: string;
  summary: string;
  demo: boolean;
}

export interface StrategyApplicability {
  applicable: boolean;
  conditional: boolean;
  reasons: string[];
  requiredChecks: RequiredCheck[];
}

export interface StrategyResult {
  id: string;
  label: string;
  family: "sell" | "hold" | "transform" | "develop";
  description: string;
  applicability: StrategyApplicability;
  topics: RegulatoryTopic[];
  exitKind: "sale" | "rent";
  transformation: { level: RenovationLevel | "none"; estimate?: RenovationEstimate; alternativeId?: string };
  scenarioSet: ScenarioSet;
  headline: {
    netProfit: number | null;
    roe: number | null;
    annualizedRoe: number | null;
    irr: number | null;
    equityRequired: number | null;
    durationMonths: number;
    salePrice: number | null;
    monthlyRent: number | null;
    margin: number | null;
  };
  stress?: StressReport;
  maxPrice?: MaxPriceResult;
  score: number;
  rank: number;
  whyRanked: string[];
}

export interface AdversarialFinding {
  agent: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  detail: string;
  strategyIds?: string[];
  evidenceIds?: string[];
}

export interface RiskAssessment {
  stressByStrategy: Record<string, StressReport>;
  findings: AdversarialFinding[];
  overall: "low" | "medium" | "high";
  summary: string;
}

export interface ExitAssessment {
  daysToSell: number;
  liquidity: "high" | "medium" | "low";
  options: Array<{ kind: string; label: string; note: string }>;
  summary: string;
}

export interface OpportunityGap {
  currentValue: number;
  potentialValue: number;
  gap: number;
  bestStrategyId: string | null;
  levers: Array<{ key: string; label: string; amount: number; explanation: string }>;
  summary: string;
}

export interface DnaDimension {
  key:
    | "acquisition"
    | "market"
    | "transformation"
    | "urbanism"
    | "architecture"
    | "finance"
    | "execution"
    | "liquidity"
    | "risk";
  label: string;
  score: number; // 0..100
  explanation: string;
}

export interface OpportunityDNA {
  dimensions: DnaDimension[];
  composite: {
    score: number;
    formula: string;
    weights: Record<DnaDimension["key"], number>;
    uncertainty: string;
  };
}

export interface InvestmentSynthesis {
  headline: string;
  thesis: string;
  topStrategyId: string | null;
  whyFirst: string[];
  futures: Array<{ strategyId: string; label: string; conditional: boolean; oneLiner: string }>;
  missingData: string[];
  warnings: string[];
  narrativeSource: "model" | "template";
}

export interface AnalysisResult {
  id: string;
  dealId?: string;
  organizationId: string;
  analysisDate: string;
  createdAt: string;
  durationMs: number;
  intake: IntakeRequest;
  investor: InvestorDNA;
  property: PropertyProfile;
  market: MarketAssessment;
  urbanism: UrbanismAssessment;
  architecture: ArchitectureAssessment;
  finance: FinanceAssessment;
  regulatory: RegulatorySnapshot;
  strategies: StrategyResult[];
  risk: RiskAssessment;
  exit: ExitAssessment;
  gap: OpportunityGap;
  dna: OpportunityDNA;
  synthesis: InvestmentSynthesis;
  evidence: Evidence[];
  agentRuns: AgentRunRecord[];
  sources: SourceStatus[];
  failedAgents: string[];
  demo: boolean;
}

export type BaseInputsFactory = (over: Partial<FinancialInputs>) => FinancialInputs;
