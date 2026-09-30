import { JURISDICTIONS } from "@/modules/regulatory/registry";
import { provinceCity } from "./province-city";

/** Dos Hermanas (INE 41038). Planning source not configured: see docs/REGULATORY_ENGINE.md. */
export const DOS_HERMANAS = provinceCity({
  id: "dos-hermanas",
  name: "Dos Hermanas",
  jurisdiction: JURISDICTIONS.DOS_HERMANAS,
  cadastreName: "DOS HERMANAS",
  centroid: { lat: 37.2836, lng: -5.9227 },
  bbox: [-6.03, 37.2, -5.85, 37.36],
  authority: "Ayuntamiento de Dos Hermanas",
  authorityUrl: "https://www.doshermanas.es/",
  planningInstrument:
    "PGOU de Dos Hermanas 2002, adaptado a la LOUA en 2008 (sin geoservicio público: calificación no consultada)",
  planningRegulationId: "reg.es.doshermanas.pgou-2002",
  microzones: [
    {
      id: "dh-centro",
      name: "Dos Hermanas centro",
      district: "Centro",
      centroid: { lat: 37.2836, lng: -5.9227 },
      radiusM: 1_100,
      aliases: ["dos hermanas centro", "centro de dos hermanas", "la motilla"],
      demo: [2300, 1650, 1300, 9, 8, 80],
    },
    {
      id: "dh-montequinto",
      name: "Montequinto",
      district: "Montequinto",
      centroid: { lat: 37.3335, lng: -5.9265 },
      radiusM: 1_300,
      aliases: ["montequinto", "olivar de quinto", "condequinto"],
      demo: [2500, 1800, 1400, 10, 9, 70],
    },
    {
      id: "dh-entrenucleos",
      name: "Entrenúcleos",
      district: "Entrenúcleos",
      centroid: { lat: 37.31, lng: -5.94 },
      radiusM: 1_300,
      aliases: ["entrenucleos", "entrenúcleos"],
      demo: [2600, 2000, 1400, 10, 9, 75],
    },
  ],
});
