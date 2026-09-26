import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import {
  createCustomScenario,
  overridesSchema,
  updateScenarioBase,
  whatIf,
} from "@/server/services/scenarios";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update_base"), strategyId: z.string().min(1), overrides: overridesSchema }),
  z.object({
    action: z.literal("custom"),
    strategyId: z.string().min(1),
    name: z.string().min(1).max(60),
    overrides: overridesSchema,
  }),
  z.object({
    action: z.literal("what_if"),
    strategyId: z.string().min(1),
    overrides: overridesSchema,
    fromScenarioId: z.string().optional(),
  }),
]);

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  const body = schema.parse(await readJson(req));
  if (body.action === "update_base")
    return jsonOk(await updateScenarioBase(ctx, id, body.strategyId, body.overrides));
  if (body.action === "custom")
    return jsonOk(await createCustomScenario(ctx, id, body.strategyId, body.name, body.overrides));
  const r = await whatIf(ctx, id, body.strategyId, body.overrides, body.fromScenarioId);
  return jsonOk({
    from: r.from.id,
    metrics: r.result.metrics,
    totals: r.result.totals,
    cashflows: r.result.cashflows,
  });
});
