/**
 * Human labels for domain enums. Client-safe leaf module: no engines, no
 * prompts, no server code. Fall back to the raw value when a label is missing.
 */
import type { AcquisitionConstraints } from "@/modules/engines/financial/max-price";

const pick = (map: Record<string, string>) => (value: string | null | undefined) =>
  value ? (map[value] ?? value) : "";

export const labelRisk = pick({ low: "bajo", medium: "medio", high: "alto", critical: "crítico" });
export const labelSeverity = pick({
  low: "baja",
  medium: "media",
  high: "alta",
  critical: "crítica",
  info: "informativa",
  opportunity: "oportunidad",
  risk: "riesgo",
});
export const labelDealStatus = pick({
  draft: "Borrador",
  analyzing: "Analizando",
  analyzed: "Analizado",
  watching: "Vigilado",
  rejected: "Descartado",
  approved: "Aprobado",
  acquired: "Adquirido",
  project: "Proyecto",
  closed: "Cerrado",
});
export const labelRunStatus = pick({
  completed: "completado",
  failed: "fallido",
  timeout: "tiempo agotado",
  skipped: "omitido",
  running: "en curso",
  pending: "pendiente",
});
export const labelWatchStatus = pick({ active: "activa", paused: "en pausa", triggered: "activada" });
export const labelFeasibility = pick({
  feasible: "viable",
  conditional: "condicionada",
  unfeasible: "no viable",
  infeasible: "no viable",
});
export const labelCondition = pick({
  to_renovate: "para reformar",
  good: "buen estado",
  renovated: "reformado",
  new: "obra nueva",
  unknown: "estado desconocido",
});
export const labelLevel = pick({ low: "baja", medium: "media", high: "alta", very_high: "muy alta" });
export const labelChapter = pick({
  demolition: "Demoliciones",
  structure: "Estructura",
  masonry: "Albañilería",
  plumbing: "Fontanería",
  electrical: "Electricidad",
  hvac: "Climatización",
  carpentry: "Carpintería",
  flooring: "Solados",
  finishes: "Acabados",
  kitchen: "Cocina",
  bathroom: "Baños",
  facade: "Fachada",
  roof: "Cubierta",
  energy: "Eficiencia energética",
  accessibility: "Accesibilidad",
  fire_safety: "Protección contra incendios",
  cleanup: "Limpieza",
  other: "Otros",
});
export const labelReviewRole = pick({
  ai_precheck: "pre-check IA",
  technical: "técnica",
  architect: "arquitecto",
  real_estate: "inmobiliaria",
  legal: "legal",
  tax: "fiscal",
});
export const labelReviewStatus = pick({
  approved: "aprobada",
  rejected: "rechazada",
  changes_requested: "cambios solicitados",
});

export function labelConstraint(k: keyof AcquisitionConstraints | "none"): string {
  return {
    minimumRoe: "el ROE mínimo",
    minimumProfit: "el beneficio mínimo",
    minimumMargin: "el margen mínimo",
    maximumCapital: "el capital máximo",
    maximumLtc: "el LTC máximo",
    maximumDuration: "la duración máxima",
    none: "ninguna restricción",
  }[k];
}
