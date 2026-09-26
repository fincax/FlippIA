import { handle, jsonOk } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { deleteWatch } from "@/server/services/watch";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  await deleteWatch(ctx, id);
  return jsonOk({ deleted: id });
});
