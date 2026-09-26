import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { runAnalysis } from "@/modules/analysis/run-analysis";
import type { AnalysisEvent } from "@/modules/agents/runtime/types";
import { logger } from "@/modules/core/logger";
import { parseIntake } from "@/modules/property/intake";
import { rateLimit } from "@/server/auth";
import { requireMutation } from "@/server/auth/current";
import { requireRole } from "@/server/context";
import {
  countRunningAnalyses,
  createDeal,
  getDeal,
  markAnalysisFailed,
  markAnalyzing,
  persistAnalysis,
} from "@/server/services/deals";
import { getInvestorDNA } from "@/server/services/investor";

const schema = z.object({ text: z.string().min(2).max(2000), dealId: z.string().optional() });

export const dynamic = "force-dynamic";
/** Upper bound for serverless hosts; the agent runtime's own budget is 150 s. */
export const maxDuration = 180;

/** Concurrent analyses per organization (the hourly limit alone lets one org hold many long runs). */
const MAX_CONCURRENT_PER_ORG = 3;

/**
 * Streams the agentic analysis as Server-Sent Events. The client renders
 * tasks, states and partial results; never private reasoning. On completion
 * the analysis is persisted and the deal id is sent in a `done` event.
 */
export async function POST(req: Request): Promise<Response> {
  let auth: Awaited<ReturnType<typeof requireMutation>>;
  try {
    auth = await requireMutation();
  } catch {
    return jsonError("UNAUTHORIZED", "No autenticado", 401);
  }
  const { ctx } = auth;
  try {
    requireRole(ctx, "analyst");
  } catch {
    return jsonError("FORBIDDEN", "Tu rol no permite lanzar análisis.", 403);
  }
  const rl = await rateLimit(ctx.db, `analyze:${ctx.organizationId}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return jsonError("RATE_LIMITED", "Límite de análisis por hora alcanzado.", 429);
  if ((await countRunningAnalyses(ctx)) >= MAX_CONCURRENT_PER_ORG)
    return jsonError("BUSY", "Ya hay varios análisis en curso. Espera a que terminen.", 429);
  const body = schema.safeParse(await readJson(req).catch(() => null));
  if (!body.success) return jsonError("VALIDATION", "Petición no válida.", 422);
  const intake = parseIntake(body.data.text);
  if (intake.intent !== "analyze_property") intake.intent = "analyze_property";
  // A re-analysis must target a deal that belongs to this tenant.
  let existingDealId: string | undefined;
  if (body.data.dealId) {
    try {
      existingDealId = (await getDeal(ctx, body.data.dealId)).id;
    } catch {
      return jsonError("NOT_FOUND", "Deal no encontrado.", 404);
    }
  }
  const { dna } = await getInvestorDNA(ctx);
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(new Error("Cliente desconectado")), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client went away; stop writing and let the abort signal cancel the run.
          closed = true;
          abort.abort(new Error("Cliente desconectado"));
        }
      };
      let dealId = existingDealId;
      let analysisId: string | undefined;
      try {
        const deal = dealId ? { id: dealId } : await createDeal(ctx, intake);
        dealId = deal.id;
        analysisId = await markAnalyzing(ctx, dealId);
        send("meta", { dealId, analysisId });
        const result = await runAnalysis({
          intake,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          dealId,
          investor: dna,
          signal: abort.signal,
          emit: (e: AnalysisEvent) => send("agent", stripPartial(e)),
        });
        await persistAnalysis(ctx, analysisId, dealId, result);
        send("done", {
          dealId,
          analysisId,
          headline: result.synthesis.headline,
          strategies: result.strategies.length,
          durationMs: result.durationMs,
        });
      } catch (e) {
        logger.error("analyze.failed", { error: e instanceof Error ? e.message : String(e) });
        if (dealId && analysisId)
          await markAnalysisFailed(ctx, analysisId, dealId, e instanceof Error ? e.message : "unknown").catch(
            () => {},
          );
        send("error", {
          message:
            "No hemos podido completar el análisis. Las fuentes consultadas y el resto de la aplicación siguen disponibles.",
        });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by the consumer
          }
        }
      }
    },
    cancel() {
      abort.abort(new Error("Cliente desconectado"));
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

/** Keep the stream light: partial outputs are summarised, not shipped whole. */
function stripPartial(e: AnalysisEvent): AnalysisEvent {
  if (e.type === "task.completed") {
    const { partial, ...rest } = e;
    void partial;
    return rest as AnalysisEvent;
  }
  return e;
}
