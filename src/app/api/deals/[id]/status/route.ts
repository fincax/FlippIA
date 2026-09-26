import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { updateDealStatus } from "@/server/services/deals";

const schema = z.object({
  status: z.enum(["draft", "analyzed", "watching", "rejected", "approved", "acquired", "project", "closed"]),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  const { status } = schema.parse(await readJson(req));
  await updateDealStatus(ctx, id, status);
  return jsonOk({ status });
});
