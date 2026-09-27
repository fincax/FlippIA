import type {
  ArchitectureAlternative,
  ArchitectureAssessment,
  MarketAssessment,
  PropertyProfile,
  UrbanismAssessment,
} from "@/modules/analysis/types";
import { buildConfidence } from "@/modules/core/evidence-status";
import { estimateRenovation, type RenovationLevel } from "@/modules/engines/construction";
import type { AgentDefinition } from "../runtime/types";
import { optionalOutput, output } from "../runtime/types";

interface Program {
  areaM2: number;
  bedrooms: number;
  bathrooms: number;
  units: number;
}

/** Architecture Orchestrator → Existing Layout / Surface Agent. */
export const existingLayoutAgent: AgentDefinition<{
  current: ArchitectureAssessment["current"];
  summary: string;
}> = {
  type: "architecture.existing",
  label: "Programa actual estimado",
  domain: "architecture",
  description: "Estima el programa actual (superficie, dormitorios, baños) a partir de datos y tipología.",
  dependsOn: ["data.catastro"],
  async run(ctx) {
    const { property } = output<PropertyProfile>(ctx, "data.catastro");
    const current = estimateCurrentProgram(property);
    return {
      current,
      summary: `${current.areaM2} m², ${current.bedrooms} dorm., ${current.bathrooms} baño(s)`,
    };
  },
};

/**
 * Alternatives of programme for an asset, with parametric cost and value
 * impact. Pure and deterministic: the Architecture agent calls it with the
 * assessments of a full analysis; the Radar's quick pass calls it with the
 * microzone-based context so both speak the same alternatives.
 */
export function buildArchitectureAlternatives(input: {
  property: PropertyProfile["property"];
  current: ArchitectureAssessment["current"];
  urbanism?: Pick<UrbanismAssessment, "planning">;
  analysisDate: string;
}): ArchitectureAlternative[] {
  const { property, current, urbanism } = input;
  const heavy = urbanism?.planning.protectionLevel === "A" || urbanism?.planning.protectionLevel === "B";
  const now = new Date(input.analysisDate);
  const alts: ArchitectureAlternative[] = [];
  const est = (
    level: RenovationLevel,
    program: Program,
    scope?: Parameters<typeof estimateRenovation>[0]["scope"],
  ) =>
    estimateRenovation({
      areaM2: program.areaM2,
      level,
      bathrooms: program.bathrooms,
      bedrooms: program.bedrooms,
      scope,
      now,
    });

  if (property.assetUse === "residential") {
    const p: Program = {
      areaM2: current.areaM2,
      bedrooms: current.bedrooms,
      bathrooms: current.bathrooms,
      units: 1,
    };
    if (property.condition !== "renovated" && property.condition !== "new") {
      alts.push({
        id: "integral",
        label: "Reforma integral manteniendo programa",
        description: "Instalaciones nuevas, acabados, cocina y baños; misma distribución.",
        program: p,
        renovationLevel: "integral",
        estimate: est("integral", p),
        valueUplift: 0,
        feasibility: "feasible",
        requiredChecks: [],
        notes: ["Declaración responsable si no afecta a estructura."],
      });
      alts.push({
        id: "cosmetic",
        label: "Actualización estética",
        description: "Pintura, suelos parciales, pequeños arreglos.",
        program: p,
        renovationLevel: "cosmetic",
        estimate: est("cosmetic", p),
        valueUplift: 0,
        feasibility: "feasible",
        requiredChecks: [],
        notes: [],
      });
    }
    const canAddRoom = current.areaM2 / (current.bedrooms + 1) >= 24 && current.areaM2 >= 70;
    if (canAddRoom) {
      const p2: Program = {
        ...p,
        bedrooms: current.bedrooms + 1,
        bathrooms: Math.max(p.bathrooms, current.areaM2 > 85 ? 2 : 1),
      };
      alts.push({
        id: "redistribution",
        label: `Redistribución a ${p2.bedrooms} dormitorios`,
        description: `Reorganizar la planta para ganar un dormitorio${p2.bathrooms > p.bathrooms ? " y un segundo baño" : ""}, con cocina abierta al salón.`,
        program: p2,
        renovationLevel: "integral",
        estimate: est("integral", p2),
        valueUplift: 0.04,
        feasibility: heavy ? "conditional" : "feasible",
        requiredChecks: [
          {
            key: "layout_review",
            label: "Revisión de distribución por arquitecto (ventilación e iluminación de cada dormitorio)",
            why: "Cada dormitorio necesita hueco a fachada o patio conforme a habitabilidad.",
            who: "architect",
            blocking: false,
            topic: "habitability",
          },
        ],
        notes: ["Prima de valor del 4 % por programa más demandado (hipótesis)."],
      });
    }
    if (current.areaM2 >= 120) {
      const half = Math.round(current.areaM2 / 2);
      const pu: Program = {
        areaM2: half,
        bedrooms: Math.max(1, Math.round(half / 32)),
        bathrooms: 1,
        units: 2,
      };
      const single = est("integral", pu);
      const combined = {
        ...single,
        lines: [...single.lines, ...single.lines],
        materialBudget: single.materialBudget * 2 * 1.08,
        overhead: single.overhead * 2 * 1.08,
        contractBudget: Math.round(single.contractBudget * 2 * 1.08),
        costPerM2: Math.round((single.contractBudget * 2 * 1.08) / current.areaM2),
        notes: [
          ...single.notes,
          "Dos unidades: coste ×2 con 8 % de sobrecoste por duplicidad de accesos e instalaciones.",
        ],
      };
      alts.push({
        id: "subdivision",
        label: "División en dos viviendas",
        description: `Dos unidades de ~${half} m² con accesos independientes.`,
        program: { areaM2: current.areaM2, bedrooms: pu.bedrooms * 2, bathrooms: 2, units: 2 },
        renovationLevel: "integral",
        estimate: combined,
        valueUplift: 0.06,
        feasibility: "conditional",
        requiredChecks: [
          {
            key: "min_dwelling_area",
            label: "Superficie mínima y habitabilidad por unidad",
            why: "PGOU y normativa de habitabilidad.",
            who: "architect",
            blocking: true,
            topic: "habitability",
          },
        ],
        notes: ["Prima del 6 % por menor tamaño unitario (hipótesis)."],
      });
    }
  } else {
    const p: Program = {
      areaM2: current.areaM2,
      bedrooms: Math.max(1, Math.round(current.areaM2 / 35)),
      bathrooms: current.areaM2 > 80 ? 2 : 1,
      units: 1,
    };
    alts.push({
      id: "change_of_use",
      label: "Conversión a vivienda",
      description: `Vivienda de ${p.bedrooms} dormitorios en planta baja con patio o ventilación cruzada.`,
      program: p,
      renovationLevel: "change_of_use",
      estimate: est("change_of_use", p, { accessibility: true }),
      valueUplift: 0,
      feasibility: urbanism?.planning.groundFloorResidential === "forbidden" ? "unlikely" : "conditional",
      requiredChecks: [
        {
          key: "habitability",
          label: "Altura libre, ventilación e iluminación",
          why: "Requisitos de habitabilidad para uso residencial.",
          who: "architect",
          blocking: true,
          topic: "habitability",
        },
      ],
      notes: ["Incluye adaptación de accesibilidad e instalaciones completas."],
    });
    alts.push({
      id: "commercial_reposition",
      label: "Reposicionamiento comercial",
      description: "Adecuación del local (instalaciones, PCI, accesibilidad) para alquiler a operador.",
      program: p,
      renovationLevel: "medium",
      estimate: est("medium", { ...p, bedrooms: 0 }, { fireSafety: true, accessibility: true }),
      valueUplift: 0,
      feasibility: "feasible",
      requiredChecks: [],
      notes: ["Licencia de actividad a cargo del operador según uso."],
    });
  }
  return alts;
}

/** Current programme (surface, bedrooms, bathrooms) estimated from data and typology. Pure. */
export function estimateCurrentProgram(
  property: PropertyProfile["property"],
): ArchitectureAssessment["current"] {
  const area = property.builtAreaM2;
  const bedrooms =
    property.bedrooms ?? (property.assetUse === "residential" ? Math.max(1, Math.round(area / 30)) : 0);
  const bathrooms = property.bathrooms ?? (property.assetUse === "residential" ? (area > 95 ? 2 : 1) : 1);
  return { areaM2: area, bedrooms, bathrooms, units: 1, condition: property.condition };
}

/** Architecture Orchestrator → Program Optimization / Subdivision / Change-of-Use / Cost Impact agents (combined pass). */
export const alternativesAgent: AgentDefinition<ArchitectureAssessment> = {
  type: "architecture.alternatives",
  label: "Arquitectura evaluando alternativas",
  domain: "architecture",
  description: "Genera alternativas de programa con estimación de coste e impacto en valor.",
  dependsOn: ["architecture.existing", "market.valuation", "urbanism.synthesis"],
  async run(ctx) {
    const { property } = output<PropertyProfile>(ctx, "data.catastro");
    const { current } = output<{ current: ArchitectureAssessment["current"] }>(ctx, "architecture.existing");
    const market = output<MarketAssessment>(ctx, "market.valuation");
    const urbanism = optionalOutput<UrbanismAssessment>(ctx, "urbanism.synthesis");
    const alts = buildArchitectureAlternatives({
      property,
      current,
      urbanism,
      analysisDate: ctx.analysisDate,
    });
    const confidence = buildConfidence(
      [
        {
          key: "sourceQuality",
          weight: 2,
          score: 0.4,
          note: "Sin planos: programa estimado por superficie y tipología.",
        },
        { key: "verification", weight: 3, score: 0.15, note: "Sin visita ni revisión de arquitecto." },
        {
          key: "consistency",
          weight: 1,
          score: market.confidence.score,
          note: "Impacto en valor ligado a la confianza de mercado.",
        },
      ],
      "Confianza de las alternativas arquitectónicas.",
    );
    ctx.progress(`${alts.length} alternativas de programa`);
    return {
      current,
      alternatives: alts,
      status: "REVIEW_REQUIRED",
      confidence,
      summary: alts
        .map((a) => `${a.label} (~${Math.round(a.estimate.contractBudget).toLocaleString("es-ES")} €)`)
        .join("; "),
    };
  },
};
