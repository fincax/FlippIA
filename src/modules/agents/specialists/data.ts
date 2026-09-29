import type { CityProfile } from "@/modules/city/types";

/** Province and municipality as the Catastro spells them for the city under analysis. */
function cadastreNames(city: CityProfile): { province: string; municipality: string } {
  return city.cadastre ?? { province: city.name.toUpperCase(), municipality: city.name.toUpperCase() };
}

import type { PropertyProfile } from "@/modules/analysis/types";
import type { CatastroQuery } from "@/modules/adapters/catastro/types";
import { fallbackMicrozone, haversineM, microzoneFromPoint, normalizeText } from "@/modules/city/registry";
import { notCoveredMessage } from "@/modules/analysis/errors";
import type { AgentDefinition } from "../runtime/types";
import { output } from "../runtime/types";
import type { IntakeResolution } from "./opportunity";
import { labelTypology } from "./opportunity";

/**
 * Data Orchestrator → Catastro Agent. Enriches the draft with public
 * cadastral data (area, year, use). Never blocks: if the source is down the
 * analysis continues with user data and an UNKNOWN status.
 */
export const catastroAgent: AgentDefinition<PropertyProfile> = {
  type: "data.catastro",
  label: "Datos catastrales consultados",
  domain: "data",
  description: "Consulta el Catastro (modo configurado) y consolida el perfil del activo.",
  dependsOn: ["opportunity.intake"],
  critical: true,
  /** Public sources chain several OVC calls (address → numerero → units → coordinates). */
  timeoutMs: 40_000,
  async run(ctx) {
    const { draft, intake } = output<IntakeResolution>(ctx, "opportunity.intake");
    const q: CatastroQuery | null = draft.cadastralRef
      ? {
          kind: "cadastralRef",
          cadastralRef: draft.cadastralRef,
          ...cadastreNames(ctx.city),
        }
      : draft.coordinates
        ? { kind: "point", point: draft.coordinates }
        : draft.address.raw
          ? {
              kind: "address",
              ...cadastreNames(ctx.city),
              street:
                draft.address.raw
                  .replace(/\d.*$/, "")
                  .replace(/^(calle|c\/|avenida|avda\.?|plaza)\s+/i, "")
                  .trim() || draft.address.raw,
              number: draft.address.raw.match(/\d{1,4}/)?.[0] ?? "1",
            }
          : null;
    const property = { ...draft };
    let cadastral: PropertyProfile["cadastral"] = { found: false, mode: ctx.adapters.catastro.mode };
    if (q) {
      const res = await ctx.tool("catastro.query", { kind: q.kind }, () => ctx.adapters.catastro.query(q));
      if (res.ok) {
        const d = res.value.data;
        // A point or a cadastral reference can resolve to a parcel outside the covered
        // municipality: stop here instead of applying the city's planning to it.
        if (
          res.value.mode !== "demo" &&
          d.municipality &&
          normalizeText(d.municipality) !== normalizeText(cadastreNames(ctx.city).municipality)
        )
          throw new Error(notCoveredMessage(d.municipality, ctx.city.name));
        const evs = ctx.evidence.addMany(res.value.evidence);
        property.evidenceIds.push(...evs.map((e) => e.id));
        cadastral = {
          found: true,
          cadastralRef: d.cadastralRef,
          builtAreaM2: d.builtAreaM2,
          yearBuilt: d.yearBuilt,
          useLabel: d.useLabel,
          accessLevel: d.accessLevel,
          mode: res.value.mode,
        };
        property.cadastralRef = d.cadastralRef;
        if (!property.builtAreaM2 && d.builtAreaM2) property.builtAreaM2 = d.builtAreaM2;
        if (!property.yearBuilt && d.yearBuilt) property.yearBuilt = d.yearBuilt;
        if (!property.coordinates && d.coordinates) property.coordinates = d.coordinates;
        const residentialHints = Boolean(
          intake.property?.typology ||
          intake.property?.bedrooms ||
          intake.property?.floor ||
          /\b(piso|vivienda|habitaci|dormitori|ático|atico|casa)\b/i.test(intake.rawText),
        );
        if (d.useCode === "C" && property.typology === "flat" && !residentialHints) {
          property.typology = "premises";
          property.assetUse = "commercial";
        }
        property.demo = res.value.mode === "demo" || property.demo;
        ctx.progress(`Catastro (${res.value.mode}): ${d.builtAreaM2 ?? "?"} m², ${d.yearBuilt ?? "año n/d"}`);
      } else {
        ctx.progress(`Catastro no disponible: ${res.error.message}`);
      }
    }
    if (!property.builtAreaM2) property.builtAreaM2 = property.typology === "premises" ? 80 : 90;
    // Microzone: by coordinates when the parcel is known, else the zone the text
    // named, else the city centre as an explicitly labelled fallback. How it was
    // matched travels with the profile so every zone reference can say so.
    const byPoint = property.coordinates && microzoneFromPoint(ctx.city, property.coordinates);
    const byText = ctx.city.microzones.find((m) => m.id === property.microzoneId);
    const microzone = byPoint || byText || fallbackMicrozone(ctx.city);
    const microzoneDistanceM =
      byPoint && property.coordinates
        ? Math.round(haversineM(byPoint.centroid, property.coordinates))
        : undefined;
    const microzoneMatch: PropertyProfile["microzoneMatch"] = byPoint
      ? microzoneDistanceM !== undefined && microzoneDistanceM <= byPoint.radiusM * 1.5
        ? "inside"
        : "nearest"
      : byText
        ? "text"
        : "default";
    property.microzoneId = microzone.id;
    const zoneNote =
      microzoneMatch === "nearest"
        ? ` Microzona asignada por proximidad (a ${microzoneDistanceM} m del centro de ${microzone.name}): las referencias de zona son orientativas.`
        : microzoneMatch === "default"
          ? ` Microzona no determinada: se usa ${microzone.name} como referencia orientativa.`
          : "";
    if (property.condition === "unknown")
      property.condition = property.yearBuilt && property.yearBuilt < 1990 ? "to_renovate" : "good";
    const askingPrice = property.askingPrice ?? 0;
    return {
      property,
      microzone,
      microzoneMatch,
      microzoneDistanceM,
      cadastral,
      askingPrice,
      askingPriceSource: property.askingPrice
        ? property.origin.kind === "listing"
          ? "listing"
          : "user"
        : "estimated",
      summary: `${labelTypology(property.typology)} de ${property.builtAreaM2} m² en ${microzone.name}${property.yearBuilt ? ` (${property.yearBuilt})` : ""}, estado: ${property.condition}.${zoneNote}`,
    };
  },
};
