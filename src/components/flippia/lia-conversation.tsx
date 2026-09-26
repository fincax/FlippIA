"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@/components/ds";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client";
import type { LiaAnswer } from "@/modules/lia/ask";

interface Msg {
  id: string;
  role: "user" | "lia" | "system";
  content: string;
  structured?: Record<string, unknown>;
}

const SUGGESTIONS = [
  "¿Qué es lo peor de esta inversión?",
  "¿Por qué consideras razonable ese ARV?",
  "Enséñame las comparables",
  "¿Qué pasa si pago 20.000 € más?",
  "¿Qué normativa afecta al cambio de uso?",
  "¿Qué datos te faltan?",
  "¿Hasta cuánto puedo pagar?",
  "¿Por qué esta estrategia está primero?",
];

/** Ask this property: contextual conversation, deal-only context. */
export function LiaConversation({
  dealId,
  initial,
  address,
}: {
  dealId: string;
  initial: Msg[];
  address: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages]);

  async function send(q = text) {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    setBusy(true);
    setMessages((m) => [...m, { id: `tmp_${Date.now()}`, role: "user", content: question }]);
    const r = await api<{ answer: LiaAnswer; messageId: string }>(`/api/deals/${dealId}/ask`, {
      body: { question },
    });
    setBusy(false);
    if (r.ok && r.data)
      setMessages((m) => [
        ...m,
        {
          id: r.data!.messageId,
          role: "lia",
          content: r.data!.answer.text,
          structured: { kind: r.data!.answer.kind, source: r.data!.answer.source },
        },
      ]);
    else
      setMessages((m) => [
        ...m,
        { id: `err_${Date.now()}`, role: "system", content: r.error?.message ?? "No he podido responder." },
      ]);
  }

  return (
    <div className="max-w-3xl">
      <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3 mb-1">Ask this property</div>
      <h2 className="font-display text-2xl mb-4">{address}</h2>
      <div className="space-y-3 min-h-40">
        {messages.length === 0 ? (
          <p className="text-sm text-fg-2">
            Pregunta lo que quieras sobre este activo. Respondo únicamente con el contexto del deal y sus
            motores: cifras, comparables, normativa con fecha, riesgos, hipótesis.
          </p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-[var(--radius-lg)] px-4 py-3 text-sm max-w-[92%] anim-rise",
              m.role === "user"
                ? "ml-auto bg-surface-raised text-fg"
                : m.role === "lia"
                  ? "bg-surface border border-line text-fg"
                  : "bg-danger/10 text-danger",
            )}
          >
            {m.role === "lia" ? (
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent mb-1">
                LIA
                {m.structured?.source ? (
                  <span className="text-fg-3">
                    {" "}
                    ·{" "}
                    {String(m.structured.source) === "engine"
                      ? "motor"
                      : String(m.structured.source) === "model"
                        ? "modelo"
                        : "plantilla"}
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
          </div>
        ))}
        {busy ? <div className="text-[12px] text-fg-3 anim-pulse">LIA está consultando el deal…</div> : null}
        <div ref={endRef} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            className="rounded-full border border-line px-2.5 py-1 text-[12px] text-fg-2 hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pregunta a LIA sobre este activo…"
          aria-label="Pregunta"
        />
        <Button type="submit" variant="accent" loading={busy}>
          Preguntar
        </Button>
      </form>
    </div>
  );
}
