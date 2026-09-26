import { db } from "@/db/client";
import { handle, jsonError, jsonOk } from "@/lib/api";
import { login, rateLimit } from "@/server/auth";
import { clientKey, withSessionCookie } from "../_shared";

/** One-click demo access. Only when DEMO_MODE=true; uses the seeded demo user. */
export const POST = handle(async (req: Request) => {
  if (process.env.DEMO_MODE !== "true")
    return jsonError("DISABLED", "La demo no está habilitada en este entorno.", 403);
  const rl = rateLimit(`demo:${clientKey(req)}`, 20, 10 * 60 * 1000);
  if (!rl.allowed) return jsonError("RATE_LIMITED", "Demasiados intentos.", 429);
  const r = await login(db(), {
    email: process.env.DEMO_USER_EMAIL ?? "demo@flippia.local",
    password: process.env.DEMO_USER_PASSWORD ?? "flippia-demo",
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  if (!r.ok) return jsonError("DEMO_NOT_SEEDED", "La demo no está inicializada en este entorno.", 503);
  return withSessionCookie(jsonOk({ userId: r.userId }), r.token, r.expiresAt);
});
