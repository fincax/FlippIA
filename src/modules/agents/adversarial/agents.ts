import { labelRisk } from "@/lib/labels";
import type {
  AdversarialFinding,
  MarketAssessment,
  PropertyProfile,
  RiskAssessment,
  StrategyResult,
  UrbanismAssessment,
} from "@/modules/analysis/types";
import type { StressReport } from "@/modules/engines/financial";
import type { AgentDefinition } from "../runtime/types";
import { optionalOutput, output } from "../runtime/types";

type Findings = { findings: AdversarialFinding[]; summary: string };

const f = (
  agent: string,
  severity: AdversarialFinding["severity"],
  title: string,
  detail: string,
  strategyIds?: string[],
): AdversarialFinding => ({ agent, severity, title, detail, strategyIds });

/** Devil's Advocate: tries to prove the deal is bad using the numbers themselves. */
export const devilsAdvocateAgent: AgentDefinition<Findings> = {
  type: "risk.devils_advocate",
  label: "Risk intentando romper la inversión",
  domain: "risk",
  description: "Busca los argumentos más fuertes en contra de la operación.",
  dependsOn: ["investment.strategies"],
  async run(ctx) {
    const strategies = output<StrategyResult[]>(ctx, "investment.strategies");
    const market = output<MarketAssessment>(ctx, "market.valuation");
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const out: AdversarialFinding[] = [];
    const best = [...strategies]
      .filter((s) => s.applicability.applicable)
      .sort((a, b) => (b.headline.netProfit ?? 0) - (a.headline.netProfit ?? 0))[0];
    if (!best)
      return {
        findings: [
          f(
            "devils_advocate",
            "critical",
            "Ninguna estrategia aplicable",
            "No hay ninguna vía con beneficio positivo para este activo con los datos disponibles.",
          ),
        ],
        summary: "Sin estrategias",
      };
    const margin = best.headline.margin ?? 0;
    if (best.exitKind === "sale" && margin < 0.08)
      out.push(
        f(
          "devils_advocate",
          margin < 0.03 ? "critical" : "high",
          "Margen fino en la mejor estrategia",
          `La mejor vía (${best.label}) deja un margen del ${(margin * 100).toFixed(1)} % sobre ventas: una desviación normal de obra o precio lo consume.`,
          [best.id],
        ),
      );
    if (market.askingVsValue.discount < -0.05)
      out.push(
        f(
          "devils_advocate",
          "high",
          "Se paga por encima del mercado sin reformar",
          `El precio solicitado supera en ${Math.abs(market.askingVsValue.discount * 100).toFixed(0)} % el valor as-is estimado: el beneficio depende íntegramente de la transformación.`,
        ),
      );
    if (profile.property.yearBuilt && profile.property.yearBuilt < 1950)
      out.push(
        f(
          "devils_advocate",
          "medium",
          "Edificio antiguo: riesgo de estructura e instalaciones comunes",
          `Construcción de ${profile.property.yearBuilt}: forjados, saneamiento y fachada pueden exigir obra no presupuestada o derramas de comunidad.`,
        ),
      );
    if (market.liquidity.level === "low")
      out.push(
        f(
          "devils_advocate",
          "medium",
          "Liquidez baja",
          `Comercialización estimada en ${market.liquidity.daysToSell} días; cada mes extra cuesta intereses y tenencia.`,
        ),
      );
    const conditionalTop = strategies.filter((s) => s.applicability.conditional && s.rank === 0);
    if (conditionalTop.length)
      out.push(
        f(
          "devils_advocate",
          "medium",
          "Las vías más rentables dependen de comprobaciones",
          `${conditionalTop.map((s) => s.label).join(", ")}: sin validación técnica/jurídica, el escenario no es ejecutable.`,
          conditionalTop.map((s) => s.id),
        ),
      );
    if (out.length === 0)
      out.push(
        f(
          "devils_advocate",
          "low",
          "Sin objeciones estructurales",
          "Los argumentos en contra son los habituales: ejecución, plazo y precio de salida.",
        ),
      );
    return { findings: out, summary: `${out.length} objeciones` };
  },
};

/** Regulatory Conflict Agent: strategy vs urbanism findings. */
export const regulatoryConflictAgent: AgentDefinition<Findings> = {
  type: "risk.regulatory_conflict",
  label: "Conflictos normativos buscados",
  domain: "risk",
  description: "Cruza estrategias con restricciones urbanísticas y normativas.",
  dependsOn: ["investment.strategies"],
  async run(ctx) {
    const strategies = output<StrategyResult[]>(ctx, "investment.strategies");
    const urbanism = output<UrbanismAssessment>(ctx, "urbanism.synthesis");
    const out: AdversarialFinding[] = [];
    const heavy = urbanism.planning.protectionLevel === "A" || urbanism.planning.protectionLevel === "B";
    for (const s of strategies) {
      if (heavy && (s.transformation.level === "integral" || s.transformation.level === "change_of_use"))
        out.push(
          f(
            "regulatory_conflict",
            "high",
            `${s.label} frente a protección ${urbanism.planning.protectionLevel}`,
            "Una intervención integral en un edificio con protección alta puede no ser autorizable o exigir conservación de distribución y elementos.",
            [s.id],
          ),
        );
      if (s.id === "change_of_use" && urbanism.planning.groundFloorResidential === "conditioned")
        out.push(
          f(
            "regulatory_conflict",
            "medium",
            "Cambio de uso condicionado por la ordenanza",
            "El uso residencial en planta baja está condicionado: habitabilidad y compatibilidad deben confirmarse antes de contar con esta vía.",
            [s.id],
          ),
        );
      if (s.id === "tourist_rental")
        out.push(
          f(
            "regulatory_conflict",
            "high",
            "Explotación turística sujeta a saturación y a la comunidad",
            "Sin comprobar el umbral municipal de VFT y la autorización de la junta, los ingresos turísticos no pueden asumirse.",
            [s.id],
          ),
        );
    }
    const blocking = urbanism.requiredChecks.filter((c) => c.blocking);
    if (blocking.length)
      out.push(
        f(
          "regulatory_conflict",
          "medium",
          `${blocking.length} comprobaciones bloqueantes`,
          blocking.map((c) => c.label).join("; "),
        ),
      );
    const unverified = urbanism.applicableRuleIds.length;
    if (unverified)
      out.push(
        f(
          "regulatory_conflict",
          "low",
          "Normativa identificada, no verificada documentalmente",
          `${unverified} referencias normativas en el snapshot; varias con estado INFERRED o REVIEW_REQUIRED.`,
        ),
      );
    return { findings: out, summary: `${out.length} conflictos potenciales` };
  },
};

/** Data Integrity Agent: consistency and provenance. */
export const dataIntegrityAgent: AgentDefinition<Findings> = {
  type: "risk.data_integrity",
  label: "Integridad de datos comprobada",
  domain: "risk",
  description: "Detecta datos faltantes, inconsistentes o sintéticos.",
  dependsOn: ["investment.strategies"],
  async run(ctx) {
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const market = output<MarketAssessment>(ctx, "market.valuation");
    const out: AdversarialFinding[] = [];
    const evidence = ctx.evidence.all();
    const demoShare = evidence.length ? evidence.filter((e) => e.demo).length / evidence.length : 0;
    if (demoShare > 0)
      out.push(
        f(
          "data_integrity",
          demoShare > 0.5 ? "high" : "medium",
          "Parte de la evidencia es DEMO",
          `${Math.round(demoShare * 100)} % de las evidencias proceden de fuentes sintéticas de demostración. Las conclusiones no son operativas sin fuentes reales.`,
        ),
      );
    if (!profile.cadastral.found)
      out.push(
        f(
          "data_integrity",
          "medium",
          "Sin datos catastrales",
          "No se pudo confirmar superficie ni año de construcción con el Catastro.",
        ),
      );
    const userArea = profile.property.builtAreaM2;
    if (
      profile.cadastral.builtAreaM2 &&
      userArea &&
      Math.abs(profile.cadastral.builtAreaM2 - userArea) / userArea > 0.15
    )
      out.push(
        f(
          "data_integrity",
          "medium",
          "Superficie inconsistente",
          `Usuario: ${userArea} m²; Catastro: ${profile.cadastral.builtAreaM2} m². La valoración usa ${userArea} m².`,
        ),
      );
    if (profile.askingPriceSource === "estimated")
      out.push(
        f(
          "data_integrity",
          "high",
          "Sin precio de compra",
          "No se indicó precio: el análisis usa el valor de mercado sin reformar como precio de compra. Indica el precio real para resultados operativos.",
        ),
      );
    if (market.valuationRenovated.comparablesUsed.length < 4)
      out.push(
        f(
          "data_integrity",
          "medium",
          "Pocos comparables",
          `Solo ${market.valuationRenovated.comparablesUsed.length} comparables válidos.`,
        ),
      );
    if (out.length === 0)
      out.push(
        f("data_integrity", "low", "Datos consistentes", "Sin inconsistencias detectadas entre fuentes."),
      );
    return { findings: out, summary: `${out.length} hallazgos` };
  },
};

/** Assumption Challenger: which assumptions carry the result. */
export const assumptionChallengerAgent: AgentDefinition<Findings> = {
  type: "risk.assumptions",
  label: "Hipótesis cuestionadas",
  domain: "risk",
  description: "Identifica las hipótesis de las que depende el resultado y su solidez.",
  dependsOn: ["investment.strategies"],
  async run(ctx) {
    const strategies = output<StrategyResult[]>(ctx, "investment.strategies");
    const market = output<MarketAssessment>(ctx, "market.valuation");
    const out: AdversarialFinding[] = [];
    const askingComps = market.valuationRenovated.comparablesUsed.filter((c) => c.type === "asking").length;
    const total = market.valuationRenovated.comparablesUsed.length || 1;
    if (askingComps / total > 0.5)
      out.push(
        f(
          "assumption_challenger",
          "medium",
          "ARV apoyado en precios de oferta",
          `${askingComps} de ${total} comparables son precios de oferta, ajustados con un descuento del 5 %. El precio real de cierre puede ser inferior.`,
        ),
      );
    for (const s of strategies) {
      const weak = s.scenarioSet.assumptions.filter(
        (a) => a.status === "REVIEW_REQUIRED" || a.status === "UNKNOWN",
      );
      if (weak.length)
        out.push(
          f(
            "assumption_challenger",
            "medium",
            `${s.label}: ${weak.length} hipótesis sin respaldo`,
            weak.map((a) => a.label).join(", "),
            [s.id],
          ),
        );
      const uplift = s.scenarioSet.assumptions.find(
        (a) => a.path === "exit.salePrice" && a.source === "engine",
      );
      if (uplift)
        out.push(
          f(
            "assumption_challenger",
            "low",
            `${s.label}: prima de valor hipotética`,
            uplift.note ?? "Precio de salida derivado de una hipótesis del motor.",
            [s.id],
          ),
        );
    }
    return { findings: out, summary: `${out.length} hipótesis cuestionadas` };
  },
};

/** Anomaly Agent: outliers vs microzone. */
export const anomalyAgent: AgentDefinition<Findings> = {
  type: "risk.anomaly",
  label: "Anomalías buscadas",
  domain: "risk",
  description: "Detecta valores fuera de rango frente a la microzona.",
  dependsOn: ["market.valuation"],
  async run(ctx) {
    const market = output<MarketAssessment>(ctx, "market.valuation");
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const out: AdversarialFinding[] = [];
    const ppm2 = profile.askingPrice / Math.max(1, profile.property.builtAreaM2);
    const ref = market.valuationUnrenovated.pricePerM2.point;
    if (ref > 0 && ppm2 < ref * 0.7)
      out.push(
        f(
          "anomaly",
          "medium",
          "Precio anormalmente bajo",
          `${Math.round(ppm2)} €/m² frente a ${ref} €/m² sin reformar en la zona: comprobar cargas, ocupación, estado estructural o situación jurídica.`,
        ),
      );
    if (ref > 0 && ppm2 > market.valuationRenovated.pricePerM2.point * 1.1)
      out.push(
        f(
          "anomaly",
          "high",
          "Precio por encima del reformado",
          `${Math.round(ppm2)} €/m² supera el €/m² reformado de la zona.`,
        ),
      );
    const spread = market.valuationRenovated.pricePerM2.high - market.valuationRenovated.pricePerM2.low;
    if (ref > 0 && spread / ref > 0.35)
      out.push(
        f(
          "anomaly",
          "low",
          "Alta dispersión de comparables",
          "El rango intercuartílico es amplio: la valoración es menos precisa.",
        ),
      );
    return { findings: out, summary: out.length ? `${out.length} anomalías` : "Sin anomalías" };
  },
};

/** Risk Orchestrator → Risk synthesis (stress per strategy + all adversarial findings). */
export const riskSynthesisAgent: AgentDefinition<RiskAssessment> = {
  type: "risk.synthesis",
  label: "Riesgo consolidado",
  domain: "risk",
  description: "Consolida stress tests y hallazgos adversariales.",
  dependsOn: [
    "risk.devils_advocate",
    "risk.regulatory_conflict",
    "risk.data_integrity",
    "risk.assumptions",
    "risk.anomaly",
  ],
  async run(ctx) {
    const strategies = output<StrategyResult[]>(ctx, "investment.strategies");
    const findings = [
      "risk.devils_advocate",
      "risk.regulatory_conflict",
      "risk.data_integrity",
      "risk.assumptions",
      "risk.anomaly",
    ].flatMap((t) => optionalOutput<Findings>(ctx, t)?.findings ?? []);
    const stressByStrategy: Record<string, StressReport> = {};
    for (const s of strategies) if (s.stress) stressByStrategy[s.id] = s.stress;
    const critical = findings.filter((x) => x.severity === "critical").length;
    const high = findings.filter((x) => x.severity === "high").length;
    const overall: RiskAssessment["overall"] =
      critical > 0 || high >= 3 ? "high" : high > 0 ? "medium" : "low";
    return {
      stressByStrategy,
      findings,
      overall,
      summary: `${findings.length} hallazgos (${critical} críticos, ${high} altos). Riesgo global ${labelRisk(overall)}.`,
    };
  },
};
