import type {
  DnaDimension,
  InvestmentSynthesis,
  MarketAssessment,
  OpportunityDNA,
  OpportunityGap,
  PropertyProfile,
  RiskAssessment,
  StrategyResult,
  UrbanismAssessment,
  ArchitectureAssessment,
  FinanceAssessment,
} from "./types";
import type { InvestorDNA } from "@/modules/investor/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { labelRisk } from "@/lib/labels";

/**
 * Investment Orchestrator → ranking. Explainable score: each component is a
 * 0–1 factor with a stated weight; `whyRanked` lists the reasons in words.
 */
export function rankStrategies(strategies: StrategyResult[], investor: InvestorDNA): StrategyResult[] {
  const scored = strategies.map((s) => {
    const reasons: string[] = [];
    const roe = s.headline.annualizedRoe ?? -1;
    const profit = s.headline.netProfit ?? 0;
    const equity = s.headline.equityRequired ?? Infinity;
    const survival = s.stress?.survivalRate ?? 0;
    const mos = s.stress?.marginOfSafety ?? 0;
    const blocking = s.applicability.requiredChecks.filter((c) => c.blocking).length;

    const fReturn = clamp01((roe - 0) / 0.35);
    const fProfit = clamp01(profit / Math.max(1, investor.targetProfit * 1.5));
    const fCapital =
      equity <= investor.maxEquityPerDeal
        ? 1
        : clamp01(1 - (equity - investor.maxEquityPerDeal) / investor.maxEquityPerDeal);
    const fSafety = s.exitKind === "sale" ? clamp01(mos / 0.2) * 0.5 + survival * 0.5 : survival;
    const fCertainty = s.applicability.conditional ? clamp01(0.55 - blocking * 0.1) : 1;
    const fDuration =
      investor.horizonMonths >= s.headline.durationMonths
        ? 1
        : clamp01(1 - (s.headline.durationMonths - investor.horizonMonths) / investor.horizonMonths);
    const objectiveFit =
      investor.objective === "income"
        ? s.exitKind === "rent"
          ? 1
          : 0.6
        : investor.objective === "capital_gain"
          ? s.exitKind === "sale"
            ? 1
            : 0.7
          : 0.9;

    const weights = {
      return: 0.28,
      profit: 0.14,
      capital: 0.14,
      safety: 0.16,
      certainty: 0.16,
      duration: 0.06,
      objective: 0.06,
    };
    const score = Math.round(
      100 *
        (weights.return * fReturn +
          weights.profit * fProfit +
          weights.capital * fCapital +
          weights.safety * fSafety +
          weights.certainty * fCertainty +
          weights.duration * fDuration +
          weights.objective * objectiveFit),
    );

    if (fReturn > 0.6)
      reasons.push(
        s.headline.durationMonths < 12
          ? `ROE ${formatPercent(s.headline.roe ?? 0)} en ${s.headline.durationMonths} meses.`
          : `ROE anualizado ${formatPercent(roe)}.`,
      );
    else if (roe < 0) reasons.push("Retorno negativo en el escenario base.");
    if (equity <= investor.maxEquityPerDeal)
      reasons.push(`Capital necesario ${formatMoney(equity)} dentro de tu límite.`);
    else
      reasons.push(
        `Requiere ${formatMoney(equity)}, por encima de tu límite de ${formatMoney(investor.maxEquityPerDeal)}.`,
      );
    if (s.exitKind === "sale" && mos > 0.1)
      reasons.push(`Margen de seguridad ${formatPercent(mos)} sobre el precio de salida.`);
    if (survival < 0.6)
      reasons.push(`Solo sobrevive a ${Math.round(survival * 100)} % de los escenarios de estrés.`);
    if (s.applicability.conditional)
      reasons.push(
        `Condicionada a ${s.applicability.requiredChecks.length} comprobaciones (${blocking} bloqueantes).`,
      );
    else reasons.push("Sin comprobaciones bloqueantes.");
    if (s.headline.durationMonths > investor.horizonMonths)
      reasons.push(
        `Duración ${s.headline.durationMonths} meses, superior a tu horizonte de ${investor.horizonMonths}.`,
      );
    return { ...s, score, whyRanked: reasons };
  });
  scored.sort((a, b) => b.score - a.score || (b.headline.netProfit ?? 0) - (a.headline.netProfit ?? 0));
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function computeOpportunityGap(
  strategies: StrategyResult[],
  market: MarketAssessment,
  askingPrice: number,
): OpportunityGap {
  const currentValue = market.valuationUnrenovated.value.point;
  const candidates = strategies.filter((s) => s.applicability.applicable);
  const best = candidates.reduce<StrategyResult | null>((b, s) => {
    const v = potentialOf(s);
    return b === null || v > potentialOf(b) ? s : b;
  }, null);
  const potentialValue = best ? potentialOf(best) : currentValue;
  const transformationCost = best
    ? best.scenarioSet.base.transformation.renovationBudget +
      best.scenarioSet.base.transformation.professionalFees
    : 0;
  const levers: OpportunityGap["levers"] = [
    {
      key: "acquisition",
      label: "Adquisición",
      amount: Math.round(currentValue - askingPrice),
      explanation:
        currentValue >= askingPrice
          ? "Precio solicitado por debajo del valor as-is."
          : "Se paga por encima del valor as-is: la operación depende de la transformación.",
    },
    {
      key: "transformation",
      label: "Transformación",
      amount: Math.round(potentialValue - currentValue - transformationCost),
      explanation: best
        ? `${best.label}: valor potencial menos valor actual y coste de obra.`
        : "Sin transformación aplicable.",
    },
  ];
  const gap = Math.round(potentialValue - currentValue);
  return {
    currentValue,
    potentialValue: Math.round(potentialValue),
    gap,
    bestStrategyId: best?.id ?? null,
    levers,
    summary: best
      ? `Entre lo que el activo es hoy (${formatMoney(currentValue)}) y lo que puede llegar a ser (${formatMoney(potentialValue)}) hay ${formatMoney(gap)} de diferencial; ${formatMoney(transformationCost)} de transformación lo separan.`
      : "Sin diferencial identificable con los datos disponibles.",
  };
}

function potentialOf(s: StrategyResult): number {
  if (s.exitKind === "sale") return s.headline.salePrice ?? 0;
  return s.scenarioSet.base.exit.kind === "rent" ? s.scenarioSet.base.exit.terminalValue : 0;
}

export function computeOpportunityDNA(params: {
  strategies: StrategyResult[];
  market: MarketAssessment;
  urbanism: UrbanismAssessment;
  architecture: ArchitectureAssessment;
  finance: FinanceAssessment;
  risk: RiskAssessment;
  profile: PropertyProfile;
  gap: OpportunityGap;
}): OpportunityDNA {
  const { strategies, market, urbanism, architecture, finance, risk, gap } = params;
  const top = strategies[0];
  const pct = (v: number) => Math.round(clamp01(v) * 100);
  const dims: DnaDimension[] = [
    {
      key: "acquisition",
      label: "Adquisición",
      score: pct(0.5 + market.askingVsValue.discount * 2.5),
      explanation: market.askingVsValue.note,
    },
    {
      key: "market",
      label: "Mercado",
      score: pct(
        (market.liquidity.demand === "high" ? 0.9 : market.liquidity.demand === "medium" ? 0.6 : 0.3) * 0.6 +
          market.confidence.score * 0.4,
      ),
      explanation: `Demanda ${market.liquidity.demand}; confianza de mercado ${Math.round(market.confidence.score * 100)} %.`,
    },
    {
      key: "transformation",
      label: "Transformación",
      score: pct(gap.currentValue > 0 ? gap.gap / gap.currentValue / 0.4 : 0),
      explanation: gap.summary,
    },
    {
      key: "urbanism",
      label: "Urbanismo",
      // Pending verifications and unknown planning data cost points: a 100 must mean "nothing left to check".
      score: pct(
        1 -
          urbanism.requiredChecks.filter((c) => c.blocking).length * 0.2 -
          urbanism.requiredChecks.filter((c) => !c.blocking).length * 0.05 -
          (urbanism.planning.protectionLevel === "A" || urbanism.planning.protectionLevel === "B" ? 0.3 : 0) -
          (urbanism.planning.protectionLevel === "unknown" && urbanism.planning.inHistoricCentre ? 0.25 : 0) -
          (urbanism.planning.status === "UNKNOWN"
            ? 0.5
            : urbanism.planning.status === "INFERRED" || urbanism.planning.status === "REVIEW_REQUIRED"
              ? 0.1
              : 0),
      ),
      explanation: urbanism.requiredChecks.length
        ? `${urbanism.summary} ${urbanism.requiredChecks.length} comprobaciones pendientes.`
        : urbanism.summary,
    },
    {
      key: "architecture",
      label: "Arquitectura",
      score: pct(0.4 + architecture.alternatives.filter((a) => a.feasibility === "feasible").length * 0.2),
      explanation: `${architecture.alternatives.length} alternativas; ${architecture.alternatives.filter((a) => a.feasibility === "feasible").length} sin condicionantes.`,
    },
    {
      key: "finance",
      label: "Financiación",
      score: pct(finance.stacks.length >= 3 ? 0.8 : 0.5),
      explanation: finance.summary,
    },
    {
      key: "execution",
      label: "Ejecución",
      score: pct(
        top
          ? { none: 0.95, cosmetic: 0.9, medium: 0.7, integral: 0.55, change_of_use: 0.35 }[
              top.transformation.level
            ]
          : 0.5,
      ),
      explanation: top
        ? `Nivel de intervención de la mejor vía: ${top.transformation.level}.`
        : "Sin estrategia.",
    },
    {
      key: "liquidity",
      label: "Liquidez",
      score: pct(1 - Math.min(1, market.liquidity.daysToSell / 180)),
      explanation: `${market.liquidity.daysToSell} días de venta estimados.`,
    },
    {
      key: "risk",
      label: "Riesgo",
      score: pct(risk.overall === "low" ? 0.85 : risk.overall === "medium" ? 0.55 : 0.25),
      explanation: risk.summary,
    },
  ];
  const weights: OpportunityDNA["composite"]["weights"] = {
    acquisition: 0.15,
    market: 0.12,
    transformation: 0.15,
    urbanism: 0.12,
    architecture: 0.08,
    finance: 0.08,
    execution: 0.08,
    liquidity: 0.1,
    risk: 0.12,
  };
  const score = Math.round(dims.reduce((a, d) => a + d.score * weights[d.key], 0));
  return {
    dimensions: dims,
    composite: {
      score,
      formula: "Σ (puntuación de dimensión × peso)",
      weights,
      uncertainty: `Evidencia DEMO: ${params.profile.property.demo || market.demo ? "sí" : "no"}. Confianza de mercado ${Math.round(market.confidence.score * 100)} %, urbanismo ${Math.round(urbanism.confidence.score * 100)} %.`,
    },
  };
}

/** Templated synthesis (used when no model is configured, and as the factual skeleton the model must respect). */
export function templateSynthesis(params: {
  profile: PropertyProfile;
  strategies: StrategyResult[];
  gap: OpportunityGap;
  risk: RiskAssessment;
  urbanism: UrbanismAssessment;
  market: MarketAssessment;
  investor: InvestorDNA;
}): InvestmentSynthesis {
  const { profile, strategies, gap, risk, urbanism, market, investor } = params;
  const applicable = strategies.filter((s) => s.applicability.applicable);
  const top = applicable[0];
  const futures = applicable.slice(0, 6).map((s) => ({
    strategyId: s.id,
    label: s.label,
    conditional: s.applicability.conditional,
    oneLiner:
      s.exitKind === "sale"
        ? `${formatMoney(s.headline.netProfit ?? 0, { signed: true })} netos · ROE ${formatPercent(s.headline.roe ?? 0)} · ${s.headline.durationMonths} meses`
        : `${formatMoney(s.headline.monthlyRent ?? 0)}/mes · TIR ${formatPercent(s.headline.irr ?? 0)} · ${formatMoney(s.headline.equityRequired ?? 0)} de capital`,
  }));
  const headline = applicable.length
    ? `He encontrado ${applicable.length} posibles futuros para este activo.`
    : "No he encontrado una vía de inversión defendible con los datos disponibles.";
  const missingData: string[] = [];
  if (profile.askingPriceSource === "estimated") missingData.push("Precio de compra real.");
  if (!profile.cadastral.found) missingData.push("Referencia catastral confirmada.");
  if (profile.cadastral.unitAmbiguous)
    missingData.push(
      `Planta y puerta del inmueble, o su superficie real (la referencia agrupa ${profile.cadastral.unitCount ?? "varios"} inmuebles).`,
    );
  if (!profile.property.bedrooms) missingData.push("Distribución actual (dormitorios, baños) o plano.");
  if (urbanism.demo) missingData.push("Consulta urbanística oficial de la parcela.");
  const obviousFirst = strategies.find((s) => s.id === "flip_integral" || s.id === "buy_hold");
  const notObvious = top && obviousFirst && top.id !== obviousFirst.id;
  const thesisParts: string[] = [];
  // Data that cannot be trusted comes first: no figure below is operative until it is resolved.
  const dataAlerts = risk.findings.filter(
    (f) =>
      (f.agent === "data_integrity" || f.agent === "anomaly") &&
      (f.severity === "high" || f.severity === "critical"),
  );
  if (top && dataAlerts.length)
    thesisParts.push(
      `Aviso: ${dataAlerts
        .map((f) => f.title.toLowerCase())
        .slice(0, 3)
        .join("; ")}. Las cifras que siguen no son operativas hasta resolverlo.`,
    );
  if (top) {
    thesisParts.push(`La vía más defendible es «${top.label}»: ${top.whyRanked.slice(0, 3).join(" ")}`);
    if (notObvious)
      thesisParts.push(
        `La estrategia obvia («${obviousFirst.label}») queda por detrás: ${obviousFirst.whyRanked[0] ?? ""}`,
      );
    if (top.applicability.conditional)
      thesisParts.push(
        `Depende de ${top.applicability.requiredChecks.filter((c) => c.blocking).length} comprobaciones bloqueantes antes de darla por viable.`,
      );
    thesisParts.push(`Mercado: ${market.askingVsValue.note} ${gap.summary}`);
    thesisParts.push(
      `Riesgo ${labelRisk(risk.overall)}: ${
        risk.findings
          .filter((f) => f.severity === "high" || f.severity === "critical")
          .map((f) => f.title)
          .slice(0, 2)
          .join("; ") || "sin hallazgos altos"
      }.`,
    );
  }
  const warnings = risk.findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .map((f) => f.title);
  if (investor.maxEquityPerDeal && top && (top.headline.equityRequired ?? 0) > investor.maxEquityPerDeal)
    warnings.push("La mejor vía requiere más capital del que has fijado por operación.");
  return {
    headline,
    thesis: thesisParts.join(" "),
    topStrategyId: top?.id ?? null,
    whyFirst: top?.whyRanked ?? [],
    futures,
    missingData,
    warnings,
    narrativeSource: "template",
  };
}
