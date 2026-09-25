import type { EvidenceStatus } from "@/modules/core/evidence-status";

export type SourceType =
  | "official_registry" // Catastro, Registro de la Propiedad
  | "official_planning" // Gerencia de Urbanismo, IDE
  | "official_gazette" // BOE, BOJA, BOP
  | "official_statistics"
  | "market_listing"
  | "market_transaction"
  | "partner"
  | "user_document"
  | "user_input"
  | "professional_review"
  | "internal_model"
  | "demo";

export interface GeographicScope {
  level: "eu" | "country" | "region" | "province" | "municipality" | "parcel" | "building" | "point";
  code?: string; // ISO / INE / cadastral ref
  label: string;
}

/**
 * Every relevant datum in FlippIA carries provenance. No important conclusion
 * is stored without at least one Evidence record behind it.
 */
export interface Evidence {
  id: string;
  sourceType: SourceType;
  sourceId: string; // adapter / source registry id
  sourceName: string;
  sourceAuthority: string; // who is responsible for the data
  sourceUrl?: string;
  retrievedAt: string;
  sourcePublishedAt?: string;
  effectiveDate?: string;
  geographicScope: GeographicScope;
  documentId?: string;
  documentVersion?: string;
  excerpt?: string;
  structuredData?: Record<string, unknown>;
  confidence: number; // 0..1
  verificationStatus: EvidenceStatus;
  /** Synthetic data: shown as DEMO everywhere. */
  demo: boolean;
}

export interface EvidenceRef {
  evidenceId: string;
  role: string; // what this evidence supports, e.g. "cadastral_area"
}
