import { z } from "zod";
import { db } from "@/db/client";
import { handle, jsonError, jsonOk, readJson } from "@/lib/api";
import { login, rateLimit } from "@/server/auth";
import { clientKey, withSessionCookie } from "../_shared";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export const POST = handle(async (req: Request) => {
  const rl = rateLimit(`login:${clientKey(req)}`, 10, 10 * 60 * 1000);
  if (!rl.allowed) return jsonError("RATE_LIMITED", "Demasiados intentos. Espera unos minutos.", 429);
  const body = schema.parse(await readJson(req));
  const r = await login(db(), { ...body, userAgent: req.headers.get("user-agent") ?? undefined });
  if (!r.ok) return jsonError("AUTH", r.error, 401);
  return withSessionCookie(jsonOk({ userId: r.userId }), r.token, r.expiresAt);
});
