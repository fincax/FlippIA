import { handle, jsonOk, readJson } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { recordReview, reviewSchema } from "@/server/services/reviews";

export const POST = handle(async (req: Request) => {
  const { ctx } = await requireMutation();
  const body = reviewSchema.parse(await readJson(req));
  return jsonOk(await recordReview(ctx, body));
});
