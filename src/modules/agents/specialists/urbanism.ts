import type {
  PropertyProfile,
  RequiredCheck,
  UrbanismAssessment,
  UrbanismFinding,
} from "@/modules/analysis/types";
import type { PlanningInfo } from "@/modules/adapters/urbanismo-sevilla/types";
import { buildConfidence, worstStatus } from "@/modules/core/evidence-status";
import type { RegulatorySnapshot } from "@/modules/regulatory";
import type { AgentContext, AgentDefinition } from "../runtime/types";
import { optionalOutput, output } from "../runtime/types";

interface SubFinding {
  findings: UrbanismFinding[];
  checks: RequiredCheck[];
  summary: string;
}

const isCommercial = (ctx: AgentContext) =>
  output<PropertyProfile>(ctx, "data.catastro").property.assetUse !== "residential";
const ruleIds = (ctx: AgentContext, ...topics: string[]) =>
  (optionalOutput<RegulatorySnapshot>(ctx, "regulatory.snapshot")?.entries ?? [])
    .filter((e) => e.topics.some((t) => topics.includes(t)))
    .map((e) => e.regulationId);

/** Planning record used when no source answered: nothing is asserted, everything requires verification. */
export function unknownPlanning(planningInstrument: string, reason: string): PlanningInfo {
  return {
    planningInstrument,
    zoningCode: "",
    zoningLabel: "Calificación no consultada",
    maxFloors: null,
    groundFloorResidential: "unknown",
    allowedUses: [],
    conditionedUses: [],
    forbiddenUses: [],
    protectionLevel: "unknown",
    catalogued: false,
    inHistoricCentre: false,
    knownFiles: [],
    notes: [
      `La fuente de planeamiento no ha respondido (${reason}). Verificar calificación y protección en la Gerencia de Urbanismo.`,
    ],
    status: "UNKNOWN",
  };
}

/** Urbanism Orchestrator → Planning Agent: fetches parcel planning data. */
export const planningAgent: AgentDefinition<{
  planning: PlanningInfo;
  evidenceIds: string[];
  summary: string;
}> = {
  type: "urbanism.planning",
  label: "Planeamiento consultado",
  domain: "urbanism",
  description: "Consulta calificación, ordenanza y protección de la parcela.",
  dependsOn: ["data.catastro", "regulatory.snapshot"],
  /** Public geoservices: ten layers in parallel, some of them slow. */
  timeoutMs: 45_000,
  async run(ctx) {
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const res = await ctx.tool("urbanism.query", { microzoneId: profile.microzone.id }, () =>
      ctx.adapters.urbanism.query({
        point: profile.property.coordinates,
        address: profile.property.address.raw,
        cadastralRef: profile.property.cadastralRef,
        microzoneId: profile.microzone.id,
      }),
    );
    if (!res.ok) {
      // A public service that is down must not sink the analysis: continue with an
      // explicitly unknown planning record; every downstream check becomes REVIEW_REQUIRED.
      ctx.progress(`Planeamiento no disponible: ${res.error.message}`);
      const planning = unknownPlanning(ctx.city.urbanism.planningInstrument, res.error.message);
      return { planning, evidenceIds: [], summary: "Planeamiento no consultado: fuente no disponible." };
    }
    const evs = ctx.evidence.addMany(res.value.evidence);
    ctx.progress(`Ordenanza ${res.value.data.zoningCode} · protección ${res.value.data.protectionLevel}`);
    return {
      planning: res.value.data,
      evidenceIds: evs.map((e) => e.id),
      summary: `${res.value.data.zoningLabel}, protección ${res.value.data.protectionLevel}`,
    };
  },
};

export const zoningAgent: AgentDefinition<SubFinding> = {
  type: "urbanism.zoning",
  label: "Usos compatibles",
  domain: "urbanism",
  description: "Zoning / Land Use Agent: usos admitidos, condicionados y prohibidos.",
  dependsOn: ["urbanism.planning"],
  async run(ctx) {
    const { planning } = output<{ planning: PlanningInfo }>(ctx, "urbanism.planning");
    const ids = ruleIds(ctx, "zoning", "land_use");
    const findings: UrbanismFinding[] = [
      {
        key: "zoning",
        title: `Zona de ordenanza ${planning.zoningCode} — ${planning.zoningLabel}`,
        detail: `Altura máxima ${planning.maxFloors ?? "n/d"} plantas. ${planning.notes[0] ?? ""}`,
        status: planning.status,
        kind: "info",
        regulationIds: ids,
      },
      {
        key: "uses",
        title: "Usos",
        detail: `Admitidos: ${planning.allowedUses.join("; ")}. Condicionados: ${planning.conditionedUses.join("; ") || "ninguno"}. Prohibidos: ${planning.forbiddenUses.join("; ")}.`,
        status: planning.status,
        kind: "info",
        regulationIds: ids,
      },
    ];
    return { findings, checks: [], summary: planning.zoningLabel };
  },
};

export const protectionAgent: AgentDefinition<SubFinding> = {
  type: "urbanism.protection",
  label: "Protección y patrimonio",
  domain: "urbanism",
  description: "Protection / Heritage Agent: nivel de catalogación y sus límites.",
  dependsOn: ["urbanism.planning"],
  async run(ctx) {
    const { planning } = output<{ planning: PlanningInfo }>(ctx, "urbanism.planning");
    const ids = ruleIds(ctx, "heritage", "protection");
    const findings: UrbanismFinding[] = [];
    const checks: RequiredCheck[] = [];
    if (!planning.inHistoricCentre) {
      findings.push({
        key: "protection",
        title: "Fuera del Conjunto Histórico",
        detail: "No consta protección patrimonial específica en la fuente consultada.",
        status: planning.status,
        kind: "info",
        regulationIds: ids,
      });
      return { findings, checks, summary: "Sin protección identificada" };
    }
    const heavy =
      planning.protectionLevel === "A" ||
      planning.protectionLevel === "B" ||
      planning.protectionLevel === "BIC";
    findings.push({
      key: "protection",
      title: `Conjunto Histórico · protección ${planning.protectionLevel}`,
      detail: heavy
        ? "Nivel de protección alto: demoliciones y alteraciones de fachada, estructura o distribución original están muy limitadas. Requiere informe patrimonial."
        : planning.protectionLevel === "none"
          ? "Edificio no catalogado según la fuente; el entorno sí está protegido (condiciones estéticas de fachada)."
          : "Protección parcial: reforma interior admisible conservando elementos catalogados.",
      status: "REVIEW_REQUIRED",
      kind: heavy ? "constraint" : "info",
      regulationIds: ids,
    });
    checks.push({
      key: "heritage_catalogue",
      label: `Verificar ficha de catálogo (${planning.heritageSector ?? "sector"})`,
      why: "El nivel de protección determina qué intervenciones son autorizables.",
      who: "architect",
      blocking: heavy,
      topic: "heritage",
    });
    return { findings, checks, summary: `Protección ${planning.protectionLevel}` };
  },
};

export const licenceAgent: AgentDefinition<SubFinding> = {
  type: "urbanism.licence",
  label: "Régimen de licencia",
  domain: "urbanism",
  description: "Licence / Responsible Declaration Agent: qué trámite aplica a cada intervención.",
  dependsOn: ["urbanism.planning"],
  async run(ctx) {
    const { planning } = output<{ planning: PlanningInfo }>(ctx, "urbanism.planning");
    const ids = ruleIds(ctx, "licence", "responsible_declaration");
    const findings: UrbanismFinding[] = [
      {
        key: "licence_light",
        title: "Reforma interior sin afección estructural",
        detail:
          "Declaración responsable conforme a la LISTA y la ordenanza municipal; obra inmediata tras la presentación con documentación técnica.",
        status: "INFERRED",
        kind: "opportunity",
        regulationIds: ids,
      },
      {
        key: "licence_project",
        title: "Cambio de uso, división o afección estructural",
        detail: "Licencia de obras con proyecto (LOE art. 2); plazos municipales de varios meses.",
        status: "INFERRED",
        kind: "info",
        regulationIds: ids,
      },
    ];
    if (planning.knownFiles.length)
      findings.push({
        key: "files",
        title: "Expedientes municipales conocidos",
        detail: planning.knownFiles
          .map((f) => `${f.type} ${f.reference} (${f.status}, ${f.date})`)
          .join("; "),
        status: planning.status,
        kind: "info",
        regulationIds: [],
      });
    return {
      findings,
      checks: [
        {
          key: "licence_scope",
          label: "Confirmar trámite aplicable con el técnico",
          why: "El alcance real de la obra decide entre declaración responsable y licencia.",
          who: "architect",
          blocking: false,
          topic: "licence",
        },
      ],
      summary: "Declaración responsable / licencia según alcance",
    };
  },
};

export const changeOfUseAgent: AgentDefinition<SubFinding> = {
  type: "urbanism.change_of_use",
  label: "Cambio de uso evaluado",
  domain: "urbanism",
  description: "Change-of-Use Agent: viabilidad preliminar de convertir un local en vivienda.",
  dependsOn: ["urbanism.planning"],
  when: (ctx) => isCommercial(ctx),
  async run(ctx) {
    const { planning } = output<{ planning: PlanningInfo }>(ctx, "urbanism.planning");
    const ids = ruleIds(ctx, "change_of_use", "habitability", "horizontal_property");
    const gf = planning.groundFloorResidential;
    const findings: UrbanismFinding[] = [
      {
        key: "change_of_use",
        title:
          gf === "forbidden"
            ? "Uso residencial en planta baja no admitido"
            : gf === "allowed"
              ? "Uso residencial en planta baja admitido por la ordenanza"
              : "Uso residencial en planta baja condicionado",
        detail:
          gf === "forbidden"
            ? "La ordenanza mantiene el uso terciario en planta baja: el cambio de uso requeriría modificación de planeamiento."
            : "Se ha detectado potencial de cambio de uso. La viabilidad queda condicionada a habitabilidad (altura libre, ventilación, patio), estatutos de la comunidad y licencia con proyecto.",
        status: "REVIEW_REQUIRED",
        kind: gf === "forbidden" ? "constraint" : "opportunity",
        regulationIds: ids,
      },
    ];
    const checks: RequiredCheck[] =
      gf === "forbidden"
        ? []
        : [
            {
              key: "pgou_compatibility",
              label: "Compatibilidad de uso según PGOU y ordenanza de zona",
              why: "Condición previa de cualquier licencia de cambio de uso.",
              who: "architect",
              blocking: true,
              topic: "zoning",
            },
            {
              key: "habitability",
              label: "Habitabilidad: altura libre, ventilación, iluminación, patio",
              why: "Los locales suelen incumplir; sin ello no hay licencia de ocupación.",
              who: "architect",
              blocking: true,
              topic: "habitability",
            },
            {
              key: "lph_statutes",
              label: "Estatutos de la comunidad y modificación del título constitutivo",
              why: "Pueden prohibir o exigir acuerdo de la junta.",
              who: "lawyer",
              blocking: true,
              topic: "horizontal_property",
            },
          ];
    return { findings, checks, summary: findings[0]!.title };
  },
};

export const tourismAgent: AgentDefinition<SubFinding> = {
  type: "urbanism.tourism",
  label: "Uso turístico evaluado",
  domain: "urbanism",
  description: "Tourism Agent: limitaciones a viviendas de uso turístico en la zona.",
  dependsOn: ["urbanism.planning"],
  when: (ctx) => !isCommercial(ctx),
  async run(ctx) {
    const { planning } = output<{ planning: PlanningInfo }>(ctx, "urbanism.planning");
    const ids = ruleIds(ctx, "tourism");
    return {
      findings: [
        {
          key: "tourism",
          title: "Vivienda de uso turístico",
          detail: planning.inHistoricCentre
            ? "Zona con alta densidad de viviendas turísticas: la regulación municipal puede considerar el barrio saturado. Además, la comunidad debe autorizar expresamente la actividad (LPH art. 17.12)."
            : "La regulación municipal de viviendas turísticas está en evolución; comprobar umbrales por barrio antes de asumir explotación turística.",
          status: "REVIEW_REQUIRED",
          kind: "info",
          regulationIds: ids,
        },
      ],
      checks: [
        {
          key: "vft_check",
          label: "Comprobar saturación de VFT del barrio y autorización de la comunidad",
          why: "Sin ambas no puede asumirse la explotación turística.",
          who: "municipality",
          blocking: false,
          topic: "tourism",
        },
      ],
      summary: "Turístico: condicionado",
    };
  },
};

/** Urbanism Orchestrator → synthesis of the specialist findings into the structured assessment. */
export const urbanismSynthesisAgent: AgentDefinition<UrbanismAssessment> = {
  type: "urbanism.synthesis",
  label: "Urbanismo revisado",
  domain: "urbanism",
  description: "Consolida hallazgos, restricciones, oportunidades y comprobaciones pendientes.",
  dependsOn: [
    "urbanism.zoning",
    "urbanism.protection",
    "urbanism.licence",
    "urbanism.change_of_use",
    "urbanism.tourism",
  ],
  async run(ctx) {
    const { planning, evidenceIds } = output<{ planning: PlanningInfo; evidenceIds: string[] }>(
      ctx,
      "urbanism.planning",
    );
    const subs = [
      "urbanism.zoning",
      "urbanism.protection",
      "urbanism.licence",
      "urbanism.change_of_use",
      "urbanism.tourism",
    ]
      .map((t) => optionalOutput<SubFinding>(ctx, t))
      .filter((s): s is SubFinding => Boolean(s));
    const findings = subs.flatMap((s) => s.findings);
    const requiredChecks = dedupe(subs.flatMap((s) => s.checks));
    const constraints = findings.filter((f) => f.kind === "constraint").map((f) => f.title);
    const opportunities = findings.filter((f) => f.kind === "opportunity").map((f) => f.title);
    const status = worstStatus([planning.status, ...findings.map((f) => f.status)]);
    const confidence = buildConfidence(
      [
        {
          key: "sourceQuality",
          weight: 3,
          score:
            ctx.adapters.urbanism.mode === "demo"
              ? 0.25
              : ctx.adapters.urbanism.mode === "official"
                ? 0.9
                : 0.6,
          note: `Fuente urbanística en modo ${ctx.adapters.urbanism.mode}.`,
        },
        {
          key: "verification",
          weight: 2,
          score: 0.2,
          note: "Sin revisión de arquitecto ni consulta urbanística previa.",
        },
        {
          key: "recency",
          weight: 1,
          score: 0.7,
          note: `Última actualización de la fuente: ${planning.freshness ?? "n/d"}.`,
        },
      ],
      "Confianza del análisis urbanístico.",
    );
    const snapshot = optionalOutput<RegulatorySnapshot>(ctx, "regulatory.snapshot");
    return {
      status,
      planning,
      applicableRuleIds: snapshot?.entries.map((e) => e.regulationId) ?? [],
      findings,
      constraints,
      opportunities,
      requiredChecks,
      confidence,
      humanReviewRequired: true,
      summary: `${planning.zoningLabel}; protección ${planning.protectionLevel}; ${requiredChecks.filter((c) => c.blocking).length} comprobaciones bloqueantes, ${requiredChecks.length} en total.`,
      demo: ctx.adapters.urbanism.mode === "demo" || evidenceIds.length === 0,
    };
  },
};

function dedupe(checks: RequiredCheck[]): RequiredCheck[] {
  const seen = new Map<string, RequiredCheck>();
  for (const c of checks) {
    const prev = seen.get(c.key);
    if (!prev || (c.blocking && !prev.blocking)) seen.set(c.key, c);
  }
  return [...seen.values()];
}
