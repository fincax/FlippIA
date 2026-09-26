import { handle, jsonOk } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { markAlertRead } from "@/server/services/alerts";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  await markAlertRead(ctx, id);
  return jsonOk({ read: id });
});
