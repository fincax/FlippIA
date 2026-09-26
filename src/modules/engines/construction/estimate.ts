import { newId } from "@/modules/core/ids";
import { round0, round2 } from "@/modules/core/math";
import { buildConfidence, worstStatus } from "@/modules/core/evidence-status";
import { DEMO_COST_LIBRARY_SEVILLA, findLibraryItem } from "./library";
import type { BudgetLine, CostLibraryItem, RenovationEstimate, WorkChapter } from "./types";

export type RenovationLevel = "cosmetic" | "medium" | "integral" | "change_of_use";

export interface EstimateRequest {
  areaM2: number;
  level: RenovationLevel;
  bathrooms: number;
  bedrooms: number;
  /** Extra scope switches. */
  scope?: Partial<{
    energyRetrofit: boolean;
    accessibility: boolean;
    fireSafety: boolean;
    facade: boolean;
    facadeAreaM2: number;
  }>;
  overheadRate?: number;
  library?: CostLibraryItem[];
  now?: Date;
}

interface Quantity {
  code: string;
  quantity: number;
}

/**
 * Programmatic quantity take-off by renovation level. This is an *estimate*
 * template; a professional budget replaces it line by line at a later stage.
 */
export function quantitiesFor(req: EstimateRequest): Quantity[] {
  const a = req.areaM2;
  const q: Quantity[] = [];
  const doors = Math.max(3, req.bedrooms + 2);
  switch (req.level) {
    case "cosmetic":
      q.push(
        { code: "ACA.01", quantity: a * 2.6 },
        { code: "SOL.01", quantity: a * 0.4 },
        { code: "LIM.01", quantity: 1 },
      );
      break;
    case "medium":
      q.push(
        { code: "DEM.01", quantity: a * 0.6 },
        { code: "ELE.01", quantity: a },
        { code: "FON.01", quantity: a * 0.6 },
        { code: "SOL.01", quantity: a },
        { code: "ACA.01", quantity: a * 2.6 },
        { code: "COC.01", quantity: 1 },
        { code: "BAN.01", quantity: req.bathrooms },
        { code: "CAR.01", quantity: doors },
        { code: "LIM.01", quantity: 1 },
      );
      break;
    case "integral":
      q.push(
        { code: "DEM.01", quantity: a },
        { code: "ALB.01", quantity: a * 0.9 },
        { code: "ELE.01", quantity: a },
        { code: "FON.01", quantity: a },
        { code: "CLI.01", quantity: a },
        { code: "SOL.01", quantity: a },
        { code: "ACA.01", quantity: a * 2.8 },
        { code: "COC.01", quantity: 1 },
        { code: "BAN.01", quantity: req.bathrooms },
        { code: "CAR.01", quantity: doors },
        { code: "CAR.02", quantity: Math.max(3, Math.round(a / 15)) },
        { code: "LIM.01", quantity: 1 },
      );
      break;
    case "change_of_use":
      q.push(
        { code: "DEM.01", quantity: a },
        { code: "ALB.01", quantity: a * 1.2 },
        { code: "ELE.01", quantity: a },
        { code: "FON.01", quantity: a },
        { code: "CLI.01", quantity: a },
        { code: "SOL.01", quantity: a },
        { code: "ACA.01", quantity: a * 2.8 },
        { code: "COC.01", quantity: 1 },
        { code: "BAN.01", quantity: Math.max(1, req.bathrooms) },
        { code: "CAR.01", quantity: doors },
        { code: "CAR.02", quantity: Math.max(3, Math.round(a / 12)) },
        { code: "ENE.01", quantity: a * 0.5 },
        { code: "LIM.01", quantity: 1 },
      );
      break;
  }
  if (req.scope?.energyRetrofit && req.level !== "change_of_use")
    q.push({ code: "ENE.01", quantity: a * 0.5 });
  if (req.scope?.accessibility) q.push({ code: "ACC.01", quantity: 1 });
  if (req.scope?.fireSafety) q.push({ code: "PCI.01", quantity: 1 });
  if (req.scope?.facade) q.push({ code: "FAC.01", quantity: req.scope.facadeAreaM2 ?? a * 0.6 });
  return q;
}

export function estimateRenovation(req: EstimateRequest): RenovationEstimate {
  const library = req.library ?? DEMO_COST_LIBRARY_SEVILLA;
  const now = (req.now ?? new Date()).toISOString();
  const overheadRate = req.overheadRate ?? 0.13; // gastos generales + beneficio industrial
  const lines: BudgetLine[] = [];
  for (const { code, quantity } of quantitiesFor(req)) {
    const item = findLibraryItem(code, library);
    if (!item) continue;
    const qty = round2(quantity);
    lines.push({
      id: newId("bl"),
      code: item.code,
      chapter: item.chapter,
      label: item.label,
      quantity: qty,
      unit: item.unit,
      unitCost: item.unitCost,
      subtotal: round2(qty * item.unitCost),
      source: item.source,
      confidence: item.confidence,
      status: item.status,
      stage: "estimate",
      updatedAt: now,
    });
  }
  const materialBudget = round2(lines.reduce((a, l) => a + l.subtotal, 0));
  const overhead = round2(materialBudget * overheadRate);
  const contractBudget = round2(materialBudget + overhead);
  const chapters = new Map<WorkChapter, number>();
  for (const l of lines) chapters.set(l.chapter, (chapters.get(l.chapter) ?? 0) + l.subtotal);
  const byChapter = [...chapters.entries()]
    .map(([chapter, amount]) => ({
      chapter,
      amount: round2(amount),
      share: materialBudget ? round2(amount / materialBudget) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  const conf = buildConfidence(
    [
      {
        key: "sourceQuality",
        weight: 3,
        score: 0.5,
        note: "Biblioteca de costes DEMO; no es un presupuesto profesional.",
      },
      { key: "recency", weight: 1, score: 0.8, note: `Actualizada ${library[0]?.updatedAt ?? "n/d"}.` },
      { key: "quantity", weight: 1, score: 0.6, note: "Mediciones paramétricas por nivel de reforma." },
      { key: "verification", weight: 2, score: 0.2, note: "Sin visita técnica ni mediciones reales." },
    ],
    "Estimación paramétrica: útil para dimensionar, no para contratar.",
  );
  return {
    lines,
    byChapter,
    materialBudget,
    overheadRate,
    overhead,
    contractBudget,
    costPerM2: req.areaM2 ? round0(contractBudget / req.areaM2) : 0,
    stage: "estimate",
    library: library[0]?.source ?? "unknown",
    confidence: conf.score,
    status: worstStatus(lines.map((l) => l.status)),
    notes: [
      "Presupuesto de ejecución material estimado con biblioteca de costes DEMO.",
      `Gastos generales y beneficio industrial: ${Math.round(overheadRate * 100)} %.`,
      "IVA no incluido; el motor financiero lo aplica según reglas fiscales vigentes.",
      "Un presupuesto profesional sustituirá estas partidas antes de contratar.",
    ],
  };
}

/** Replace estimate lines with a professional budget, preserving traceability. */
export function replaceWithProfessionalBudget(
  estimate: RenovationEstimate,
  lines: BudgetLine[],
  stage: BudgetLine["stage"] = "professional_budget",
): RenovationEstimate {
  const materialBudget = round2(lines.reduce((a, l) => a + l.subtotal, 0));
  const overhead = round2(materialBudget * estimate.overheadRate);
  return {
    ...estimate,
    lines: lines.map((l) => ({ ...l, stage })),
    materialBudget,
    overhead,
    contractBudget: round2(materialBudget + overhead),
    stage,
    status: "VERIFIED",
    confidence: 0.9,
    notes: [...estimate.notes.filter((n) => !n.includes("DEMO")), `Presupuesto ${stage} incorporado.`],
  };
}
