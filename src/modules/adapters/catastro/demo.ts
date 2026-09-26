import { defaultCity, microzoneFromPoint, microzoneFromText, normalizeText } from "@/modules/city/registry";
import { ok } from "@/modules/core/result";
import type { NewEvidence } from "@/modules/evidence/store";
import { seededUnit, type AdapterResponse, type DataSourceAdapter } from "../types";
import { CATASTRO_USE_LABELS, type CatastroParcelInfo, type CatastroQuery } from "./types";

/**
 * DEMO Catastro adapter. Returns deterministic synthetic parcel data derived
 * from the query, so the same address always yields the same fixture. Every
 * record is labelled `demo: true` and the evidence says so.
 */
export class CatastroDemoAdapter implements DataSourceAdapter<CatastroQuery, CatastroParcelInfo> {
  sourceId = "catastro";
  sourceType = "demo" as const;
  sourceName = "Catastro (DEMO)";
  sourceAuthority = "Dirección General del Catastro — datos sintéticos de demostración";
  mode = "demo" as const;

  async isAvailable() {
    return true;
  }

  async query(input: CatastroQuery) {
    const seed = queryKey(input);
    const city = defaultCity();
    const text =
      input.kind === "address"
        ? `${input.street} ${input.number}`
        : input.kind === "cadastralRef"
          ? input.cadastralRef
          : `${input.point.lat},${input.point.lng}`;
    const zone =
      input.kind === "point"
        ? microzoneFromPoint(city, input.point)
        : (microzoneFromText(city, text) ??
          city.microzones[Math.floor(seededUnit(seed, "zone") * city.microzones.length)]);
    const useCode = pickUse(seed, input);
    const jitter = (salt: string, spread = 0.002) => (seededUnit(seed, salt) - 0.5) * 2 * spread;
    const coordinates =
      input.kind === "point"
        ? input.point
        : {
            lat: (zone?.centroid.lat ?? city.centroid.lat) + jitter("lat"),
            lng: (zone?.centroid.lng ?? city.centroid.lng) + jitter("lng", 0.003),
          };
    const builtArea = Math.round(60 + seededUnit(seed, "area") * 90);
    const yearBuilt = Math.round(
      zone?.historicCentre ? 1900 + seededUnit(seed, "year") * 70 : 1955 + seededUnit(seed, "year") * 55,
    );
    const ref = input.kind === "cadastralRef" ? input.cadastralRef.toUpperCase() : syntheticRef(seed);
    const address =
      input.kind === "address"
        ? `${input.streetType ?? "CL"} ${input.street.toUpperCase()} ${input.number}`
        : input.kind === "point"
          ? `${zone?.name ?? "Sevilla"} (punto)`
          : `REF ${ref}`;

    const data: CatastroParcelInfo = {
      cadastralRef: ref,
      address,
      municipality: "SEVILLA",
      province: "SEVILLA",
      coordinates,
      plotAreaM2:
        useCode === "V" && !zone?.historicCentre
          ? undefined
          : Math.round(120 + seededUnit(seed, "plot") * 300),
      builtAreaM2: builtArea,
      yearBuilt,
      useCode,
      useLabel: CATASTRO_USE_LABELS[useCode] ?? "Desconocido",
      units: [
        {
          cadastralRef: ref,
          address,
          useCode,
          useLabel: CATASTRO_USE_LABELS[useCode] ?? "Desconocido",
          builtAreaM2: builtArea,
          yearBuilt,
          floor:
            useCode === "C" ? "00" : String(Math.floor(seededUnit(seed, "floor") * 5) + 1).padStart(2, "0"),
        },
      ],
      cadastralValue: null,
      landValue: null,
      accessLevel: "public",
    };
    const retrievedAt = new Date().toISOString();
    const evidence: NewEvidence[] = [
      {
        sourceType: "demo",
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceAuthority: this.sourceAuthority,
        retrievedAt,
        geographicScope: { level: "parcel", code: ref, label: address },
        excerpt: `DEMO — Parcela sintética ${ref}: ${builtArea} m² construidos, uso ${data.useLabel}, año ${yearBuilt}.`,
        structuredData: { cadastralRef: ref, builtAreaM2: builtArea, yearBuilt, useCode },
        confidence: 0.3,
        verificationStatus: "INFERRED",
        demo: true,
      },
    ];
    const response: AdapterResponse<CatastroParcelInfo> = { data, evidence, retrievedAt, mode: "demo" };
    return ok(response);
  }
}

function queryKey(q: CatastroQuery): string {
  if (q.kind === "cadastralRef") return normalizeText(q.cadastralRef);
  if (q.kind === "address") return normalizeText(`${q.street} ${q.number}`);
  return `${q.point.lat.toFixed(4)},${q.point.lng.toFixed(4)}`;
}

function pickUse(seed: string, q: CatastroQuery): string {
  if (q.kind === "address" && /\blocal\b/i.test(q.street)) return "C";
  const u = seededUnit(seed, "use");
  return u < 0.9 ? "V" : u < 0.97 ? "C" : "O";
}

function syntheticRef(seed: string): string {
  const digits = (salt: string, n: number) =>
    String(Math.floor(seededUnit(seed, salt) * 10 ** n)).padStart(n, "0");
  return `${digits("a", 7)}TG${digits("b", 4)}S${digits("c", 4)}XX`;
}
