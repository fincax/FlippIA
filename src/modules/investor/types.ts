export type InvestorProfileType =
  | "private_investor"
  | "professional_investor"
  | "developer"
  | "family_office"
  | "fund"
  | "foreign_investor"
  | "real_estate_company"
  | "architect_partner"
  | "broker_partner"
  | "agent_partner";

export type RiskTolerance = "low" | "medium" | "high";

export interface InvestorDNA {
  profileType: InvestorProfileType;
  capitalAvailable: number;
  maxEquityPerDeal: number;
  usesFinancing: boolean;
  experience: "none" | "some" | "experienced" | "professional";
  ticketMin: number;
  ticketMax: number;
  horizonMonths: number;
  objective: "capital_gain" | "income" | "mixed";
  targetRoe: number;
  targetProfit: number;
  riskTolerance: RiskTolerance;
  zones: string[]; // microzone ids
  strategies: string[]; // strategy ids preferred; empty = all
  liquidityNeeds: "low" | "medium" | "high";
  availabilityHoursPerWeek: number;
  sellerProfile: "individual" | "company";
  notes?: string;
}

export const DEFAULT_INVESTOR_DNA: InvestorDNA = {
  profileType: "private_investor",
  capitalAvailable: 250_000,
  maxEquityPerDeal: 120_000,
  usesFinancing: true,
  experience: "some",
  ticketMin: 120_000,
  ticketMax: 400_000,
  horizonMonths: 12,
  objective: "capital_gain",
  targetRoe: 0.15,
  targetProfit: 30_000,
  riskTolerance: "medium",
  zones: [],
  strategies: [],
  liquidityNeeds: "medium",
  availabilityHoursPerWeek: 5,
  sellerProfile: "individual",
};
