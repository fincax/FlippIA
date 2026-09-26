import type { GeoLayerSource } from "../geoservices/types";

/**
 * Declarative description of a city's free public planning services. Every
 * layer is optional: the connector reports what it could not consult instead
 * of guessing. Field names are the attribute names of the published layer.
 */
export interface PlanningLayer<F extends string = string> {
  label: string;
  source: GeoLayerSource;
  fields: Partial<Record<F, string>>;
  /** Free text shown with the evidence (dataset title, licence, last known update). */
  note?: string;
}

export interface PublicPlanningConfig {
  /** Human name of the publisher, used in evidence. */
  publisher: string;
  publisherUrl: string;
  /** Last update of the datasets as far as we know (ISO date). */
  lastKnownUpdate?: string;
  /** Parcel layer: resolves a cadastral reference to a centroid when no coordinates are known. */
  parcel?: PlanningLayer<"cadastralRef">;
  /** Land classification (clasificación): urban consolidated, non-consolidated, developable… */
  classification?: PlanningLayer<"class" | "category" | "code">;
  /** Zoning / ordinance (calificación): ordinance code, label, max floors, use. */
  zoning?: PlanningLayer<"code" | "label" | "maxFloors" | "use" | "ordinance">;
  /** Heritage catalogue: protection level per building/parcel. */
  catalogue?: PlanningLayer<"level" | "sheet" | "name">;
  /** Historic centre (conjunto histórico) sectors. */
  historicCentre?: PlanningLayer<"sector" | "name">;
  /** Areas where tourist rental (VUT) is saturated or restricted. */
  touristSaturation?: PlanningLayer<"flag" | "district" | "name">;
  /** Development planning in process (planes especiales, modificaciones). */
  developmentPlanning?: PlanningLayer<"name" | "status" | "instrument" | "category">;
  /** Municipal files (licences, orders) keyed by cadastral reference, when published. */
  files?: PlanningLayer<"cadastralRef" | "type" | "reference" | "status" | "date">;
}

export type PlanningLayerRole = Exclude<
  keyof PublicPlanningConfig,
  "publisher" | "publisherUrl" | "lastKnownUpdate"
>;

export const PLANNING_LAYER_ROLES: PlanningLayerRole[] = [
  "parcel",
  "classification",
  "zoning",
  "catalogue",
  "historicCentre",
  "touristSaturation",
  "developmentPlanning",
  "files",
];

/**
 * Optional runtime override: `URBANISMO_PUBLIC_CONFIG` holds a JSON object with
 * the same shape as `PublicPlanningConfig`. Layers present in the override
 * replace the city defaults one by one; `null` removes a layer.
 */
export function mergePlanningConfig(
  base: PublicPlanningConfig,
  override: Partial<Record<keyof PublicPlanningConfig, unknown>> | null | undefined,
): PublicPlanningConfig {
  if (!override) return base;
  const out: PublicPlanningConfig = { ...base };
  for (const role of PLANNING_LAYER_ROLES) {
    if (!(role in override)) continue;
    const v = override[role];
    if (v === null) delete out[role];
    else if (v && typeof v === "object")
      (out as unknown as Record<string, unknown>)[role] = v as PlanningLayer;
  }
  if (typeof override.publisher === "string") out.publisher = override.publisher;
  if (typeof override.publisherUrl === "string") out.publisherUrl = override.publisherUrl;
  if (typeof override.lastKnownUpdate === "string") out.lastKnownUpdate = override.lastKnownUpdate;
  return out;
}

export function parsePlanningConfigOverride(raw: string | undefined): Partial<PublicPlanningConfig> | null {
  if (!raw || !raw.trim()) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("URBANISMO_PUBLIC_CONFIG must be a JSON object");
  return parsed as Partial<PublicPlanningConfig>;
}
