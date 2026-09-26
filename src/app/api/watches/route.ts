import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api";
import { requireMutation, tenantContext } from "@/server/auth/current";
import { createWatch, listWatches, watchRuleSchema } from "@/server/services/watch";

const schema = z.object({
  dealId: z.string().optional(),
  listingId: z.string().optional(),
  label: z.string().min(1).max(120),
  rules: z.array(watchRuleSchema).min(1).max(10),
});

export const GET = handle(async () => {
  const { ctx } = await tenantContext();
  return jsonOk(await listWatches(ctx));
});

export const POST = handle(async (req: Request) => {
  const { ctx } = await requireMutation();
  const body = schema.parse(await readJson(req));
  return jsonOk(await createWatch(ctx, body));
});
