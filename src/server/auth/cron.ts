import { timingSafeEqual } from "node:crypto";

/** Scheduled endpoints accept `Authorization: Bearer $CRON_SECRET` and nothing else. */
export function cronAuthorized(req: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
