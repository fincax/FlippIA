import { LiaConversation } from "@/components/flippia/lia-conversation";
import { loadDeal } from "@/server/deal-page";
import { getOrCreateConversation, listMessages } from "@/server/services/lia";

export default async function LiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, analysis } = await loadDeal(id);
  if (!analysis) return null;
  const conversation = await getOrCreateConversation(ctx, id);
  const messages = await listMessages(ctx, conversation.id);
  return (
    <LiaConversation
      dealId={id}
      initial={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        structured: m.structured ?? undefined,
      }))}
      address={analysis.property.property.address.raw}
    />
  );
}
