import { z } from "zod";
import { handle, jsonOk } from "@/lib/api";
import { applyBriefToDna, parseProjectBrief } from "@/modules/radar/brief";
import { tenantContext } from "@/server/auth/current";
import { getInvestorDNA } from "@/server/services/investor";
import { runRadar } from "@/server/services/radar";

const querySchema = z.object({
  include: z.enum(["all"]).optional(),
  /** Spoken objective or project brief; overrides the saved DNA for this search. */
  q: z.string().min(1).max(2000).optional(),
});

export const GET = handle(async (req: Request) => {
  const { ctx } = await tenantContext();
  const url = new URL(req.url);
  const query = querySchema.parse({
    include: url.searchParams.get("include") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  const { dna: saved } = await getInvestorDNA(ctx);
  const brief = query.q ? parseProjectBrief(query.q) : undefined;
  const dna = brief ? applyBriefToDna(saved, brief) : saved;
  const hits = await runRadar(ctx, dna, { includeNonMatching: query.include === "all", brief });
  // Same array as always; a brief adds `bestStrategyId` and `strategies` to every hit.
  return jsonOk(
    hits.map((h) => ({
      listing: h.listing,
      score: h.score,
      why: h.why,
      bestStrategyId: h.bestStrategyId ?? null,
      strategies: h.strategies ?? [],
      underwriting: {
        ...h.underwriting,
        microzone: { id: h.underwriting.microzone.id, name: h.underwriting.microzone.name },
      },
    })),
  );
});
