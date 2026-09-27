import { handle, jsonOk } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { deleteComparable } from "@/server/services/comparables";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().min(1).max(100) });

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = paramsSchema.parse(await params);
  await deleteComparable(ctx, id);
  return jsonOk({ deleted: id });
});
