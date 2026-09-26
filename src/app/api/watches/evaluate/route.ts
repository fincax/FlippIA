import { handle, jsonOk } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { evaluateWatches } from "@/server/services/watch";

/** Manual Smart Watcher pass (a scheduler calls the same service in production). */
export const POST = handle(async () => {
  const { ctx } = await requireMutation();
  return jsonOk(await evaluateWatches(ctx));
});
