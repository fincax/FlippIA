import { handle, jsonOk } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { evaluateWatches } from "@/server/services/watch";

/** Manual Smart Watcher pass for the caller's organization. The scheduled pass is POST /api/cron/watches. */
export const POST = handle(async () => {
  const { ctx } = await requireMutation();
  return jsonOk(await evaluateWatches(ctx));
});
