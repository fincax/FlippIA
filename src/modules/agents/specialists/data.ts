import type { PropertyProfile } from "@/modules/analysis/types";
import type { CatastroQuery } from "@/modules/adapters/catastro/types";
import { microzoneFromPoint } from "@/modules/city/registry";
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
          municipality: "SEVILLA",
          province: "SEVILLA",
        }
      : draft.coordinates
        ? { kind: "point", point: draft.coordinates }
        : draft.address.raw
          ? {
              kind: "address",
              municipality: "SEVILLA",
              province: "SEVILLA",
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
    const microzone =
      (property.coordinates && microzoneFromPoint(ctx.city, property.coordinates)) ||
      ctx.city.microzones.find((m) => m.id === property.microzoneId) ||
      ctx.city.microzones[1]!;
    property.microzoneId = microzone.id;
    if (property.condition === "unknown")
      property.condition = property.yearBuilt && property.yearBuilt < 1990 ? "to_renovate" : "good";
    const askingPrice = property.askingPrice ?? 0;
    return {
      property,
      microzone,
      cadastral,
      askingPrice,
      askingPriceSource: property.askingPrice
        ? property.origin.kind === "listing"
          ? "listing"
          : "user"
        : "estimated",
      summary: `${labelTypology(property.typology)} de ${property.builtAreaM2} m² en ${microzone.name}${property.yearBuilt ? ` (${property.yearBuilt})` : ""}, estado: ${property.condition}.`,
    };
  },
};
