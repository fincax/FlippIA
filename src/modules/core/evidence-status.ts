/**
 * The evidence traffic light. Every significant conclusion in FlippIA carries one.
 */
export const EVIDENCE_STATUSES = ["VERIFIED", "INFERRED", "REVIEW_REQUIRED", "CONFLICT", "UNKNOWN"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, { es: string; en: string; description: string }> = {
  VERIFIED: { es: "Verificado", en: "Verified", description: "Evidencia directa y fiable." },
  INFERRED: { es: "Inferido", en: "Inferred", description: "Conclusión derivada de evidencia indirecta." },
  REVIEW_REQUIRED: { es: "Requiere revisión", en: "Review required", description: "Necesita técnico o profesional." },
  CONFLICT: { es: "Conflicto", en: "Conflict", description: "Fuentes inconsistentes entre sí." },
  UNKNOWN: { es: "Desconocido", en: "Unknown", description: "No existe evidencia suficiente." },
};

/**
 * Confidence is never a fake probability. It is a 0–1 score built from
 * explicit factors, each of which is shown to the user.
 */
export interface ConfidenceFactor {
  key: "sourceQuality" | "recency" | "consistency" | "quantity" | "verification" | "uncertainty";
  weight: number;
  score: number; // 0..1
  note: string;
}

export interface Confidence {
  score: number; // 0..1
  factors: ConfidenceFactor[];
  explanation: string;
}

export function buildConfidence(factors: ConfidenceFactor[], explanation: string): Confidence {
  const totalWeight = factors.reduce((a, f) => a + f.weight, 0) || 1;
  const score = factors.reduce((a, f) => a + f.weight * Math.min(1, Math.max(0, f.score)), 0) / totalWeight;
  return { score: Math.round(score * 100) / 100, factors, explanation };
}

export function worstStatus(statuses: EvidenceStatus[]): EvidenceStatus {
  const order: EvidenceStatus[] = ["VERIFIED", "INFERRED", "REVIEW_REQUIRED", "UNKNOWN", "CONFLICT"];
  let worst = 0;
  for (const s of statuses) worst = Math.max(worst, order.indexOf(s));
  return order[worst] ?? "UNKNOWN";
}
