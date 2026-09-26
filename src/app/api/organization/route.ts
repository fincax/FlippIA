import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api";
import { requireMutation } from "@/server/auth/current";
import { SESSION_COOKIE } from "@/server/auth/session";
import { deleteOrganization } from "@/server/services/organization";

const schema = z.object({ confirmSlug: z.string().min(1).max(100) });

/** Deletes the caller's organization and all its data (owner only, slug confirmation). */
export const DELETE = handle(async (req: Request) => {
  const { ctx } = await requireMutation();
  const { confirmSlug } = schema.parse(await readJson(req));
  const result = await deleteOrganization(ctx, confirmSlug);
  const res = jsonOk(result);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
