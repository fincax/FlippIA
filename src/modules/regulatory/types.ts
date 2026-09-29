import type { EvidenceStatus } from "@/modules/core/evidence-status";

export type JurisdictionLevel = "eu" | "country" | "region" | "province" | "municipality" | "parcel";

export interface Jurisdiction {
  level: JurisdictionLevel;
  code: string; // "EU" | "ES" | "ES-AN" | "ES-SE" | "41091"
  label: string;
}

/** Material scope: which questions a regulation answers. */
export type RegulatoryTopic =
  | "planning"
  | "zoning"
  | "land_use"
  | "building_parameters"
  | "licence"
  | "responsible_declaration"
  | "heritage"
  | "protection"
  | "accessibility"
  | "habitability"
  | "fire_safety"
  | "building_code"
  | "energy"
  | "ite_iee"
  | "change_of_use"
  | "subdivision"
  | "horizontal_property"
  | "tenancy"
  | "tourism"
  | "tax.acquisition"
  | "tax.exit"
  | "tax.local"
  | "tax.works"
  | "housing"
  | "consumer";

export type RegulationStatus = "in_force" | "superseded" | "repealed" | "pending" | "unverified";

export interface RegulationVersion {
  id: string;
  regulationId: string;
  version: string;
  title: string;
  publicationDate?: string;
  sourceDate?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  status: RegulationStatus;
  sourceUrl?: string;
  sourceName: string; // BOE, BOJA, BOP Sevilla, Ayuntamiento de Sevilla...
  supersedes?: string;
  supersededBy?: string;
  ingestedAt: string;
  verifiedAt?: string;
  verificationStatus: EvidenceStatus;
  summary: string;
  /** Key articles or sections relevant to FlippIA analyses. */
  keyPoints: string[];
}

export interface Regulation {
  id: string;
  shortName: string;
  jurisdiction: Jurisdiction;
  topics: RegulatoryTopic[];
  /** Asset uses this regulation is relevant for; empty = all. */
  assetUses: Array<"residential" | "commercial" | "office" | "industrial" | "land" | "other">;
  versions: RegulationVersion[];
}

export interface RegulatorySnapshotEntry {
  regulationId: string;
  versionId: string;
  shortName: string;
  title: string;
  jurisdiction: Jurisdiction;
  topics: RegulatoryTopic[];
  effectiveFrom: string;
  effectiveUntil?: string;
  status: RegulationStatus;
  verificationStatus: EvidenceStatus;
  sourceUrl?: string;
  sourceName: string;
  verifiedAt?: string;
  reason: string; // why it was included
}

export interface RegulatorySnapshot {
  id: string;
  createdAt: string;
  analysisDate: string;
  jurisdictionChain: Jurisdiction[];
  topics: RegulatoryTopic[];
  entries: RegulatorySnapshotEntry[];
  /** Deterministic hash of (versionIds) to detect drift. */
  fingerprint: string;
  /** Sources that could not be resolved. */
  gaps: Array<{ topic: RegulatoryTopic; note: string }>;
  /** Instruments in process (status pending) that touch the topics: listed, never applied. */
  pending?: RegulatorySnapshotEntry[];
}
