import type { EvidenceStatus } from "@/modules/core/evidence-status";

export type CostStage = "estimate" | "professional_budget" | "accepted_budget" | "committed" | "invoiced" | "paid";

export type WorkChapter =
  | "demolition"
  | "structure"
  | "masonry"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "carpentry"
  | "flooring"
  | "finishes"
  | "kitchen"
  | "bathroom"
  | "facade"
  | "roof"
  | "energy"
  | "accessibility"
  | "fire_safety"
  | "cleanup"
  | "other";

export interface CostLibraryItem {
  code: string;
  chapter: WorkChapter;
  label: string;
  unit: "m2" | "ml" | "ud" | "pa" | "h";
  /** Unit cost before VAT, material execution. */
  unitCost: number;
  /** Cost library that provided the figure (e.g. "demo.sevilla.2026"). */
  source: string;
  confidence: number;
  status: EvidenceStatus;
  updatedAt: string;
}

export interface BudgetLine {
  id: string;
  code: string;
  chapter: WorkChapter;
  label: string;
  quantity: number;
  unit: CostLibraryItem["unit"];
  unitCost: number;
  subtotal: number;
  source: string;
  confidence: number;
  status: EvidenceStatus;
  stage: CostStage;
  updatedAt: string;
}

export interface RenovationEstimate {
  lines: BudgetLine[];
  byChapter: Array<{ chapter: WorkChapter; amount: number; share: number }>;
  /** Material execution budget (PEM) before VAT and contingency. */
  materialBudget: number;
  overheadRate: number;
  overhead: number;
  /** PEM + overhead (contract price before VAT). */
  contractBudget: number;
  costPerM2: number;
  stage: CostStage;
  library: string;
  confidence: number;
  status: EvidenceStatus;
  notes: string[];
}
