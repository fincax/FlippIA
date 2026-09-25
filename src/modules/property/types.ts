import type { LatLng } from "@/modules/city/types";
import type { AssetUse } from "@/modules/engines/financial/types";

export type PropertyTypology =
  | "flat"
  | "ground_floor_flat"
  | "penthouse"
  | "house"
  | "premises" // local comercial
  | "office"
  | "building"
  | "plot"
  | "warehouse"
  | "garage"
  | "other";

export type PropertyCondition = "new" | "renovated" | "good" | "to_renovate" | "to_rebuild" | "unknown";

export interface PropertyAddress {
  raw: string;
  street?: string;
  number?: string;
  floor?: string;
  door?: string;
  postalCode?: string;
  neighborhood?: string;
  municipality: string;
  municipalityCode?: string;
}

export interface Property {
  id: string;
  cityId: string;
  microzoneId?: string;
  address: PropertyAddress;
  cadastralRef?: string;
  coordinates?: LatLng;
  assetUse: AssetUse;
  typology: PropertyTypology;
  builtAreaM2: number;
  usefulAreaM2?: number;
  plotAreaM2?: number;
  yearBuilt?: number;
  floor?: number;
  elevator?: boolean;
  exterior?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  condition: PropertyCondition;
  askingPrice?: number;
  description?: string;
  /** Origin of the record: intake text, listing url, partner feed, etc. */
  origin: { kind: "manual" | "listing" | "partner" | "csv" | "document" | "demo"; reference?: string };
  demo: boolean;
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}
