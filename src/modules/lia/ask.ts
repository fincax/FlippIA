import type { AnalysisResult, StrategyResult } from "@/modules/analysis/types";
import { LIA_SYSTEM_PROMPT } from "@/modules/analysis/narrative";
import type { AIProvider } from "@/modules/ai/provider";
import { normalizeText } from "@/modules/city/registry";
import { computeMaximumAcquisitionPrice, type AcquisitionConstraints } from "@/modules/engines/financial";
import { evaluateWhatIf } from "@/modules/engines/scenario";
import { formatMoney, formatPercent } from "@/lib/format";
import { parseMoney } from "@/modules/property/intake";

export type LiaAnswerKind = "worst" | "arv" | "comparables" | "what_if" | "regulation" | "missing" | "max_price" | "why_first" | "risk" | "strategy" | "financing" | "general";

export interface LiaAnswer {
  kind: LiaAnswerKind;
  text: string;
  /** Structured payload the UI can render (tables, numbers). */
  data?: Record<string, unknown>;
  source: "engine" | "model" | "template";
  citations: string[]; // evidence ids
}

const top = (a: AnalysisResult): StrategyResult | undefined => a.strategies.find((s) => s.rank === 1) ?? a.strategies[0];

/**
 * "Ask this property": deterministic routing of the question to the deal's
 * own data and engines. The model, when configured, only rephrases the
 * factual answer; it never sees anything outside the deal context.
 */
export async function askProperty(analysis: AnalysisResult, question: string, ai?: AIProvider): Promise<LiaAnswer> {
  const q = normalizeText(question);
  const t = top(analysis);
  let answer: LiaAnswer;

  if (/\bpeor\b|\bmalo\b|\briesgo\b|\bque puede salir mal\b/.test(q)) {
    const findings = analysis.risk.findings.filter((f) => f.severity !== "low").slice(0, 5);
    const stress = t?.stress;
    answer = {
      kind: "worst",
      text: [
        findings.length ? `Lo que más me preocupa: ${findings.map((f) => `${f.title.toLowerCase()} (${f.detail})`).join("; ")}.` : "No detecto objeciones de peso más allá de la ejecución.",
        stress ? `En estrés, ${t!.label} deja de ser rentable en ${stress.outcomes.filter((o) => !o.survives).length} de ${stress.outcomes.length} escenarios; el peor (${stress.worstCase?.label}) supone ${formatMoney(stress.worstCase?.netProfit ?? 0, { signed: true })}. Precio mínimo de salida: ${formatMoney(stress.minimumExitPrice ?? 0)}; reforma máxima: ${formatMoney(stress.maximumRenovation ?? 0)}.` : "",
      ].filter(Boolean).join(" "),
      data: { findings, stress },
      source: "engine",
      citations: findings.flatMap((f) => f.evidenceIds ?? []),
    };
  } else if (/\barv\b|\bvalor reformado\b|\bprecio de venta\b|\bpor que .*(valor|arv)/.test(q)) {
    const v = analysis.market.valuationRenovated;
    answer = {
      kind: "arv",
      text: `El ARV central es ${formatMoney(v.value.point)} (${v.pricePerM2.point} €/m²), con un rango ${formatMoney(v.value.low)}–${formatMoney(v.value.high)}. ${v.methodology} Se han usado ${v.comparablesUsed.length} comparables y descartado ${v.comparablesRejected.length}. Confianza ${Math.round(v.confidence.score * 100)} %: ${v.confidence.factors.map((f) => f.note).join(" ")}`,
      data: { valuation: v },
      source: "engine",
      citations: [],
    };
  } else if (/\bcomparables?\b|\btestigos\b/.test(q)) {
    const v = analysis.market.valuationRenovated;
    answer = {
      kind: "comparables",
      text: `${v.comparablesUsed.length} comparables utilizados (ordenados por peso): ${v.comparablesUsed.slice(0, 6).map((c) => `${c.type} a ${c.distanceM} m, ${c.rawPricePerM2} → ${c.adjustedPricePerM2} €/m² ajustado, peso ${c.weight}`).join("; ")}.${analysis.market.demo ? " Todos son DEMO: sintéticos de demostración." : ""}`,
      data: { used: v.comparablesUsed, rejected: v.comparablesRejected },
      source: "engine",
      citations: [],
    };
  } else if (/\bque pasa si\b|\by si\b|\bsi pago\b|\bsi vendo\b|\bsi la reforma\b|\bcon financiacion\b/.test(q) && t) {
    const wi = parseWhatIf(question, t);
    if (wi) {
      const r = evaluateWhatIf(t.scenarioSet, wi.overrides);
      const base = t.scenarioSet.scenarios.find((s) => s.kind === "base")!.result!;
      const dp = (r.result.metrics.netProfit.value ?? 0) - (base.metrics.netProfit.value ?? 0);
      answer = {
        kind: "what_if",
        text: `${wi.description}: el beneficio neto pasaría de ${formatMoney(base.metrics.netProfit.value ?? 0)} a ${formatMoney(r.result.metrics.netProfit.value ?? 0)} (${formatMoney(dp, { signed: true })}); ROE ${formatPercent(base.metrics.roe.value ?? 0)} → ${formatPercent(r.result.metrics.roe.value ?? 0)}; capital ${formatMoney(base.metrics.equityRequired.value ?? 0)} → ${formatMoney(r.result.metrics.equityRequired.value ?? 0)}. Es una simulación temporal: el escenario base no cambia hasta que lo confirmes.`,
        data: { overrides: wi.overrides, metrics: r.result.metrics },
        source: "engine",
        citations: [],
      };
    } else {
      answer = { kind: "what_if", text: "No he identificado la variable a modificar. Prueba: «¿Qué pasa si la reforma cuesta 15.000 € más?», «¿Y si vendo seis meses después?» o «¿Y con financiación del 70 %?».", source: "template", citations: [] };
    }
  } else if (/\bnormativa\b|\bley\b|\bregulaci|\blicencia\b|\bcambio de uso\b|\bpgou\b/.test(q)) {
    const topic = /cambio de uso/.test(q) ? ["change_of_use", "zoning", "habitability", "horizontal_property"] : /licencia/.test(q) ? ["licence", "responsible_declaration"] : /turist/.test(q) ? ["tourism"] : null;
    const entries = analysis.regulatory.entries.filter((e) => !topic || e.topics.some((x) => topic.includes(x)));
    answer = {
      kind: "regulation",
      text: `Conforme a la normativa identificada como vigente a ${analysis.regulatory.analysisDate}: ${entries.slice(0, 6).map((e) => `${e.shortName} (${e.jurisdiction.label}, vigente desde ${e.effectiveFrom}, ${e.verificationStatus === "VERIFIED" ? "verificada" : "pendiente de verificación documental"})`).join("; ")}. ${analysis.urbanism.requiredChecks.length ? `Comprobaciones pendientes: ${analysis.urbanism.requiredChecks.map((c) => c.label).join("; ")}.` : ""} Es una interpretación técnica, no una resolución administrativa.`,
      data: { entries, checks: analysis.urbanism.requiredChecks },
      source: "engine",
      citations: [],
    };
  } else if (/\bdatos? te faltan\b|\bque (te )?falta\b|\bfaltan\b/.test(q)) {
    answer = { kind: "missing", text: analysis.synthesis.missingData.length ? `Me faltan: ${analysis.synthesis.missingData.join(" ")} Con esos datos, las conclusiones pasan de inferidas a verificadas.` : "No echo en falta datos esenciales; las comprobaciones pendientes son técnicas y urbanísticas.", data: { missing: analysis.synthesis.missingData }, source: "engine", citations: [] };
  } else if (/\bhasta cuanto\b|\bprecio maximo\b|\bcuanto (puedo|podria) pagar\b|\bmaximo\b.*\bpagar\b/.test(q) && t) {
    const constraints = parseConstraints(question, analysis);
    const base = t.scenarioSet.base;
    const r = computeMaximumAcquisitionPrice(base, constraints);
    answer = {
      kind: "max_price",
      text: `Para ${t.label}, el precio máximo que mantiene tus objetivos (${describeConstraints(constraints)}) es ${formatMoney(r.maximumPrice)}; el límite lo marca ${labelConstraint(r.bindingConstraint)}. Frente a los ${formatMoney(r.askingPrice)} solicitados, ${r.headroom >= 0 ? `hay ${formatMoney(r.headroom)} de margen` : `habría que negociar ${formatMoney(-r.headroom)} a la baja`}.`,
      data: { result: r, constraints },
      source: "engine",
      citations: [],
    };
  } else if (/\bpor que\b.*\b(primer|primera|mejor)\b|\bpor que .*(recomiendas|esta primero)/.test(q) && t) {
    answer = { kind: "why_first", text: `${t.label} aparece primero porque: ${t.whyRanked.join(" ")} Puntuación ${t.score}/100 con pesos explícitos (retorno 28 %, seguridad 16 %, certeza 16 %, capital 14 %, beneficio 14 %, plazo 6 %, objetivo 6 %).`, data: { strategy: t }, source: "engine", citations: [] };
  } else if (/\bfinanciaci|\bhipoteca\b|\bcapital\b/.test(q)) {
    answer = { kind: "financing", text: `${analysis.finance.summary} Estructuras: ${analysis.finance.stacks.map((s) => `${s.label} (${s.description})`).join("; ")}.${analysis.finance.demo ? " Condiciones DEMO indicativas." : ""}`, data: { stacks: analysis.finance.stacks }, source: "engine", citations: [] };
  } else if (/\bestrategia|\bfuturos?\b|\bvias?\b|\balternativas?\b/.test(q)) {
    answer = { kind: "strategy", text: `${analysis.synthesis.headline} ${analysis.synthesis.futures.map((f, i) => `${i + 1}. ${f.label}${f.conditional ? "*" : ""}: ${f.oneLiner}`).join(" ")} (* condicionado a validación).`, data: { futures: analysis.synthesis.futures }, source: "engine", citations: [] };
  } else {
    answer = { kind: "general", text: `${analysis.synthesis.headline} ${analysis.synthesis.thesis}`, source: "template", citations: [] };
  }

  if (ai?.available && answer.kind !== "what_if") {
    try {
      const res = await ai.complete({ system: LIA_SYSTEM_PROMPT, messages: [{ role: "user", content: `Pregunta del usuario: «${question}». Respuesta factual calculada por los motores (no añadas cifras ni normas que no estén aquí; puedes reformular con naturalidad):\n${answer.text}` }], maxTokens: 500 });
      if (res && res.text.length > 30) return { ...answer, text: res.text, source: "model" };
    } catch {
      /* fall back to engine text */
    }
  }
  return answer;
}

export function parseWhatIf(question: string, strategy: StrategyResult): { overrides: Record<string, number>; description: string } | null {
  const q = normalizeText(question);
  const money = parseMoney(question);
  const months = question.match(/(\d{1,2})\s*(?:meses|mes)\b/i);
  const pctMatch = question.match(/(\d{1,2})\s*%/);
  const base = strategy.scenarioSet.base;
  const more = /\bmas\b/.test(q);
  const less = /\bmenos\b/.test(q);
  if (/reforma|obra/.test(q) && (money[0] || pctMatch)) {
    const delta = money[0] ? money[0] * (less ? -1 : more ? 1 : 0) : 0;
    const value = money[0] ? (delta === 0 ? money[0] : base.transformation.renovationBudget + delta) : Math.round(base.transformation.renovationBudget * (1 + Number(pctMatch![1]) / 100 * (less ? -1 : 1)));
    return { overrides: { "transformation.renovationBudget": value }, description: `Reforma a ${formatMoney(value)}` };
  }
  if (/vend|plazo|retras|tard/.test(q) && months) {
    const n = Number(months[1]);
    const value = /despues|mas tarde|retras/.test(q) ? base.holding.durationMonths + n : n;
    return { overrides: { "holding.durationMonths": value }, description: `Duración ${value} meses` };
  }
  if (/financiaci|hipoteca|ltv/.test(q) && pctMatch) {
    const ratio = Number(pctMatch[1]) / 100;
    return { overrides: { "financing.0.sizing.ratio": ratio, "financing.0.sizing.type": 0 as unknown as number }, description: `Financiación al ${Math.round(ratio * 100)} %` } as { overrides: Record<string, number>; description: string };
  }
  if (/pago|precio|compra|oferta/.test(q) && money[0]) {
    const value = more ? base.acquisition.purchasePrice + money[0] : less ? base.acquisition.purchasePrice - money[0] : money[0];
    return { overrides: { "acquisition.purchasePrice": value }, description: `Compra a ${formatMoney(value)}` };
  }
  if (/vend|venta|salida/.test(q) && money[0]) {
    const value = more ? (base.exit.kind === "sale" ? base.exit.salePrice : 0) + money[0] : less ? (base.exit.kind === "sale" ? base.exit.salePrice : 0) - money[0] : money[0];
    return { overrides: { "exit.salePrice": value }, description: `Venta a ${formatMoney(value)}` };
  }
  return null;
}

function parseConstraints(question: string, analysis: AnalysisResult): AcquisitionConstraints {
  const inv = analysis.investor;
  const roe = question.match(/(\d{1,2})\s*%/);
  const money = parseMoney(question);
  return {
    minimumRoe: roe ? Number(roe[1]) / 100 : inv.targetRoe,
    minimumProfit: money[0] && /benefici|ganar/.test(normalizeText(question)) ? money[0] : inv.targetProfit,
    maximumCapital: inv.maxEquityPerDeal,
  };
}

function describeConstraints(c: AcquisitionConstraints): string {
  const parts: string[] = [];
  if (c.minimumRoe !== undefined) parts.push(`ROE ≥ ${formatPercent(c.minimumRoe, { decimals: 0 })}`);
  if (c.minimumProfit !== undefined) parts.push(`beneficio ≥ ${formatMoney(c.minimumProfit)}`);
  if (c.maximumCapital !== undefined) parts.push(`capital ≤ ${formatMoney(c.maximumCapital)}`);
  if (c.maximumLtc !== undefined) parts.push(`LTC ≤ ${formatPercent(c.maximumLtc, { decimals: 0 })}`);
  if (c.maximumDuration !== undefined) parts.push(`plazo ≤ ${c.maximumDuration} meses`);
  return parts.join(", ");
}

export function labelConstraint(k: keyof AcquisitionConstraints | "none"): string {
  return { minimumRoe: "el ROE mínimo", minimumProfit: "el beneficio mínimo", minimumMargin: "el margen mínimo", maximumCapital: "el capital máximo", maximumLtc: "el LTC máximo", maximumDuration: "la duración máxima", none: "ninguna restricción" }[k];
}
