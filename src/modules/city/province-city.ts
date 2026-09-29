import { JURISDICTIONS } from "@/modules/regulatory/registry";
import type { Jurisdiction } from "@/modules/regulatory/types";
import type { CityProfile, LatLng, Microzone } from "./types";

/**
 * Profile of a municipality of the province of Sevilla covered without its
 * own public planning geoservice yet. Everything that has a real source
 * (Catastro OVC by municipality name, regional and state regulation, market
 * providers by coordinates) works; planning, catalogue and municipal
 * ordinances are declared as not consulted, never copied from Sevilla.
 * Microzone statistics are DEMO placeholders, labelled as such.
 */
export interface ProvinceCityInput {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  /** Municipality as the Catastro spells it (uppercase, no accents). */
  cadastreName: string;
  centroid: LatLng;
  bbox: CityProfile["bbox"];
  authority: string;
  authorityUrl: string;
  planningInstrument: string;
  microzones: Array<{
    id: string;
    name: string;
    district: string;
    centroid: LatLng;
    radiusM: number;
    aliases: string[];
    demo: [number, number, number, number, number, number];
  }>;
}

export function provinceCity(input: ProvinceCityInput): CityProfile {
  const microzones: Microzone[] = input.microzones.map((z) => ({
    id: z.id,
    name: z.name,
    district: z.district,
    centroid: z.centroid,
    radiusM: z.radiusM,
    aliases: z.aliases,
    historicCentre: false,
    demoMarket: {
      residentialRenovatedPerM2: z.demo[0],
      residentialUnrenovatedPerM2: z.demo[1],
      commercialPerM2: z.demo[2],
      rentResidentialPerM2Month: z.demo[3],
      rentCommercialPerM2Month: z.demo[4],
      daysToSell: z.demo[5],
      liquidity: "medium",
      demand: "medium",
      sampleSize: 0,
    },
    demoZoning: "DEMO",
  }));
  return {
    id: input.id,
    name: input.name,
    country: "ES",
    region: "ES-AN",
    province: "ES-SE",
    cadastre: { province: "SEVILLA", municipality: input.cadastreName },
    municipalityCode: input.jurisdiction.code,
    locale: "es-ES",
    currency: "EUR",
    timezone: "Europe/Madrid",
    unitSystem: "metric",
    centroid: input.centroid,
    bbox: input.bbox,
    taxJurisdiction: { country: "ES", region: "AND", municipalityCode: input.jurisdiction.code },
    regulatoryChain: [
      JURISDICTIONS.EU,
      JURISDICTIONS.ES,
      JURISDICTIONS.AND,
      JURISDICTIONS.SE_PROV,
      input.jurisdiction,
    ],
    urbanism: {
      planningInstrument: input.planningInstrument,
      // No entry of the regulatory registry cites this municipality's plan yet.
      planningRegulationId: "",
      authority: input.authority,
      authorityUrl: input.authorityUrl,
      zoningCatalogue: {
        DEMO: {
          label: "Zona de ordenanza no consultada (DEMO)",
          maxFloors: 3,
          groundFloorResidential: "conditioned",
          notes: `DEMO: ${input.name} no tiene geoservicio de planeamiento configurado; calificación, altura y protección son sintéticas y deben consultarse en ${input.authority}.`,
        },
      },
      // publicSources deliberately absent: the public urbanism mode reports "not configured".
    },
    microzones,
    adapters: {
      catastro: "catastro",
      urbanism: "urbanismo-sevilla",
      market: "market-demo",
      financing: "financing-demo",
    },
    demo: true,
  };
}
