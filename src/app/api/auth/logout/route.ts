import { cookies } from "next/headers";
import { db } from "@/db/client";
import { handle, jsonOk } from "@/lib/api";
import { revokeSession, SESSION_COOKIE } from "@/server/auth/session";

export const POST = handle(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(db(), token);
  const res = jsonOk({ loggedOut: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
