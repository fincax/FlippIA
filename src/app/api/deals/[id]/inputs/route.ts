import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api";
import { professionalInputRevertSchema, professionalInputSetSchema } from "@/modules/inputs";
import { requireMutation } from "@/server/auth/current";
import { revertProfessionalInput, setProfessionalInput } from "@/server/services/inputs";

const action = z.object({ action: z.enum(["set", "revert"]) });

/** Professional inputs: record a value a professional knows better than the estimate, or revert to the estimate. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  const body = await readJson<unknown>(req);
  const kind = action.parse(body).action;
  if (kind === "set") {
    const r = await setProfessionalInput(ctx, id, professionalInputSetSchema.parse(body));
    return jsonOk({
      input: r.input,
      previous: r.previous,
      estimate: r.estimate,
      applied: r.applied,
      rejected: r.rejected.map((x) => ({ strategyId: x.strategyId ?? null, reason: x.reason })),
    });
  }
  const r = await revertProfessionalInput(ctx, id, professionalInputRevertSchema.parse(body));
  return jsonOk({ reverted: r.reverted });
});
