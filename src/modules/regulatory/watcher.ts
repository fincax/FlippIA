import type { RegulatorySnapshot, RegulatoryTopic, RegulationVersion, Jurisdiction } from "./types";

export interface RegulatoryChange {
  regulationId: string;
  shortName: string;
  newVersion: RegulationVersion;
  jurisdiction: Jurisdiction;
  topics: RegulatoryTopic[];
}

export interface WatchedAnalysis {
  dealId: string;
  dealLabel: string;
  snapshot: RegulatorySnapshot;
  /** Strategies the deal relies on, with their topics. */
  strategies: Array<{ strategyId: string; label: string; topics: RegulatoryTopic[] }>;
}

export type ImpactLevel = "unaffected" | "review" | "recalculate";

export interface ImpactAssessment {
  dealId: string;
  dealLabel: string;
  level: ImpactLevel;
  reasons: string[];
  affectedStrategies: string[];
}

export interface WatcherReport {
  change: RegulatoryChange;
  analysed: number;
  unaffected: number;
  review: number;
  recalculate: number;
  impacts: ImpactAssessment[];
  headline: string;
}

/**
 * Regulatory Watcher. Given a newly ingested regulation version, classify
 * each active analysis: unaffected, review (scope overlaps but no engine
 * input depends on it) or recalculate (a fiscal or parameter rule the
 * engines consume changed).
 */
export function assessRegulatoryChange(change: RegulatoryChange, analyses: WatchedAnalysis[]): WatcherReport {
  const impacts: ImpactAssessment[] = analyses.map((a) => {
    const inChain = a.snapshot.jurisdictionChain.some((j) => j.code === change.jurisdiction.code);
    if (!inChain)
      return {
        dealId: a.dealId,
        dealLabel: a.dealLabel,
        level: "unaffected",
        reasons: ["Fuera del ámbito territorial del análisis."],
        affectedStrategies: [],
      };
    const topicOverlap = change.topics.filter((t) => a.snapshot.topics.includes(t));
    if (topicOverlap.length === 0)
      return {
        dealId: a.dealId,
        dealLabel: a.dealLabel,
        level: "unaffected",
        reasons: ["Sin materias en común con el análisis."],
        affectedStrategies: [],
      };
    const affectedStrategies = a.strategies
      .filter((s) => s.topics.some((t) => change.topics.includes(t)))
      .map((s) => s.label);
    const usedBefore = a.snapshot.entries.some((e) => e.regulationId === change.regulationId);
    const engineTopics: RegulatoryTopic[] = [
      "tax.acquisition",
      "tax.exit",
      "tax.local",
      "tax.works",
      "building_parameters",
    ];
    const engineImpact = change.topics.some((t) => engineTopics.includes(t));
    const level: ImpactLevel = engineImpact ? "recalculate" : "review";
    const reasons = [
      usedBefore
        ? `El análisis utilizó ${change.shortName}; existe una versión nueva (${change.newVersion.version}, vigente desde ${change.newVersion.effectiveFrom}).`
        : `Nueva norma en materias del análisis: ${topicOverlap.join(", ")}.`,
      ...(engineImpact ? ["Afecta a reglas que consumen los motores de cálculo."] : []),
    ];
    return { dealId: a.dealId, dealLabel: a.dealLabel, level, reasons, affectedStrategies };
  });
  const unaffected = impacts.filter((i) => i.level === "unaffected").length;
  const review = impacts.filter((i) => i.level === "review").length;
  const recalculate = impacts.filter((i) => i.level === "recalculate").length;
  const headline = `Cambio regulatorio detectado: ${change.shortName}. ${analyses.length} análisis revisados. ${unaffected} no parecen afectados. ${review} requieren revisión. ${recalculate} ${recalculate === 1 ? "estrategia necesita" : "estrategias necesitan"} ser recalculada${recalculate === 1 ? "" : "s"}.`;
  return { change, analysed: analyses.length, unaffected, review, recalculate, impacts, headline };
}
