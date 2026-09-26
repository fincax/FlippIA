import "dotenv/config";
import { createDb } from "@/db/client";
import { seedDemo } from "@/db/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  // The demo seed creates a user with a known password. Never run it against
  // production by accident: require an explicit opt-in there.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "true")
    throw new Error("Refusing to seed demo data in production. Set SEED_DEMO=true to confirm.");
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.DEMO_USER_PASSWORD ?? "flippia-demo") === "flippia-demo"
  )
    throw new Error("Set a private DEMO_USER_PASSWORD before seeding the demo user in production.");
  const d = createDb(url);
  const r = await seedDemo(d, { log: (m) => console.warn(m) });
  console.warn(`Seed completado. Organización ${r.organizationId}, ${r.dealIds.length} deals demo.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
