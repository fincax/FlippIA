import type { FinancingInstrument } from "@/modules/engines/financial/types";

export interface FinancingQuery {
  purchasePrice: number;
  totalCost: number;
  durationMonths: number;
  investorProfile: "private" | "professional" | "company";
  assetUse: "residential" | "commercial" | "office" | "industrial" | "land" | "other";
}

export interface FinancingOffer {
  id: string;
  providerId: string;
  providerName: string;
  instrument: FinancingInstrument;
  maxAmount: number;
  conditions: string[];
  indicative: boolean;
  validUntil?: string;
  demo: boolean;
}
