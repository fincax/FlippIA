import { handle, jsonOk, readJson } from "@/lib/api";
import type { InvestorDNA } from "@/modules/investor/types";
import { requireMutation, tenantContext } from "@/server/auth/current";
import { getInvestorDNA, saveInvestorDNA } from "@/server/services/investor";

export const GET = handle(async () => {
  const { ctx } = await tenantContext();
  return jsonOk(await getInvestorDNA(ctx));
});

export const POST = handle(async (req: Request) => {
  const { ctx } = await requireMutation();
  const dna = await readJson<InvestorDNA>(req);
  await saveInvestorDNA(ctx, dna);
  return jsonOk({ saved: true });
});
