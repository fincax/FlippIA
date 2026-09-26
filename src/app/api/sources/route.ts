import { handle, jsonOk } from "@/lib/api";
import { sourceStatuses } from "@/modules/adapters/registry";
import { tenantContext } from "@/server/auth/current";

export const GET = handle(async () => {
  await tenantContext();
  return jsonOk(await sourceStatuses());
});
