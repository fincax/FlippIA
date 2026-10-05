import { z } from "zod";
import { PROFESSIONAL_INPUT_REGISTRY } from "./registry";
import { PROFESSIONAL_INPUT_KEYS, PROFESSIONAL_SOURCE_TYPES, type ProfessionalInputUnit } from "./types";

const MAX_CURRENCY = 1e9;

function checkValue(unit: ProfessionalInputUnit, value: number): string | null {
  if (!Number.isFinite(value)) return "El valor debe ser un número.";
  if (value < 0) return "El valor no puede ser negativo.";
  switch (unit) {
    case "currency":
      if (value > MAX_CURRENCY) return "Importe fuera de rango.";
      if (Math.round(value * 100) / 100 !== value) return "Máximo dos decimales.";
      return null;
    case "ratio":
      return value > 1 ? "Un ratio va de 0 a 1." : null;
    case "months":
      return !Number.isInteger(value) || value > 480 ? "Meses: entero entre 0 y 480." : null;
    case "number":
      return null;
  }
}

const marginRate = z.number().finite().min(0).max(1);

const breakdownLine = z.object({
  label: z.string().trim().min(1).max(60),
  amount: z.number().finite().min(0).max(MAX_CURRENCY),
  marginRate: marginRate.optional(),
});

const issuer = z.object({
  kind: z.enum(["self", "technician"]),
  name: z.string().trim().max(120).optional(),
});

const scoped = z.object({
  key: z.enum(PROFESSIONAL_INPUT_KEYS),
  strategyId: z.string().trim().min(1).max(64).optional(),
});

function checkScope(
  v: { key: (typeof PROFESSIONAL_INPUT_KEYS)[number]; strategyId?: string },
  ctx: z.RefinementCtx,
) {
  const def = PROFESSIONAL_INPUT_REGISTRY[v.key];
  if (def.scope === "strategy" && !v.strategyId)
    ctx.addIssue({ code: "custom", path: ["strategyId"], message: `${def.label} se indica por estrategia.` });
  if (def.scope === "deal" && v.strategyId)
    ctx.addIssue({ code: "custom", path: ["strategyId"], message: `${def.label} aplica a todo el deal.` });
}

/**
 * Body of `set`: validated against the key's unit and scope. No arbitrary
 * real-estate ranges. `value` is the net figure; the commercial margin is
 * added on top. The figure is accepted only under the responsibility of the
 * person entering it (`acknowledged`).
 */
export const professionalInputSetSchema = scoped
  .extend({
    value: z.number(),
    marginRate: marginRate.optional(),
    taxMode: z.enum(["excluded", "included", "not_applicable"]).optional(),
    sourceType: z.enum(PROFESSIONAL_SOURCE_TYPES),
    issuer: issuer.optional(),
    acknowledged: z.literal(true, {
      error: "Debes confirmar que el dato se aporta bajo tu responsabilidad.",
    }),
    reason: z.string().trim().max(500).optional(),
    note: z.string().trim().max(1000).optional(),
    breakdown: z.array(breakdownLine).max(20).optional(),
  })
  .superRefine((v, ctx) => {
    checkScope(v, ctx);
    const def = PROFESSIONAL_INPUT_REGISTRY[v.key];
    const problem = checkValue(def.unit, v.value);
    if (problem) ctx.addIssue({ code: "custom", path: ["value"], message: problem });
    if (v.breakdown?.length) {
      const sum = Math.round(v.breakdown.reduce((a, l) => a + l.amount, 0) * 100) / 100;
      if (Math.abs(sum - v.value) > 0.5)
        ctx.addIssue({
          code: "custom",
          path: ["breakdown"],
          message: "El desglose (importes netos) debe sumar el valor indicado.",
        });
    }
    if (v.taxMode === "included" && !def.taxable)
      ctx.addIssue({ code: "custom", path: ["taxMode"], message: `${def.label} se indica sin impuestos.` });
    if (v.taxMode && v.taxMode !== "not_applicable" && def.unit !== "currency")
      ctx.addIssue({ code: "custom", path: ["taxMode"], message: `${def.label} no es un importe.` });
    if (v.issuer?.kind === "technician" && !v.issuer.name)
      ctx.addIssue({
        code: "custom",
        path: ["issuer", "name"],
        message: "Indica el técnico o la empresa que emite el dato.",
      });
  });

export const professionalInputRevertSchema = scoped
  .extend({ reason: z.string().trim().max(500).optional() })
  .superRefine(checkScope);

export type ProfessionalInputSetBody = z.infer<typeof professionalInputSetSchema>;
export type ProfessionalInputRevertBody = z.infer<typeof professionalInputRevertSchema>;
