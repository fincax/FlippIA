import type { LatLng } from "@/modules/city/types";

/**
 * Where the asset was resolved to, for the live analysis stream. Extracted
 * from the data agent's output so the UI can aim at the real microzone
 * without receiving the whole partial result.
 */
export interface AssetLocation {
  microzoneId: string;
  microzoneName: string;
  coordinates?: LatLng;
  cadastralRef?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isLatLng(v: unknown): v is LatLng {
  return isRecord(v) && typeof v.lat === "number" && typeof v.lng === "number";
}

/** Reads an `AssetLocation` from a `data.catastro` partial output; `null` when the shape is not a PropertyProfile. */
export function assetLocation(partial: unknown): AssetLocation | null {
  if (!isRecord(partial) || !isRecord(partial.microzone) || !isRecord(partial.property)) return null;
  const { microzone, property } = partial;
  if (typeof microzone.id !== "string" || typeof microzone.name !== "string") return null;
  return {
    microzoneId: microzone.id,
    microzoneName: microzone.name,
    ...(isLatLng(property.coordinates) ? { coordinates: property.coordinates } : {}),
    ...(typeof property.cadastralRef === "string" ? { cadastralRef: property.cadastralRef } : {}),
  };
}

/** Evidence that supports the investment thesis: what the asset, market and planning agents retrieved. */
export function thesisEvidenceIds(
  runs: Array<{ agentType: string; domain: string; evidenceIds: string[] }>,
): string[] {
  const ids = new Set<string>();
  for (const r of runs) {
    if (r.agentType === "data.catastro" || r.agentType === "urbanism.planning" || r.domain === "market")
      for (const id of r.evidenceIds) ids.add(id);
  }
  return [...ids];
}
