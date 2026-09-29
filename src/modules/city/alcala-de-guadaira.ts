import { JURISDICTIONS } from "@/modules/regulatory/registry";
import { provinceCity } from "./province-city";

/** Alcalá de Guadaíra (INE 41004). Planning source not configured: see docs/REGULATORY_ENGINE.md. */
export const ALCALA_DE_GUADAIRA = provinceCity({
  id: "alcala-de-guadaira",
  name: "Alcalá de Guadaíra",
  jurisdiction: JURISDICTIONS.ALCALA_DE_GUADAIRA,
  cadastreName: "ALCALA DE GUADAIRA",
  centroid: { lat: 37.3382, lng: -5.8395 },
  bbox: [-5.94, 37.27, -5.74, 37.42],
  authority: "Ayuntamiento de Alcalá de Guadaíra",
  authorityUrl: "https://www.ciudadalcala.org/",
  planningInstrument: "PGOU de Alcalá de Guadaíra (no consultado: sin geoservicio público configurado)",
  microzones: [
    {
      id: "ag-centro",
      name: "Alcalá de Guadaíra centro",
      district: "Centro",
      centroid: { lat: 37.3382, lng: -5.8395 },
      radiusM: 1_000,
      aliases: [
        "alcala de guadaira centro",
        "alcalá de guadaíra centro",
        "centro de alcala",
        "plaza del duque",
      ],
      demo: [2000, 1400, 1200, 8, 8, 85],
    },
    {
      id: "ag-norte",
      name: "Alcalá de Guadaíra norte",
      district: "Norte",
      centroid: { lat: 37.352, lng: -5.85 },
      radiusM: 1_400,
      aliases: ["alcala norte", "alcalá norte"],
      demo: [2100, 1500, 1200, 8, 8, 85],
    },
    {
      id: "ag-sur",
      name: "Alcalá de Guadaíra sur",
      district: "Sur",
      centroid: { lat: 37.322, lng: -5.835 },
      radiusM: 1_400,
      aliases: ["alcala sur", "alcalá sur"],
      demo: [2000, 1400, 1150, 8, 7, 90],
    },
  ],
});
