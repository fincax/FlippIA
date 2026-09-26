import { z } from "zod";
import { handle, jsonError, jsonOk, readJson } from "@/lib/api";
import { aiProvider } from "@/modules/ai/provider";
import { askProperty } from "@/modules/lia/ask";
import { requireMutation } from "@/server/auth/current";
import { getLatestAnalysis } from "@/server/services/deals";
import { appendMessage, getOrCreateConversation } from "@/server/services/lia";

const schema = z.object({ question: z.string().min(1).max(2000) });

/** Ask this property: LIA answers only from the deal's own context and engines. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { ctx } = await requireMutation();
  const { id } = await params;
  const { question } = schema.parse(await readJson(req));
  const analysis = await getLatestAnalysis(ctx, id);
  if (!analysis) return jsonError("NO_ANALYSIS", "Este deal todavía no tiene análisis.", 409);
  const conversation = await getOrCreateConversation(ctx, id);
  await appendMessage(ctx, conversation.id, "user", question);
  const answer = await askProperty(analysis, question, aiProvider());
  const saved = await appendMessage(ctx, conversation.id, "lia", answer.text, {
    kind: answer.kind,
    source: answer.source,
    citations: answer.citations,
  });
  return jsonOk({ answer, messageId: saved.id, conversationId: conversation.id });
});
