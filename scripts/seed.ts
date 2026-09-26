import "dotenv/config";
import { createDb } from "@/db/client";
import { seedDemo } from "@/db/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const d = createDb(url);
  const r = await seedDemo(d, { log: (m) => console.warn(m) });
  console.warn(`Seed completado. Organización ${r.organizationId}, ${r.dealIds.length} deals demo.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
