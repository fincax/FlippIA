import type { PropertyProfile } from "@/modules/analysis/types";
import {
  defaultCity,
  fallbackMicrozone,
  microzoneFromPoint,
  microzoneFromText,
  normalizeText,
} from "@/modules/city/registry";
import { municipalityFromText } from "@/modules/city/province";
import { notCoveredMessage } from "@/modules/analysis/errors";
import { newId } from "@/modules/core/ids";
import type { IntakeRequest } from "@/modules/property/intake";
import type { Property, PropertyTypology } from "@/modules/property/types";
import type { AgentContext, AgentDefinition } from "../runtime/types";

export interface IntakeResolution {
  intake: IntakeRequest;
  draft: Property;
  summary: string;
}

/**
 * Opportunity Orchestrator → Intake Agent. Turns the structured intake into a
 * property draft: city, microzone, typology and whatever the user told us.
 */
export function intakeAgent(intake: IntakeRequest): AgentDefinition<IntakeResolution> {
  return {
    type: "opportunity.intake",
    label: "Propiedad identificada",
    domain: "opportunity",
    description: "Convierte la petición en un activo investigable.",
    dependsOn: [],
    critical: true,
    async run(ctx: AgentContext) {
      const city = ctx.city ?? defaultCity();
      const p = intake.property ?? {};
      const text = [p.address, intake.rawText].filter(Boolean).join(" ");
      // Another municipality has its own planning, ordinances and taxes: refuse
      // rather than analyse it with the covered city's data.
      const municipality = p.municipality ?? municipalityFromText(text, city.name);
      if (municipality && normalizeText(municipality) !== normalizeText(city.name)) {
        ctx.progress(`${municipality} no está cubierto: FlippIA analiza hoy el municipio de ${city.name}.`);
        throw new Error(notCoveredMessage(municipality, city.name));
      }
      const zone =
        (p.coordinates && microzoneFromPoint(city, p.coordinates)) ||
        microzoneFromText(city, text) ||
        fallbackMicrozone(city);
      ctx.progress(`Zona: ${zone.name}`);
      const typology: PropertyTypology = p.typology ?? "flat";
      const assetUse =
        p.assetUse ??
        (typology === "premises" ? "commercial" : typology === "office" ? "office" : "residential");
      const now = new Date().toISOString();
      const draft: Property = {
        id: newId("prop"),
        cityId: city.id,
        microzoneId: zone.id,
        address: {
          raw: p.address ?? zone.name,
          neighborhood: zone.name,
          municipality: city.name,
          municipalityCode: city.municipalityCode,
        },
        cadastralRef: p.cadastralRef,
        coordinates: p.coordinates,
        assetUse,
        typology,
        builtAreaM2: p.areaM2 ?? 0,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        floor: p.floor,
        condition: p.condition ?? "unknown",
        askingPrice: intake.price,
        origin: { kind: p.url ? "listing" : "manual", reference: p.url },
        demo: false,
        evidenceIds: [],
        createdAt: now,
        updatedAt: now,
      };
      ctx.evidence.add({
        sourceType: "user_input",
        sourceId: "intake",
        sourceName: "Petición del usuario",
        sourceAuthority: "Usuario",
        geographicScope: { level: "point", label: draft.address.raw },
        excerpt: intake.rawText,
        structuredData: { ...p, price: intake.price },
        confidence: 0.7,
        verificationStatus: "INFERRED",
        demo: false,
      });
      return {
        intake,
        draft,
        summary: `${labelTypology(typology)} en ${zone.name}${intake.price ? ` por ${intake.price.toLocaleString("es-ES")} €` : ""}`,
      };
    },
  };
}

export function labelTypology(t: PropertyTypology): string {
  return {
    flat: "Piso",
    ground_floor_flat: "Bajo",
    penthouse: "Ático",
    house: "Casa",
    premises: "Local",
    office: "Oficina",
    building: "Edificio",
    plot: "Solar",
    warehouse: "Nave",
    garage: "Garaje",
    other: "Inmueble",
  }[t];
}

export const _propertyProfileType: PropertyProfile | null = null;
