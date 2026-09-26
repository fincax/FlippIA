import { handle, jsonOk } from "@/lib/api";
import { sourceStatuses } from "@/modules/adapters/registry";
import { tenantContext } from "@/server/auth/current";
import { requireRole } from "@/server/context";

export const GET = handle(async () => {
  const { ctx } = await tenantContext();
  requireRole(ctx, "admin");
  return jsonOk(await sourceStatuses());
});
