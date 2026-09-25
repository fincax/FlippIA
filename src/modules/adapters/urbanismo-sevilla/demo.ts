import { defaultCity, microzoneFromPoint, microzoneFromText } from "@/modules/city/registry";
import { ok } from "@/modules/core/result";
import type { NewEvidence } from "@/modules/evidence/store";
import { seededUnit, type AdapterResponse, type DataSourceAdapter } from "../types";
import type { PlanningInfo, ProtectionLevel, UrbanismQuery } from "./types";

/**
 * DEMO adapter for Sevilla planning data. Uses the city profile's zoning
 * catalogue and deterministic synthetic protection levels for the historic
 * centre. The official connector (`UrbanismoSevillaOfficialConnector`)
 * replaces it without touching the orchestration or the UI.
 */
export class UrbanismoSevillaDemoAdapter implements DataSourceAdapter<UrbanismQuery, PlanningInfo> {
  sourceId = "urbanismo-sevilla";
  sourceType = "demo" as const;
  sourceName = "Urbanismo Sevilla (DEMO)";
  sourceAuthority = "Gerencia de Urbanismo y Medio Ambiente de Sevilla — datos sintéticos de demostración";
  mode = "demo" as const;

  async isAvailable() {
    return true;
  }

  async query(input: UrbanismQuery) {
    const city = defaultCity();
    const zone = (input.microzoneId && city.microzones.find((m) => m.id === input.microzoneId)) || (input.point && microzoneFromPoint(city, input.point)) || (input.address && microzoneFromText(city, input.address)) || city.microzones[1]!;
    const seed = input.cadastralRef ?? input.address ?? (input.point ? `${input.point.lat},${input.point.lng}` : zone.id);
    const zoning = city.urbanism.zoningCatalogue[zone.demoZoning] ?? city.urbanism.zoningCatalogue.MC!;
    const protection: ProtectionLevel = zone.historicCentre ? pickProtection(seededUnit(seed, "prot")) : "none";
    const allowed = ["Residencial (plurifamiliar)", "Terciario: oficinas", "Terciario: comercio en planta baja"];
    const conditioned: string[] = [];
    const forbidden: string[] = ["Industrial"];
    if (zoning.groundFloorResidential === "conditioned") conditioned.push("Residencial en planta baja (condiciones de habitabilidad, patio y acceso)");
    if (zoning.groundFloorResidential === "forbidden") forbidden.push("Residencial en planta baja");
    if (zone.historicCentre) conditioned.push("Vivienda de uso turístico (saturación por barrio y autorización de comunidad)");
    else conditioned.push("Vivienda de uso turístico (regulación municipal en tramitación)");
    const knownFiles = seededUnit(seed, "file") > 0.7 ? [{ type: "Licencia de obras", reference: `DEMO-${Math.floor(seededUnit(seed, "fileno") * 90000 + 10000)}`, status: "Concedida", date: `20${Math.floor(15 + seededUnit(seed, "fy") * 10)}-0${Math.floor(1 + seededUnit(seed, "fm") * 8)}-1${Math.floor(seededUnit(seed, "fd") * 9)}` }] : [];
    const data: PlanningInfo = {
      planningInstrument: city.urbanism.planningInstrument,
      zoningCode: zone.demoZoning,
      zoningLabel: zoning.label,
      maxFloors: zoning.maxFloors,
      groundFloorResidential: zoning.groundFloorResidential,
      allowedUses: allowed,
      conditionedUses: conditioned,
      forbiddenUses: forbidden,
      protectionLevel: protection,
      heritageSector: zone.historicCentre ? `Sector ${zone.name} del Conjunto Histórico` : undefined,
      catalogued: protection !== "none",
      inHistoricCentre: zone.historicCentre,
      knownFiles,
      notes: [zoning.notes, "DEMO: la calificación y el nivel de protección son sintéticos; deben verificarse en la Gerencia de Urbanismo o en IDE Sevilla."],
      status: "INFERRED",
      freshness: "2026-01-10",
    };
    const retrievedAt = new Date().toISOString();
    const evidence: NewEvidence[] = [
      {
        sourceType: "demo",
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        sourceAuthority: this.sourceAuthority,
        sourceUrl: city.urbanism.authorityUrl,
        retrievedAt,
        sourcePublishedAt: "2026-01-10",
        geographicScope: { level: "parcel", label: `${zone.name} — ${input.address ?? input.cadastralRef ?? "punto"}` },
        excerpt: `DEMO — Zona de ordenanza ${zone.demoZoning} (${zoning.label}); protección ${protection}; residencial en planta baja: ${zoning.groundFloorResidential}.`,
        structuredData: { zoningCode: zone.demoZoning, protectionLevel: protection, maxFloors: zoning.maxFloors, groundFloorResidential: zoning.groundFloorResidential },
        confidence: 0.35,
        verificationStatus: "INFERRED",
        demo: true,
      },
    ];
    const response: AdapterResponse<PlanningInfo> = { data, evidence, retrievedAt, freshness: "2026-01-10", mode: "demo" };
    return ok(response);
  }
}

function pickProtection(u: number): ProtectionLevel {
  if (u < 0.45) return "none";
  if (u < 0.7) return "D";
  if (u < 0.88) return "C";
  if (u < 0.97) return "B";
  return "A";
}
