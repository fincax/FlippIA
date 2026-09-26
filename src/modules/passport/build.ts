import type { AnalysisResult, StrategyResult } from "@/modules/analysis/types";
import { formatMoney, formatPercent } from "@/lib/format";

export interface PassportSection {
  key: string;
  title: string;
  status?: "VERIFIED" | "INFERRED" | "REVIEW_REQUIRED" | "CONFLICT" | "UNKNOWN";
  rows: Array<{ label: string; value: string; note?: string }>;
  bullets?: string[];
}

export interface DealPassport {
  id: string;
  dealId: string;
  analysisId: string;
  title: string;
  generatedAt: string;
  analysisDate: string;
  demo: boolean;
  verified: {
    level: "ai_precheck" | "technical" | "architect" | "real_estate" | "verified";
    label: string;
    meaning: string;
    reviews: Array<{ role: string; status: string; at: string; by: string }>;
  };
  sections: PassportSection[];
  evidenceCount: number;
  regulatoryFingerprint: string;
}

/**
 * Deal Passport: a living document model built from the analysis. Rendered
 * in the UI and exportable (print / PDF). Every figure comes from the
 * engines; every section states its evidence status.
 */
export function buildPassport(
  analysis: AnalysisResult,
  dealId: string,
  reviews: DealPassport["verified"]["reviews"] = [],
): DealPassport {
  const p = analysis.property;
  const top: StrategyResult | undefined = analysis.strategies[0];
  const base = top?.scenarioSet.scenarios.find((s) => s.kind === "base")?.result ?? null;
  const money = (v: number | null | undefined) => (v === null || v === undefined ? "n/d" : formatMoney(v));
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "n/d" : formatPercent(v));
  const sections: PassportSection[] = [
    {
      key: "asset",
      title: "Activo",
      status: p.cadastral.found ? "INFERRED" : "UNKNOWN",
      rows: [
        { label: "Dirección", value: p.property.address.raw },
        { label: "Microzona", value: p.microzone.name },
        { label: "Tipología", value: `${p.property.typology} · ${p.property.assetUse}` },
        {
          label: "Superficie construida",
          value: `${p.property.builtAreaM2} m²`,
          note: p.cadastral.builtAreaM2
            ? `Catastro: ${p.cadastral.builtAreaM2} m² (${p.cadastral.mode})`
            : "Sin dato catastral",
        },
        { label: "Año", value: p.property.yearBuilt ? String(p.property.yearBuilt) : "n/d" },
        { label: "Estado", value: p.property.condition },
        { label: "Referencia catastral", value: p.property.cadastralRef ?? "n/d" },
      ],
    },
    {
      key: "origin",
      title: "Origen y precio",
      rows: [
        { label: "Petición", value: analysis.intake.rawText },
        {
          label: "Precio solicitado",
          value: money(p.askingPrice),
          note:
            p.askingPriceSource === "estimated"
              ? "Estimado: no se indicó precio"
              : `Fuente: ${p.askingPriceSource}`,
        },
      ],
    },
    {
      key: "market",
      title: "Mercado y valoración",
      status: analysis.market.status,
      rows: [
        {
          label: "Valor as-is",
          value: money(analysis.market.valuationUnrenovated.value.point),
          note: `${analysis.market.valuationUnrenovated.pricePerM2.point} €/m²`,
        },
        {
          label: "Valor reformado (ARV)",
          value: `${money(analysis.market.valuationRenovated.value.low)} – ${money(analysis.market.valuationRenovated.value.high)}`,
          note: `Central ${money(analysis.market.valuationRenovated.value.point)} · ${analysis.market.valuationRenovated.comparablesUsed.length} comparables · confianza ${Math.round(analysis.market.confidence.score * 100)} %`,
        },
        { label: "Renta de mercado", value: `${money(analysis.market.rent.monthly.point)}/mes` },
        {
          label: "Liquidez",
          value: `${analysis.market.liquidity.level} · ${analysis.market.liquidity.daysToSell} días`,
        },
        { label: "Metodología", value: analysis.market.valuationRenovated.methodology },
      ],
    },
    {
      key: "urbanism",
      title: "Urbanismo",
      status: analysis.urbanism.status,
      rows: [
        { label: "Planeamiento", value: analysis.urbanism.planning.planningInstrument },
        {
          label: "Zona de ordenanza",
          value: `${analysis.urbanism.planning.zoningCode} · ${analysis.urbanism.planning.zoningLabel}`,
        },
        { label: "Protección", value: analysis.urbanism.planning.protectionLevel },
        { label: "Residencial en planta baja", value: analysis.urbanism.planning.groundFloorResidential },
      ],
      bullets: analysis.urbanism.requiredChecks.map(
        (c) => `${c.blocking ? "[bloqueante] " : ""}${c.label} — ${c.who}`,
      ),
    },
    {
      key: "regulatory",
      title: "Normativa aplicada",
      status: "INFERRED",
      rows: analysis.regulatory.entries.slice(0, 12).map((e) => ({
        label: e.shortName,
        value: `${e.status} desde ${e.effectiveFrom}`,
        note: `${e.sourceName} · ${e.verificationStatus}`,
      })),
    },
    {
      key: "architecture",
      title: "Arquitectura",
      status: analysis.architecture.status,
      rows: analysis.architecture.alternatives.map((a) => ({
        label: a.label,
        value: money(a.estimate.contractBudget),
        note: `${a.feasibility} · ${a.estimate.costPerM2} €/m² · ${a.description}`,
      })),
    },
    {
      key: "strategies",
      title: "Estrategias (MultiExit)",
      rows: analysis.strategies.map((s) => ({
        label: `${s.rank}. ${s.label}${s.applicability.conditional ? " *" : ""}`,
        value:
          s.exitKind === "sale"
            ? `${money(s.headline.netProfit)} · ROE ${pct(s.headline.roe)} · ${s.headline.durationMonths} m`
            : `${money(s.headline.monthlyRent)}/mes · TIR ${pct(s.headline.irr)}`,
        note: s.whyRanked[0],
      })),
      bullets: ["* Condicionado a validación."],
    },
    ...(top && base
      ? [
          {
            key: "finance",
            title: `Finanzas — ${top.label} (escenario base)`,
            rows: [
              { label: "Coste total", value: money(base.totals.totalProjectCost) },
              { label: "Capital necesario", value: money(base.metrics.equityRequired.value) },
              {
                label: "Deuda",
                value: money(base.metrics.debt.value),
                note: base.financing.instruments.map((i) => i.label).join(", ") || "Sin deuda",
              },
              { label: "Beneficio neto", value: money(base.metrics.netProfit.value) },
              { label: "Beneficio tras impuestos", value: money(base.metrics.netProfitAfterTax.value) },
              {
                label: "ROE / anualizado",
                value: `${pct(base.metrics.roe.value)} / ${pct(base.metrics.annualizedRoe.value)}`,
              },
              { label: "TIR", value: pct(base.metrics.irr.value) },
              { label: "Precio de equilibrio", value: money(base.metrics.breakEvenPrice.value) },
              { label: "Reglas fiscales", value: base.taxRuleSetId },
            ],
            bullets: base.reviewItems,
          } satisfies PassportSection,
        ]
      : []),
    ...(top?.stress
      ? [
          {
            key: "risk",
            title: "Riesgo y estrés",
            rows: [
              { label: "Margen de seguridad", value: pct(top.stress.marginOfSafety) },
              { label: "Precio mínimo de salida", value: money(top.stress.minimumExitPrice) },
              { label: "Reforma máxima", value: money(top.stress.maximumRenovation) },
              {
                label: "Precio máximo de compra (beneficio ≥ 0)",
                value: money(top.stress.maximumAcquisition),
              },
              { label: "Capital en riesgo (peor escenario)", value: money(top.stress.capitalAtRisk) },
              { label: "Supervivencia", value: pct(top.stress.survivalRate) },
            ],
            bullets: analysis.risk.findings
              .filter((f) => f.severity !== "low")
              .map((f) => `[${f.severity}] ${f.title}: ${f.detail}`),
          } satisfies PassportSection,
        ]
      : []),
    {
      key: "pending",
      title: "Pendientes y verificaciones",
      rows: [],
      bullets: [
        ...analysis.synthesis.missingData,
        ...analysis.urbanism.requiredChecks.filter((c) => c.blocking).map((c) => c.label),
      ],
    },
    {
      key: "sources",
      title: "Fuentes",
      rows: analysis.sources.map((s) => ({
        label: s.name,
        value: `${s.mode}${s.available ? "" : " · no disponible"}`,
        note: s.note,
      })),
    },
  ];
  const approved = new Set(reviews.filter((r) => r.status === "approved").map((r) => r.role));
  const level: DealPassport["verified"]["level"] =
    approved.has("architect") && approved.has("real_estate") && approved.has("technical")
      ? "verified"
      : approved.has("real_estate")
        ? "real_estate"
        : approved.has("architect")
          ? "architect"
          : approved.has("technical")
            ? "technical"
            : "ai_precheck";
  const meaning: Record<DealPassport["verified"]["level"], string> = {
    ai_precheck: "Análisis automático de FlippIA. Ninguna persona ha revisado todavía este caso.",
    technical: "Revisión técnica registrada (datos y coherencia).",
    architect: "Un arquitecto ha revisado urbanismo y arquitectura.",
    real_estate: "Revisión inmobiliaria registrada (mercado y salida).",
    verified: "FlippIA Verified: revisiones técnica, de arquitecto e inmobiliaria registradas.",
  };
  return {
    id: `pass_${analysis.id}`,
    dealId,
    analysisId: analysis.id,
    title: `Deal Passport — ${p.property.address.raw}`,
    generatedAt: new Date().toISOString(),
    analysisDate: analysis.analysisDate,
    demo: analysis.demo,
    verified: {
      level,
      label:
        level === "verified"
          ? "FlippIA Verified"
          : level === "ai_precheck"
            ? "Pre-check IA"
            : `Revisión ${level}`,
      meaning: meaning[level],
      reviews,
    },
    sections,
    evidenceCount: analysis.evidence.length,
    regulatoryFingerprint: analysis.regulatory.fingerprint,
  };
}
