import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api";
import { computeMaximumAcquisitionPrice } from "@/modules/engines/financial";
import { requireMutation } from "@/server/auth/current";
import { getScenarioSet } from "@/server/services/scenarios";

const schema = z.object({
  strategyId: z.string().min(1),
  constraints: z.object({
    minimumRoe: z.number().min(0).max(5).optional(),
    minimumProfit: z.number().min(0).max(1e9).optional(),
    minimumMargin: z.number().min(0).max(1).optional(),
    maximumCapital: z.number().min(0).max(1e9).optional(),
    maximumLtc: z.number().min(0).max(1).optional(),
    maximumDuration: z.number().int().min(1).max(480).optional(),
  }),
});

/** Maximum acquisition price: deterministic solver over the strategy's base inputs. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  const { strategyId, constraints } = schema.parse(await readJson(req));
  const set = await getScenarioSet(ctx, id, strategyId);
  return jsonOk(computeMaximumAcquisitionPrice(set.base, constraints));
});
