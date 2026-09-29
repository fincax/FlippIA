import type { LatLng } from "@/modules/city/types";
import type { EvidenceStatus } from "@/modules/core/evidence-status";

export type UrbanismQuery = {
  point?: LatLng;
  address?: string;
  cadastralRef?: string;
  microzoneId?: string;
  /** Covered city the parcel belongs to; a connector configured for another city must refuse, not answer. */
  cityId?: string;
};

export type ProtectionLevel = "none" | "D" | "C" | "B" | "A" | "BIC" | "unknown";

export interface PlanningInfo {
  planningInstrument: string;
  zoningCode: string;
  zoningLabel: string;
  maxFloors: number | null;
  groundFloorResidential: "allowed" | "conditioned" | "forbidden" | "unknown";
  allowedUses: string[];
  conditionedUses: string[];
  forbiddenUses: string[];
  protectionLevel: ProtectionLevel;
  heritageSector?: string;
  catalogued: boolean;
  inHistoricCentre: boolean;
  /** Municipal limit on tourist dwellings for the neighbourhood: measured by a source, or unknown. Never guessed. */
  touristSaturation?: "saturated" | "not_saturated" | "unknown";
  /** Neighbourhood the tourist limit refers to, as published. */
  neighbourhood?: string;
  /** Open municipal files known for the parcel (licences, orders). */
  knownFiles: Array<{ type: string; reference: string; status: string; date: string }>;
  notes: string[];
  status: EvidenceStatus;
  freshness?: string;
}
