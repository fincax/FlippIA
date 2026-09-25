import { buildConfidence } from "@/modules/core/evidence-status";
import { round0, round2 } from "@/modules/core/math";
import type { Comparable, ValuationAdjustments, ValuationResult } from "./types";

export const DEFAULT_ADJUSTMENTS: ValuationAdjustments = {
  askingDiscount: 0.05,
  conditionAdjustment: { renovated: 0, unrenovated: 0.22, new: -0.05, unknown: 0.1 },
  annualDrift: 0.0,
  maxDistanceM: 1_200,
  maxAgeMonths: 18,
};

const TYPE_WEIGHT: Record<Comparable["type"], number> = {
  transaction: 1.0,
  verified: 1.0,
  professional: 0.9,
  internal: 0.8,
  partner: 0.7,
  manual: 0.5,
  asking: 0.6,
};

function monthsBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
}

function weightedQuantile(values: Array<{ v: number; w: number }>, q: number): number {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc / total >= q) return x.v;
  }
  return sorted[sorted.length - 1]?.v ?? 0;
}

/**
 * After-Repair Value from comparables. Never a magic number: the result
 * carries the range, the methodology, every comparable with its adjustments,
 * and an explained confidence.
 */
export function estimateValue(params: {
  areaM2: number;
  targetCondition: "renovated" | "unrenovated";
  comparables: Comparable[];
  analysisDate: string;
  adjustments?: Partial<ValuationAdjustments>;
}): ValuationResult {
  const adj = { ...DEFAULT_ADJUSTMENTS, ...params.adjustments };
  const used: ValuationResult["comparablesUsed"] = [];
  const rejected: ValuationResult["comparablesRejected"] = [];

  for (const c of params.comparables) {
    if (c.areaM2 <= 0 || c.price <= 0) {
      rejected.push({ id: c.id, reason: "Datos incompletos." });
      continue;
    }
    if (c.distanceM > adj.maxDistanceM) {
      rejected.push({ id: c.id, reason: `A ${c.distanceM} m, fuera del radio de ${adj.maxDistanceM} m.` });
      continue;
    }
    const age = monthsBetween(c.date, params.analysisDate);
    if (age > adj.maxAgeMonths) {
      rejected.push({ id: c.id, reason: `Antigüedad ${age} meses, superior a ${adj.maxAgeMonths}.` });
      continue;
    }
    const raw = c.price / c.areaM2;
    const adjustments: Array<{ key: string; factor: number; note: string }> = [];
    let factor = 1;
    if (c.type === "asking") {
      const f = 1 - adj.askingDiscount;
      adjustments.push({ key: "asking", factor: f, note: `Precio de oferta: descuento de negociación ${Math.round(adj.askingDiscount * 100)} %.` });
      factor *= f;
    }
    // Condition: bring every comparable to the target condition.
    const targetAdj = adj.conditionAdjustment[params.targetCondition];
    const compAdj = adj.conditionAdjustment[c.condition];
    if (compAdj !== targetAdj) {
      const f = (1 + compAdj) / (1 + targetAdj);
      adjustments.push({ key: "condition", factor: round2(f), note: `Estado ${c.condition} → ${params.targetCondition}.` });
      factor *= f;
    }
    if (adj.annualDrift !== 0 && age > 0) {
      const f = Math.pow(1 + adj.annualDrift, age / 12);
      adjustments.push({ key: "time", factor: round2(f), note: `Deriva de mercado ${age} meses.` });
      factor *= f;
    }
    const sizeRatio = c.areaM2 / params.areaM2;
    if (sizeRatio > 1.6 || sizeRatio < 0.6) {
      adjustments.push({ key: "size", factor: 1, note: "Superficie muy distinta: peso reducido." });
    }
    const distanceWeight = 1 - Math.min(0.6, c.distanceM / adj.maxDistanceM) * 0.5;
    const ageWeight = 1 - Math.min(1, age / adj.maxAgeMonths) * 0.4;
    const sizeWeight = sizeRatio > 1.6 || sizeRatio < 0.6 ? 0.5 : 1;
    const weight = round2(TYPE_WEIGHT[c.type] * distanceWeight * ageWeight * sizeWeight);
    used.push({ id: c.id, type: c.type, rawPricePerM2: round0(raw), adjustedPricePerM2: round0(raw * factor), weight, adjustments, distanceM: c.distanceM, date: c.date, demo: c.demo ?? false });
  }

  if (used.length === 0) {
    return {
      targetCondition: params.targetCondition,
      pricePerM2: { low: 0, point: 0, high: 0 },
      value: { low: 0, point: 0, high: 0 },
      areaM2: params.areaM2,
      comparablesUsed: [],
      comparablesRejected: rejected,
      methodology: "Sin comparables válidos dentro de los criterios de distancia y antigüedad.",
      confidence: buildConfidence([{ key: "quantity", weight: 1, score: 0, note: "0 comparables." }], "No hay evidencia suficiente para valorar."),
      status: "UNKNOWN",
      analysisDate: params.analysisDate,
    };
  }

  const values = used.map((u) => ({ v: u.adjustedPricePerM2, w: u.weight }));
  const low = weightedQuantile(values, 0.25);
  const point = weightedQuantile(values, 0.5);
  const high = weightedQuantile(values, 0.75);
  const n = used.length;
  const transactional = used.filter((u) => u.type === "transaction" || u.type === "verified" || u.type === "professional").length;
  const spread = point > 0 ? (high - low) / point : 1;
  const avgAge = used.reduce((a, u) => a + monthsBetween(u.date, params.analysisDate), 0) / n;
  const demoShare = used.filter((u) => u.demo).length / n;

  const confidence = buildConfidence(
    [
      { key: "quantity", weight: 2, score: Math.min(1, n / 8), note: `${n} comparables utilizados.` },
      { key: "sourceQuality", weight: 3, score: n ? transactional / n : 0, note: `${transactional} de ${n} son transacciones o valoraciones verificadas; el resto son precios de oferta.` },
      { key: "consistency", weight: 2, score: Math.max(0, 1 - spread * 2), note: `Dispersión intercuartílica ${Math.round(spread * 100)} %.` },
      { key: "recency", weight: 1, score: Math.max(0, 1 - avgAge / adj.maxAgeMonths), note: `Antigüedad media ${Math.round(avgAge)} meses.` },
      { key: "verification", weight: 2, score: demoShare > 0 ? 0.1 : 0.6, note: demoShare > 0 ? "Incluye comparables DEMO sintéticos." : "Sin verificación profesional." },
    ],
    "Mediana ponderada de €/m² ajustados; rango = cuartiles 25–75 ponderados.",
  );

  const status = demoShare > 0 ? "INFERRED" : transactional / n >= 0.5 ? "INFERRED" : "REVIEW_REQUIRED";

  return {
    targetCondition: params.targetCondition,
    pricePerM2: { low: round0(low), point: round0(point), high: round0(high) },
    value: { low: round0(low * params.areaM2), point: round0(point * params.areaM2), high: round0(high * params.areaM2) },
    areaM2: params.areaM2,
    comparablesUsed: used.sort((a, b) => b.weight - a.weight),
    comparablesRejected: rejected,
    methodology:
      "Cada comparable se convierte a €/m², se ajusta por tipo de precio (oferta vs. transacción), estado y antigüedad, y se pondera por fiabilidad de la fuente, distancia, recencia y similitud de superficie. El valor central es la mediana ponderada; el rango, los cuartiles 25–75.",
    confidence,
    status,
    analysisDate: params.analysisDate,
  };
}
