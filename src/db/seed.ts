import { eq } from "drizzle-orm";
import type { Database } from "./client";
import {
  alerts,
  investorProfiles,
  memberships,
  opportunityListings,
  organizations,
  regulationVersions,
  users,
  watches,
} from "./schema";
import { generateDemoListings } from "@/modules/adapters/sources/demo";
import { runAnalysis } from "@/modules/analysis/run-analysis";
import { newId } from "@/modules/core/ids";
import { DEFAULT_INVESTOR_DNA } from "@/modules/investor/types";
import { parseIntake } from "@/modules/property/intake";
import { REGULATORY_REGISTRY } from "@/modules/regulatory/registry";
import { hashPassword } from "@/server/auth/password";
import type { TenantContext } from "@/server/context";
import { createDeal, markAnalyzing, persistAnalysis } from "@/server/services/deals";

export const DEMO_ORG_ID = "org_demo_flippia_sevilla";
export const DEMO_USER_ID = "usr_demo_flippia";

export interface SeedOptions {
  email?: string;
  password?: string;
  withAnalyses?: boolean;
  log?: (msg: string) => void;
}

/**
 * Reproducible DEMO seed: organization, user, Investor DNA, shared demo
 * listings, regulatory registry mirror and (optionally) analysed demo deals.
 * Everything synthetic is labelled DEMO.
 */
export async function seedDemo(
  d: Database,
  opts: SeedOptions = {},
): Promise<{ organizationId: string; userId: string; dealIds: string[] }> {
  const log = opts.log ?? (() => {});
  const email = opts.email ?? process.env.DEMO_USER_EMAIL ?? "demo@flippia.local";
  const password = opts.password ?? process.env.DEMO_USER_PASSWORD ?? "flippia-demo";

  await d
    .insert(organizations)
    .values({ id: DEMO_ORG_ID, name: "FlippIA Demo · Sevilla", slug: "flippia-demo", demo: 1 })
    .onConflictDoNothing();
  const existingUser = await d.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const userId = existingUser[0]?.id ?? DEMO_USER_ID;
  if (!existingUser.length)
    await d
      .insert(users)
      .values({ id: userId, email, name: "Inversor Demo", passwordHash: await hashPassword(password) });
  await d
    .insert(memberships)
    .values({ id: newId("mem"), organizationId: DEMO_ORG_ID, userId, role: "owner" })
    .onConflictDoNothing();
  const existingProfile = await d
    .select({ id: investorProfiles.id })
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, userId))
    .limit(1);
  if (!existingProfile.length)
    await d
      .insert(investorProfiles)
      .values({
        id: newId("inv"),
        organizationId: DEMO_ORG_ID,
        userId,
        dna: {
          ...DEFAULT_INVESTOR_DNA,
          capitalAvailable: 300_000,
          maxEquityPerDeal: 140_000,
          horizonMonths: 12,
          targetProfit: 25_000,
          targetRoe: 0.15,
          ticketMax: 400_000,
        },
        completed: true,
      });
  log("Organización y usuario demo listos.");

  const listings = generateDemoListings();
  for (const l of listings) {
    await d
      .insert(opportunityListings)
      .values({
        id: l.id,
        organizationId: null,
        sourceId: l.sourceId,
        microzoneId: l.microzoneId ?? null,
        assetUse: l.assetUse,
        askingPrice: l.askingPrice,
        status: "active",
        data: l,
        demo: true,
        publishedAt: l.publishedAt,
      })
      .onConflictDoUpdate({
        target: opportunityListings.id,
        set: { data: l, askingPrice: l.askingPrice, updatedAt: new Date() },
      });
  }
  log(`${listings.length} listados DEMO.`);

  for (const r of REGULATORY_REGISTRY) {
    for (const v of r.versions) {
      await d
        .insert(regulationVersions)
        .values({
          id: v.id,
          regulationId: r.id,
          jurisdictionCode: r.jurisdiction.code,
          topics: r.topics,
          effectiveFrom: v.effectiveFrom,
          status: v.status,
          data: v,
        })
        .onConflictDoNothing();
    }
  }
  log(`${REGULATORY_REGISTRY.length} normas registradas.`);

  const dealIds: string[] = [];
  if (opts.withAnalyses !== false) {
    const ctx: TenantContext = { organizationId: DEMO_ORG_ID, userId, role: "owner", db: d };
    const [profile] = await d
      .select({ dna: investorProfiles.dna })
      .from(investorProfiles)
      .where(eq(investorProfiles.userId, userId))
      .limit(1);
    const investor = profile?.dna ?? DEFAULT_INVESTOR_DNA;
    const demoIntakes = [
      "Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, 3º sin ascensor, para reformar por 255.000 €",
      "Analiza este local de 110 m2 en Calle San Jacinto 30, Triana por 165.000 €",
      "Piso de 128 m2 en Calle Asunción 20, Los Remedios, 4 habitaciones, para reformar por 335.000 €",
    ];
    for (const text of demoIntakes) {
      const intake = parseIntake(text);
      const deal = await createDeal(ctx, intake);
      const analysisId = await markAnalyzing(ctx, deal.id);
      const result = await runAnalysis({
        intake,
        organizationId: DEMO_ORG_ID,
        userId,
        dealId: deal.id,
        investor,
        analysisDate: "2026-01-15",
      });
      await persistAnalysis(ctx, analysisId, deal.id, result);
      dealIds.push(deal.id);
      log(`Deal demo analizado: ${result.property.summary}`);
    }
    const watched = listings.find((l) => l.priceHistory.length > 1) ?? listings[0]!;
    await d
      .insert(watches)
      .values({
        id: newId("wch"),
        organizationId: DEMO_ORG_ID,
        listingId: watched.id,
        userId,
        label: `Vigilar ${watched.title}`,
        rules: [{ kind: "meets_criteria" }, { kind: "price_drop_pct", value: 0.05 }],
        status: "triggered",
      });
    await d.insert(alerts).values([
      {
        id: newId("alr"),
        organizationId: DEMO_ORG_ID,
        userId,
        kind: "watch.price_drop_pct",
        severity: "opportunity",
        title: "Una propiedad vigilada ha reducido su precio",
        body: `${watched.title} (${watched.address}) ha pasado de ${watched.priceHistory[0]!.price.toLocaleString("es-ES")} € a ${watched.askingPrice.toLocaleString("es-ES")} €. Vuelve a cumplir tus criterios.`,
        payload: { listingId: watched.id, demo: true },
      },
      {
        id: newId("alr"),
        organizationId: DEMO_ORG_ID,
        userId,
        dealId: dealIds[1] ?? null,
        kind: "regulation.change",
        severity: "risk",
        title: "Una actualización normativa requiere revisar una estrategia",
        body: "Regulación municipal de viviendas de uso turístico (Sevilla): estado de tramitación pendiente de verificación. Afecta a la estrategia «Explotación turística» de un deal analizado.",
        payload: { regulationId: "reg.es.sevilla.vft-pgou", demo: true },
      },
    ]);
    log("Vigilancias y alertas demo creadas.");
  }
  return { organizationId: DEMO_ORG_ID, userId, dealIds };
}
