import { handle, jsonOk, readJson } from "@/lib/api";
import { requireMutation, tenantContext } from "@/server/auth/current";
import { addComparables, comparablesBatchSchema, listComparables } from "@/server/services/comparables";
import { z } from "zod";

const filterSchema = z.object({
  microzoneId: z.string().max(100).optional(),
  kind: z.enum(["sale", "rent"]).optional(),
});

export const GET = handle(async (req: Request) => {
  const { ctx } = await tenantContext();
  const url = new URL(req.url);
  const filter = filterSchema.parse({
    microzoneId: url.searchParams.get("microzoneId") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
  });
  return jsonOk(await listComparables(ctx, filter));
});

export const POST = handle(async (req: Request) => {
  const { ctx } = await requireMutation();
  const body = comparablesBatchSchema.parse(await readJson(req));
  const rows = await addComparables(ctx, body.comparables);
  return jsonOk({ inserted: rows.length, comparables: rows }, { status: 201 });
});
