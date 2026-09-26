import { z } from "zod";
import { db } from "@/db/client";
import { handle, jsonError, jsonOk, readJson } from "@/lib/api";
import { rateLimit, register } from "@/server/auth";
import { clientKey, withSessionCookie } from "../_shared";

const schema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(2).max(120),
  password: z.string().min(10).max(200),
  organizationName: z.string().max(120).optional(),
});

export const POST = handle(async (req: Request) => {
  const rl = await rateLimit(db(), `register:${clientKey(req)}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return jsonError("RATE_LIMITED", "Demasiados registros desde esta conexión.", 429);
  const body = schema.parse(await readJson(req));
  const r = await register(db(), { ...body, userAgent: req.headers.get("user-agent") ?? undefined });
  if (!r.ok) return jsonError("AUTH", r.error, 400);
  return withSessionCookie(jsonOk({ userId: r.userId }), r.token, r.expiresAt);
});
