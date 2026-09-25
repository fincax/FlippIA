import type { Jurisdiction } from "@/modules/regulatory/types";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MicrozoneDemoMarket {
  residentialRenovatedPerM2: number;
  residentialUnrenovatedPerM2: number;
  commercialPerM2: number;
  rentResidentialPerM2Month: number;
  rentCommercialPerM2Month: number;
  daysToSell: number;
  liquidity: "high" | "medium" | "low";
  demand: "high" | "medium" | "low";
  sampleSize: number;
}

export interface Microzone {
  id: string;
  name: string;
  district: string;
  centroid: LatLng;
  radiusM: number;
  /** Keywords used to map addresses/free text to the zone. */
  aliases: string[];
  historicCentre: boolean;
  /** DEMO statistics, clearly labelled. Real City Brain data replaces this table. */
  demoMarket: MicrozoneDemoMarket;
  /** Planning ordinance code used by the demo urbanism adapter. */
  demoZoning: string;
}

export interface CityUrbanismProfile {
  planningInstrument: string;
  planningRegulationId: string;
  authority: string;
  authorityUrl: string;
  /** Zoning ordinance code → human label + parameters. */
  zoningCatalogue: Record<string, { label: string; maxFloors: number; groundFloorResidential: "allowed" | "conditioned" | "forbidden"; notes: string }>;
}

export interface CityProfile {
  id: string;
  name: string;
  country: string;
  region: string;
  province: string;
  municipalityCode: string; // INE
  locale: "es-ES" | "en-GB";
  currency: string;
  timezone: string;
  unitSystem: "metric";
  centroid: LatLng;
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
  taxJurisdiction: { country: string; region: string; municipalityCode: string };
  regulatoryChain: Jurisdiction[];
  urbanism: CityUrbanismProfile;
  microzones: Microzone[];
  adapters: { catastro: string; urbanism: string; market: string; financing: string };
  demo: boolean;
}
