import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { auditEvents, investorProfiles, memberships, organizations, users } from "@/db/schema";
import { newId } from "@/modules/core/ids";
import { DEFAULT_INVESTOR_DNA } from "@/modules/investor/types";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";
import { createSession } from "./session";

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
  organizationName?: string;
  userAgent?: string;
}

export type AuthResult =
  | { ok: true; token: string; expiresAt: Date; userId: string; organizationId: string }
  | { ok: false; error: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function register(d: Database, input: RegisterInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email no válido." };
  const weak = validatePasswordStrength(input.password);
  if (weak) return { ok: false, error: weak };
  const existing = await d.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return { ok: false, error: "Ya existe una cuenta con ese email." };
  const userId = newId("usr");
  const orgId = newId("org");
  const orgName = input.organizationName?.trim() || `${input.name.trim().split(" ")[0] ?? "Mi"} · FlippIA`;
  await d.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({
        id: userId,
        email,
        name: input.name.trim(),
        passwordHash: await hashPassword(input.password),
      });
    await tx
      .insert(organizations)
      .values({ id: orgId, name: orgName, slug: `${slugify(orgName)}-${orgId.slice(-6)}` });
    await tx.insert(memberships).values({ id: newId("mem"), organizationId: orgId, userId, role: "owner" });
    await tx
      .insert(investorProfiles)
      .values({
        id: newId("inv"),
        organizationId: orgId,
        userId,
        dna: DEFAULT_INVESTOR_DNA,
        completed: false,
      });
    await tx
      .insert(auditEvents)
      .values({
        id: newId("aud"),
        organizationId: orgId,
        userId,
        action: "user.registered",
        targetType: "user",
        targetId: userId,
      });
  });
  const s = await createSession(d, { userId, organizationId: orgId, userAgent: input.userAgent });
  return { ok: true, ...s, userId, organizationId: orgId };
}

export async function login(
  d: Database,
  input: { email: string; password: string; userAgent?: string },
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const row = (await d.select().from(users).where(eq(users.email, email)).limit(1))[0];
  // Constant-time-ish: verify against a dummy hash when the user does not exist.
  const ok = row
    ? await verifyPassword(input.password, row.passwordHash)
    : (await verifyPassword(input.password, DUMMY_HASH), false);
  if (!row || !ok) return { ok: false, error: "Email o contraseña incorrectos." };
  const membership = (await d.select().from(memberships).where(eq(memberships.userId, row.id)).limit(1))[0];
  if (!membership) return { ok: false, error: "El usuario no pertenece a ninguna organización." };
  await d.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
  await d
    .insert(auditEvents)
    .values({
      id: newId("aud"),
      organizationId: membership.organizationId,
      userId: row.id,
      action: "user.login",
      targetType: "user",
      targetId: row.id,
    });
  const s = await createSession(d, {
    userId: row.id,
    organizationId: membership.organizationId,
    userAgent: input.userAgent,
  });
  return { ok: true, ...s, userId: row.id, organizationId: membership.organizationId };
}

export async function switchOrganization(
  d: Database,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const m = await d
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);
  return m.length > 0;
}

const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
