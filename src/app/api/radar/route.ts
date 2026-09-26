import { handle, jsonOk } from "@/lib/api";
import { tenantContext } from "@/server/auth/current";
import { getInvestorDNA } from "@/server/services/investor";
import { runRadar } from "@/server/services/radar";

export const GET = handle(async (req: Request) => {
  const { ctx } = await tenantContext();
  const url = new URL(req.url);
  const { dna } = await getInvestorDNA(ctx);
  const hits = await runRadar(ctx, dna, { includeNonMatching: url.searchParams.get("include") === "all" });
  return jsonOk(
    hits.map((h) => ({
      listing: h.listing,
      score: h.score,
      why: h.why,
      underwriting: {
        ...h.underwriting,
        microzone: { id: h.underwriting.microzone.id, name: h.underwriting.microzone.name },
      },
    })),
  );
});
