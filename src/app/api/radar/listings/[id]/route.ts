import { z } from "zod";
import { handle, jsonOk } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { withdrawListing } from "@/server/services/listings";

const paramsSchema = z.object({ id: z.string().min(1).max(100) });

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = paramsSchema.parse(await params);
  await withdrawListing(ctx, id);
  return jsonOk({ withdrawn: id });
});
