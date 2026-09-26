import type { CityProfile } from "@/modules/city/types";
import type { ArchitectureAssessment, FinanceAssessment, MarketAssessment, PropertyProfile, RequiredCheck, StrategyApplicability, UrbanismAssessment } from "@/modules/analysis/types";
import type { RenovationEstimate, RenovationLevel } from "@/modules/engines/construction";
import type { FinancialInputs } from "@/modules/engines/financial";
import type { Assumption } from "@/modules/engines/scenario/types";
import type { InvestorDNA } from "@/modules/investor/types";
import type { RegulatoryTopic } from "@/modules/regulatory/types";

export interface StrategyContext {
  analysisDate: string;
  city: CityProfile;
  property: PropertyProfile;
  market: MarketAssessment;
  urbanism: UrbanismAssessment;
  architecture: ArchitectureAssessment;
  finance: FinanceAssessment;
  investor: InvestorDNA;
}

export interface StrategyEvaluation {
  applicability: StrategyApplicability;
  inputs: FinancialInputs;
  assumptions: Assumption[];
  transformation: { level: RenovationLevel | "none"; estimate?: RenovationEstimate; alternativeId?: string };
  exitKind: "sale" | "rent";
}

/**
 * MultiExit strategy plugin. Every strategy decides whether it applies, under
 * which conditions, and how to build explicit financial inputs and
 * assumptions from the assessments. New strategies are added by registering a
 * plugin; nothing else changes.
 */
export interface StrategyPlugin {
  id: string;
  label: string;
  family: "sell" | "hold" | "transform" | "develop";
  description: string;
  topics: RegulatoryTopic[];
  /** Return null when the strategy makes no sense for this asset (not shown). */
  evaluate(ctx: StrategyContext): StrategyEvaluation | null;
}

export type { RequiredCheck };
